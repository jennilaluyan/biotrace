import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft,
    Building2,
    Calendar,
    Hash,
    Mail,
    MapPin,
    Phone,
    User,
    ShieldAlert,
    RefreshCw,
    Check,
    X,
    Eye,
} from "lucide-react";

import { clientApprovalsService, type ClientApplication } from "../../services/clientApprovals";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate, formatDateOnly } from "../../utils/date";

import ClientApprovalDecisionModal from "../../components/clients/ClientApprovalDecisionModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type ApiErrorLike = {
    response?: { data?: any };
    data?: any;
    message?: string;
};

function getApiMessage(err: unknown, fallback: string) {
    const e = err as ApiErrorLike;
    const data = e?.response?.data ?? e?.data;

    const details = data?.details ?? data?.errors;
    if (details && typeof details === "object") {
        const k = Object.keys(details)[0];
        const v = k ? details[k] : undefined;
        if (Array.isArray(v) && v[0]) return String(v[0]);
        if (typeof v === "string" && v) return v;
    }

    return data?.message ?? data?.error ?? (typeof e?.message === "string" ? e.message : null) ?? fallback;
}

function unwrapList<T>(res: any): T[] {
    const x = res?.data ?? res;
    if (Array.isArray(x)) return x;

    if (x && typeof x === "object") {
        const candidates = [(x as any).data, (x as any).items, (x as any).rows, (x as any).results];
        for (const c of candidates) {
            if (Array.isArray(c)) return c;
            if (c && typeof c === "object" && Array.isArray((c as any).data)) return (c as any).data;
        }
    }

    return [];
}

function initialsFromName(name?: string | null) {
    if (!name) return "C";
    const parts = name.split(" ").filter(Boolean);
    const a = parts[0]?.[0]?.toUpperCase() ?? "C";
    const b = parts[1]?.[0]?.toUpperCase() ?? "";
    return `${a}${b}` || "C";
}

function typeBadgeClass(type: ClientApplication["type"] | null | undefined) {
    return type === "institution"
        ? "bg-indigo-50 text-indigo-700 border-indigo-100"
        : "bg-emerald-50 text-emerald-700 border-emerald-100";
}

type GenderValue = "female" | "male" | "other";

function normalizeGenderValue(value?: string | null): GenderValue | "" {
    const normalized = String(value ?? "").trim().toLowerCase();

    if (!normalized) return "";
    if (["female", "fmeale", "perempuan", "wanita"].includes(normalized)) return "female";
    if (["male", "laki-laki", "laki laki", "lelaki", "pria"].includes(normalized)) return "male";
    if (["other", "lainnya", "lain-lain", "lain lain"].includes(normalized)) return "other";

    return "";
}

function typeLabel(t: TFunction, type: ClientApplication["type"] | null | undefined) {
    return type === "institution"
        ? t("clients.badges.institution", "Institution")
        : t("clients.badges.individual", "Individual");
}

function genderLabel(t: TFunction, value?: string | null) {
    const normalized = normalizeGenderValue(value);

    if (normalized === "female") return t("auth.female", "Female");
    if (normalized === "male") return t("auth.male", "Male");
    if (normalized === "other") return t("auth.other", "Other");

    return "—";
}

export const ClientApprovalDetailPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const { user } = useAuth();
    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canApproveClients = roleId === ROLE_ID.ADMIN;

    const numericId = useMemo(() => {
        const n = Number(id);
        return Number.isFinite(n) && n > 0 ? n : null;
    }, [id]);

    const [item, setItem] = useState<ClientApplication | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"approve" | "reject">("approve");
    const [modalBusy, setModalBusy] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const goBack = useCallback(() => {
        const idx = (window.history.state as any)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate("/clients/approvals", { replace: true });
    }, [navigate]);

    const load = useCallback(async () => {
        if (!canApproveClients) {
            setLoading(false);
            return;
        }

        if (!numericId) {
            setPageError(t("clients.approvals.detail.invalidUrl", "Invalid application URL."));
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setPageError(null);

            // Robust approach without assuming a getById endpoint exists:
            // load pending list then find the requested application.
            const res = await clientApprovalsService.listPending();
            const list = unwrapList<ClientApplication>(res);

            const found = list.find((x) => Number(x.client_application_id) === numericId) ?? null;
            setItem(found);

            if (!found) {
                setPageError(t("clients.approvals.detail.notFound", "This pending application was not found (it may have been processed already)."));
            }
        } catch (err) {
            setItem(null);
            setPageError(getApiMessage(err, t("clients.approvals.detail.loadFailed", "Failed to load application details.")));
        } finally {
            setLoading(false);
        }
    }, [canApproveClients, numericId, t]);

    useEffect(() => {
        void load();
    }, [load]);

    const initials = useMemo(() => initialsFromName(item?.name), [item?.name]);

    const openApprove = useCallback(() => {
        if (!item) return;
        setModalMode("approve");
        setModalError(null);
        setModalOpen(true);
    }, [item]);

    const openReject = useCallback(() => {
        if (!item) return;
        setModalMode("reject");
        setModalError(null);
        setModalOpen(true);
    }, [item]);

    const closeModal = useCallback(() => {
        if (modalBusy) return;
        setModalOpen(false);
        setModalError(null);
    }, [modalBusy]);

    const onConfirmModal = useCallback(async () => {
        const appId = item?.client_application_id;
        if (!appId) return;

        try {
            setModalBusy(true);
            setModalError(null);

            if (modalMode === "approve") {
                await clientApprovalsService.approve(appId);
            } else {
                // Requirement: no rejection note
                await clientApprovalsService.reject(appId);
            }

            setModalOpen(false);

            // After processing, go back to approvals list (safer UX).
            navigate("/clients/approvals", { replace: true });
        } catch (err) {
            const fallback =
                modalMode === "approve"
                    ? t("clients.approvals.errors.approveFailed", "Approve failed. Please try again.")
                    : t("clients.approvals.errors.rejectFailed", "Reject failed. Please try again.");

            setModalError(getApiMessage(err, fallback));
        } finally {
            setModalBusy(false);
        }
    }, [item, modalMode, navigate, t]);

    if (!canApproveClients) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <div className="bg-red-50 p-4 rounded-full mb-3">
                    <ShieldAlert className="h-8 w-8 text-red-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-1">{t("clients.forbidden.title", "Access denied")}</h1>
                <p className="text-sm text-gray-600 max-w-md">
                    {t(
                        "clients.forbidden.bodyClients",
                        "Your role ({{role}}) is not allowed to access the Clients module.",
                        { role: roleLabel }
                    )}
                </p>
                <button
                    type="button"
                    onClick={goBack}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:translate-y-px transition"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {t("back", "Back")}
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh] pb-20">
            <div className="px-0 py-2">
                <button
                    type="button"
                    onClick={goBack}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:translate-y-px transition"
                >
                    <ArrowLeft size={16} />
                    {t("back", "Back")}
                </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        {t("clients.approvals.detail.header", "Client application")}
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        {t("clients.approvals.detail.subheader", "Review details before approving or rejecting.")}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="btn-outline inline-flex items-center gap-2"
                        onClick={load}
                        disabled={loading}
                        title={t("common.refresh", "Refresh")}
                    >
                        <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
                        {t("common.refresh", "Refresh")}
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={openApprove}
                        disabled={loading || !item}
                    >
                        <Check className="h-4 w-4" />
                        {t("common.approve", "Approve")}
                    </button>

                    <button
                        type="button"
                        className="lims-btn-danger inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={openReject}
                        disabled={loading || !item}
                    >
                        <X className="h-4 w-4" />
                        {t("common.reject", "Reject")}
                    </button>
                </div>
            </div>

            <div className="lims-detail-shell mt-2">
                {loading && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 py-10 justify-center">
                        <RefreshCw className="animate-spin h-4 w-4" />
                        {t("loading", "Loading...")}
                    </div>
                )}

                {pageError && !loading && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
                        <ShieldAlert className="h-5 w-5 shrink-0" />
                        {pageError}
                    </div>
                )}

                {!loading && !pageError && item && (
                    <div className="space-y-8">
                        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
                            <div className="w-full lg:w-1/3 bg-gray-50/50 rounded-2xl p-5 border border-gray-100 flex flex-col items-center text-center">
                                <div className="h-20 w-20 rounded-full bg-linear-to-br from-primary to-primary-soft flex items-center justify-center text-white text-2xl font-bold shadow-md mb-3">
                                    {initials}
                                </div>

                                <h2 className="text-xl font-bold text-gray-900 wrap-break-word w-full px-2">{item.name}</h2>
                                <p className="text-xs text-gray-500 mb-3">
                                    {item.type === "institution"
                                        ? t("clients.detail.type.institutionalClient", "Institutional client")
                                        : t("clients.detail.type.individualClient", "Individual client")}
                                </p>

                                <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                                    <span className={cx("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border", typeBadgeClass(item.type))}>
                                        {typeLabel(t, item.type)}
                                    </span>

                                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                        <Hash className="h-3 w-3" />
                                        #{item.client_application_id}
                                    </span>

                                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                                        <Eye className="h-3 w-3" />
                                        {t("clients.approvals.statusPending", "Pending review")}
                                    </span>
                                </div>

                                <div className="w-full space-y-3 text-sm text-left bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                                    {item.email && (
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                                                <Mail className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{t("clients.detail.labels.email", "Email")}</div>
                                                <div className="font-medium text-gray-900 break-all">{item.email}</div>
                                            </div>
                                        </div>
                                    )}

                                    {item.phone && (
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                                                <Phone className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{t("clients.detail.labels.phone", "Phone")}</div>
                                                <div className="font-medium text-gray-900 truncate">{item.phone}</div>
                                            </div>
                                        </div>
                                    )}

                                    {(item.address_domicile || item.address_ktp) && (
                                        <div className="flex items-start gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                                                <MapPin className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{t("clients.detail.labels.address", "Address")}</div>

                                                {item.address_domicile && (
                                                    <div>
                                                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 rounded mr-1">{t("clients.detail.labels.domicile", "Domicile")}</span>
                                                        <span className="text-gray-900">{item.address_domicile}</span>
                                                    </div>
                                                )}

                                                {item.address_ktp && (
                                                    <div>
                                                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 rounded mr-1">{t("clients.detail.labels.ktp", "KTP")}</span>
                                                        <span className="text-gray-900">{item.address_ktp}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 w-full space-y-6">
                                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                                    <h3 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-50">
                                        {t("clients.approvals.detail.basicTitle", "Basic information")}
                                    </h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                        <div>
                                            <div className="lims-detail-label">{t("clients.detail.labels.clientType", "Client type")}</div>
                                            <div className="lims-detail-value">{typeLabel(t, item.type)}</div>
                                        </div>

                                        <div>
                                            <div className="lims-detail-label">{t("clients.approvals.detail.applicationId", "Application ID")}</div>
                                            <div className="lims-detail-value font-mono">#{item.client_application_id}</div>
                                        </div>

                                        <div className="md:col-span-2">
                                            <div className="lims-detail-label inline-flex items-center gap-1">
                                                <Calendar className="h-3 w-3" /> {t("clients.approvals.detail.requestedAt", "Requested at")}
                                            </div>
                                            <div className="lims-detail-value">{item.created_at ? formatDate(item.created_at) : "—"}</div>
                                        </div>
                                    </div>
                                </div>

                                {item.type === "individual" ? (
                                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-50 flex items-center gap-2">
                                            <User className="h-4 w-4 text-gray-400" />
                                            {t("clients.detail.personalTitle", "Personal profile")}
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.nationalId", "National ID (NIK)")}</div>
                                                <div className="lims-detail-value font-mono">{item.national_id || "—"}</div>
                                            </div>

                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.dob", "Date of birth")}</div>
                                                <div className="lims-detail-value">{item.date_of_birth ? formatDateOnly(item.date_of_birth) : "—"}</div>
                                            </div>

                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.gender", "Gender")}</div>
                                                <div className="lims-detail-value">{genderLabel(t, item.gender)}</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-50 flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-gray-400" />
                                            {t("clients.detail.institutionTitle", "Institution information")}
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                            <div className="md:col-span-2">
                                                <div className="lims-detail-label">{t("clients.detail.labels.institutionName", "Institution name")}</div>
                                                <div className="lims-detail-value font-semibold">{item.institution_name || "—"}</div>
                                            </div>

                                            <div className="md:col-span-2">
                                                <div className="lims-detail-label">{t("clients.detail.labels.institutionAddress", "Institution address")}</div>
                                                <div className="lims-detail-value">{item.institution_address || "—"}</div>
                                            </div>

                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.contactPerson", "Contact person")}</div>
                                                <div className="lims-detail-value">{item.contact_person_name || "—"}</div>
                                            </div>

                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.contactPersonContact", "Contact person phone / email")}</div>
                                                <div className="lims-detail-value">
                                                    {item.contact_person_phone || "—"}
                                                    {item.contact_person_email ? <span className="text-gray-400 mx-1">•</span> : null}
                                                    {item.contact_person_email}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ClientApprovalDecisionModal
                open={modalOpen}
                mode={modalMode}
                item={item}
                busy={modalBusy}
                error={modalError}
                onClose={closeModal}
                onConfirm={onConfirmModal}
            />
        </div>
    );
};