import { useCallback, useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";
import { sampleService, type Sample } from "../../services/samples";
import { apiGet, apiPost, apiPatch } from "../../services/api";
import { cx } from "../../utils/cx";

import {
    approveSampleIdChange,
    rejectSampleIdChange,
    type SampleIdChangeRow,
    getLatestSampleIdChangeBySampleId,
} from "../../services/sampleIdChanges";
import SampleIdChangeDecisionModal from "../../components/samples/SampleIdChangeDecisionModal";

import { UpdateRequestStatusModal } from "../../components/samples/UpdateRequestStatusModal";
import { IntakeChecklistModal } from "../../components/intake/IntakeChecklistModal";
import AssignSampleIdModal from "../../components/samples/AssignSampleIdModal";
import FinalizeApprovedSampleIdModal from "../../components/samples/FinalizeApprovedSampleIdModal";

import { SampleRequestInfoTab } from "../../components/samples/requests/SampleRequestInfoTab";
import { SampleRequestWorkflowTab } from "../../components/samples/requests/SampleRequestWorkflowTab";

function safeApiMessage(err: any, fallback: string) {
    const data = err?.response?.data ?? err?.data ?? null;

    if (data && typeof data === "object") {
        const msg = (data as any).message ?? (data as any).error ?? null;
        if (typeof msg === "string" && msg.trim()) return msg.trim();
    }

    if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
    return fallback;
}

function normalizeStatusToken(raw?: string | null) {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function wordsFromToken(token: string) {
    return token
        .replace(/_/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function compactRequestStatusToken(token: string, locale: string) {
    const isId = String(locale || "").toLowerCase().startsWith("id");

    const map: Record<string, { en: string; id: string }> = {
        submitted: { en: "submitted", id: "terkirim" },
        ready_for_delivery: { en: "ready", id: "siap" },
        physically_received: { en: "received", id: "diterima" },
        rejected: { en: "rejected", id: "ditolak" },
        needs_revision: { en: "needs revision", id: "perlu revisi" },
        returned: { en: "returned", id: "dikembalikan" },

        awaiting_verification: { en: "verify", id: "verifikasi" },
        waiting_sample_id_assignment: { en: "waiting", id: "menunggu" },
        sample_id_pending_verification: { en: "verify", id: "verifikasi" },
        sample_id_approved_for_assignment: { en: "approved", id: "disetujui" },
        approved_for_assignment: { en: "approved", id: "disetujui" },

        in_transit_to_collector: { en: "transit", id: "transit" },
        under_inspection: { en: "inspect", id: "inspeksi" },
        returned_to_admin: { en: "returned to admin", id: "dikembalikan ke admin" },

        intake_checklist_passed: { en: "intake", id: "intake" },
        intake_validated: { en: "validated", id: "validasi" },
    };

    return (map[token]?.[isId ? "id" : "en"] ?? wordsFromToken(token)).toLowerCase();
}

function requestStatusLabel(t: TFunction, raw?: string | null, locale = "en") {
    const token = normalizeStatusToken(raw);
    if (!token) return "-";

    const map: Record<string, string> = {
        draft: "requestStatus.draft",
        submitted: "requestStatus.submitted",
        rejected: "requestStatus.rejected",
        returned: "requestStatus.returned",
        needs_revision: "requestStatus.needsRevision",

        ready_for_delivery: "requestStatus.readyForDelivery",
        physically_received: "requestStatus.physicallyReceived",

        in_transit_to_collector: "requestStatus.inTransitToCollector",
        under_inspection: "requestStatus.underInspection",
        inspection_failed: "requestStatus.inspectionFailed",
        returned_to_admin: "requestStatus.returnedToAdmin",

        intake_checklist_passed: "requestStatus.intakeChecklistPassed",
        awaiting_verification: "requestStatus.awaitingVerification",
        intake_validated: "requestStatus.intakeValidated",

        waiting_sample_id_assignment: "requestStatus.waitingSampleIdAssignment",
        sample_id_pending_verification: "requestStatus.sampleIdPendingVerification",
        sample_id_approved_for_assignment: "requestStatus.sampleIdApprovedForAssignment",
        approved_for_assignment: "requestStatus.sampleIdApprovedForAssignment",
    };

    const fallback = compactRequestStatusToken(token, locale);
    const key = map[token];

    if (!key) return fallback;

    return wordsFromToken(t(key, { defaultValue: fallback }));
}

function StatusPill({ value, t, locale }: { value?: string | null; t: TFunction; locale: string }) {
    const token = normalizeStatusToken(value);

    const tones: Record<string, string> = {
        draft: "bg-slate-50 text-slate-700 border-slate-200",
        submitted: "bg-blue-50 text-blue-700 border-blue-200",
        rejected: "bg-rose-50 text-rose-700 border-rose-200",
        returned: "bg-amber-50 text-amber-800 border-amber-200",
        needs_revision: "bg-rose-50 text-rose-700 border-rose-200",
        ready_for_delivery: "bg-indigo-50 text-indigo-700 border-indigo-200",
        physically_received: "bg-emerald-50 text-emerald-700 border-emerald-200",
        in_transit_to_collector: "bg-amber-50 text-amber-800 border-amber-200",
        under_inspection: "bg-amber-50 text-amber-800 border-amber-200",
        inspection_failed: "bg-rose-50 text-rose-700 border-rose-200",
        returned_to_admin: "bg-slate-50 text-slate-700 border-slate-200",
        intake_checklist_passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
        awaiting_verification: "bg-violet-50 text-violet-700 border-violet-200",
        intake_validated: "bg-indigo-50 text-indigo-700 border-indigo-200",
        waiting_sample_id_assignment: "bg-slate-50 text-slate-700 border-slate-200",
        sample_id_pending_verification: "bg-amber-50 text-amber-800 border-amber-200",
        sample_id_approved_for_assignment: "bg-emerald-50 text-emerald-700 border-emerald-200",
        approved_for_assignment: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };

    const tone = tones[token] || "bg-gray-50 text-gray-600 border-gray-200";
    const label = requestStatusLabel(t, value, locale);

    return (
        <span className={cx("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border", tone)}>
            {label}
        </span>
    );
}

function SmallButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    const { className, ...rest } = props;
    return (
        <button
            {...rest}
            className={cx(
                "lims-btn",
                "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap inline-flex items-center gap-2",
                rest.disabled ? "opacity-60 cursor-not-allowed" : "",
                className
            )}
        />
    );
}

function TabButton(props: { active: boolean; children: ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={cx(
                "px-4 py-2 rounded-xl text-sm font-semibold transition",
                props.active ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-800"
            )}
        >
            {props.children}
        </button>
    );
}

function extractWorkflowLogs(res: any): any[] | null {
    if (Array.isArray(res)) return res;

    if (res && typeof res === "object") {
        if (Array.isArray((res as any).data)) return (res as any).data;

        const d = (res as any).data;
        if (d && typeof d === "object" && Array.isArray(d.data)) return d.data;

        if (Array.isArray((res as any).items)) return (res as any).items;
    }

    return null;
}

function toSidRow(root: any, sidRaw: any): SampleIdChangeRow | null {
    if (!sidRaw) return null;

    const changeId = Number(
        sidRaw?.change_request_id ??
        sidRaw?.change_requestId ??
        sidRaw?.sample_id_change_request_id ??
        sidRaw?.sampleIdChangeRequestId ??
        sidRaw?.sample_id_change_id ??
        sidRaw?.change_id ??
        sidRaw?.changeId ??
        sidRaw?.id ??
        sidRaw?.change_request?.id ??
        root?.sample_id_change_request_id ??
        root?.sample_id_change_id ??
        root?.change_request_id ??
        root?.change_request?.id ??
        0
    );

    if (!Number.isFinite(changeId) || changeId <= 0) return null;

    const suggested = sidRaw?.suggested_lab_sample_code ?? sidRaw?.suggested_sample_id ?? sidRaw?.suggested ?? null;
    const proposed = sidRaw?.proposed_lab_sample_code ?? sidRaw?.proposed_sample_id ?? sidRaw?.proposed ?? null;

    const clientName = root?.client?.name ?? root?.client_name ?? (root?.client_id ? `Client #${root?.client_id}` : null);
    const clientEmail = root?.client?.email ?? root?.client_email ?? null;

    return {
        change_request_id: changeId,
        id: changeId,
        sample_id_change_id: changeId,

        sample_id: Number(root?.sample_id ?? root?.id ?? 0) || undefined,
        request_id: Number(root?.sample_id ?? root?.id ?? 0) || undefined,

        status: sidRaw?.status ?? "PENDING",

        suggested_sample_id: suggested ? String(suggested) : null,
        suggested_lab_sample_code: suggested ? String(suggested) : null,

        proposed_sample_id: proposed ? String(proposed) : null,
        proposed_lab_sample_code: proposed ? String(proposed) : null,

        client_name: clientName ? String(clientName) : null,
        client_email: clientEmail ? String(clientEmail) : null,
        workflow_group: root?.workflow_group ?? null,
    };
}

function resolveRoleIdFromUser(user: any): number {
    const pickRoleId = (obj: any): number | null => {
        if (!obj) return null;

        const candidates = [
            obj.role_id,
            obj.roleId,
            obj.role?.role_id,
            obj.role?.id,
            obj.role?.roleId,
            obj.user?.role_id,
            obj.user?.roleId,
            obj.data?.role_id,
            obj.data?.roleId,
            obj.staff?.role_id,
            obj.staff?.roleId,
        ];

        for (const c of candidates) {
            const n = Number(c);
            if (Number.isFinite(n) && n > 0) return n;
        }

        return null;
    };

    const fromUser = pickRoleId(user);
    if (fromUser) return fromUser;

    try {
        const keys = ["biotrace_auth", "biotrace_user", "auth", "user", "staff"];
        for (const k of keys) {
            const raw = localStorage.getItem(k);
            if (!raw) continue;

            const parsed = JSON.parse(raw);
            const fromStorage = pickRoleId(parsed);
            if (fromStorage) return fromStorage;
        }
    } catch {
        // ignore
    }

    const fallback = Number(getUserRoleId(user));
    return Number.isFinite(fallback) ? fallback : 0;
}

export default function SampleRequestDetailPage() {
    const { t, i18n } = useTranslation();
    const locale = i18n.language || "en";

    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();

    const requestId = Number(id);

    const roleId = useMemo(() => resolveRoleIdFromUser(user), [user]);
    const roleLabel = useMemo(() => getUserRoleLabel(user), [user]);

    const canView = useMemo(
        () =>
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.LAB_HEAD,
        [roleId]
    );

    const goBack = useCallback(() => {
        const idx = (window.history.state as any)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate("/samples/requests", { replace: true });
    }, [navigate]);

    const [workflowLogs, setWorkflowLogs] = useState<any[] | null>(null);
    const [tab, setTab] = useState<"info" | "workflow">("info");

    const [sample, setSample] = useState<Sample | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageRefreshing, setPageRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [acceptModalOpen, setAcceptModalOpen] = useState(false);
    const [returnModalOpen, setReturnModalOpen] = useState(false);
    const [rejectModalOpen, setRejectModalOpen] = useState(false);

    const [intakeOpen, setIntakeOpen] = useState(false);

    const [assignOpen, setAssignOpen] = useState(false);
    const [finalizeApprovedOpen, setFinalizeApprovedOpen] = useState(false);
    const [assignFlash, setAssignFlash] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);

    const [wfBusy, setWfBusy] = useState(false);
    const [wfError, setWfError] = useState<string | null>(null);
    const [verifyBusy, setVerifyBusy] = useState(false);
    const [verifyOpen, setVerifyOpen] = useState(false);
    const [verifyApplyToBatch, setVerifyApplyToBatch] = useState(false);

    const [sidFetchedRaw, setSidFetchedRaw] = useState<any | null>(null);
    const [sidActiveRow, setSidActiveRow] = useState<SampleIdChangeRow | null>(null);
    const [sidPickOpen, setSidPickOpen] = useState(false);

    const [sidModalOpen, setSidModalOpen] = useState(false);
    const [sidModalMode, setSidModalMode] = useState<"approve" | "reject">("approve");
    const [sidBusy, setSidBusy] = useState(false);

    const labSampleCode = (sample as any)?.lab_sample_code ?? null;
    const verifiedAt = (sample as any)?.verified_at ?? null;
    const displayRequestId = Number((sample as any)?.sample_id ?? requestId);

    const batchSummary = (sample as any)?.batch_summary ?? null;
    const batchId = (sample as any)?.request_batch_id ?? null;
    const batchTotal = Number(batchSummary?.batch_total ?? (sample as any)?.request_batch_total ?? 1);
    const batchActiveTotal = Number(batchSummary?.batch_active_total ?? (sample as any)?.request_batch_total ?? 1);
    const hasActiveBatch = !!batchId && batchActiveTotal > 1;
    const batchItemsPreview = useMemo(() => {
        const items = (sample as any)?.batch_items;
        return Array.isArray(items) && items.length > 0 ? items : sample ? [sample] : [];
    }, [sample]);

    const requestStatusKey = normalizeStatusToken((sample as any)?.request_status ?? "");
    const canUseReturnAction =
        requestStatusKey === "inspection_failed" || requestStatusKey === "returned_to_admin";

    const sidRaw =
        sidFetchedRaw ??
        (sample as any)?.sample_id_change ??
        (sample as any)?.sample_id_change_request ??
        (sample as any)?.sampleIdChange ??
        null;

    const sidRow: SampleIdChangeRow | null = useMemo(() => {
        if (!sample) return null;
        return toSidRow(sample as any, sidRaw);
    }, [sample, sidRaw]);

    const load = useCallback(
        async (opts?: { silent?: boolean }) => {
            if (!canView) {
                setLoading(false);
                return;
            }

            if (!Number.isFinite(requestId) || requestId <= 0) {
                setError(t("samples.pages.requestDetail.errors.invalidUrl", { defaultValue: "Invalid request URL." }));
                setLoading(false);
                return;
            }

            const silent = !!opts?.silent;

            try {
                if (!silent) setLoading(true);
                setError(null);

                const data = await sampleService.getById(requestId, true);
                setSample(data);

                try {
                    const res = await apiGet<any>(`/v1/samples/${requestId}/workflow-logs`);
                    setWorkflowLogs(extractWorkflowLogs(res) ?? []);
                } catch {
                    setWorkflowLogs(null);
                }
            } catch (err: any) {
                setError(
                    safeApiMessage(
                        err,
                        t("samples.pages.requestDetail.errors.loadFailed", {
                            defaultValue: "Failed to load request detail.",
                        })
                    )
                );
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [canView, requestId, t]
    );

    useEffect(() => {
        void load();
    }, [load]);

    const refresh = useCallback(async () => {
        try {
            setPageRefreshing(true);
            await load({ silent: true });
        } finally {
            setPageRefreshing(false);
        }
    }, [load]);

    const openAcceptModal = () => {
        if (!Number.isFinite(requestId) || requestId <= 0) return;
        setWfError(null);
        setAcceptModalOpen(true);
    };

    const doMarkPhysicallyReceived = async () => {
        if (!Number.isFinite(requestId) || requestId <= 0) return;

        try {
            setWfBusy(true);
            setWfError(null);

            await apiPatch(`/v1/samples/${requestId}/physical-workflow`, {
                action: "admin_received_from_client",
                note: null,
            });

            await load({ silent: true });
            setTab("workflow");
        } catch (err: any) {
            setWfError(
                safeApiMessage(
                    err,
                    t("samples.pages.requestDetail.errors.updateStatusFailed", {
                        defaultValue: "Failed to update status.",
                    })
                )
            );
        } finally {
            setWfBusy(false);
        }
    };

    const doPhysicalWorkflow = async (action: string) => {
        if (!Number.isFinite(requestId) || requestId <= 0) return;

        try {
            setWfBusy(true);
            setWfError(null);

            const shouldApplyWorkflowToBatch = !!batchId && batchActiveTotal > 1;

            await apiPatch<any>(`/v1/samples/${requestId}/physical-workflow`, {
                action,
                note: null,
                apply_to_batch: shouldApplyWorkflowToBatch,
            });

            await load({ silent: true });
            setTab("workflow");
        } catch (err: any) {
            setWfError(
                safeApiMessage(
                    err,
                    t("samples.pages.requestDetail.errors.updateWorkflowFailed", {
                        defaultValue: "Failed to update workflow.",
                    })
                )
            );
        } finally {
            setWfBusy(false);
        }
    };

    const openVerifyModal = () => {
        setWfError(null);
        setVerifyApplyToBatch(!!batchId && batchActiveTotal > 1);
        setVerifyOpen(true);
    };

    const doVerify = async () => {
        if (!Number.isFinite(requestId) || requestId <= 0) return;
        if (verifyBusy) return;

        try {
            setVerifyBusy(true);
            setWfError(null);

            await apiPost(`/v1/samples/${requestId}/verify`, {
                apply_to_batch: verifyApplyToBatch,
            });

            setVerifyOpen(false);
            await load({ silent: true });
            setTab("workflow");
        } catch (err: any) {
            setWfError(
                safeApiMessage(
                    err,
                    t("samples.pages.requestDetail.errors.verifyFailed", {
                        defaultValue: "Failed to verify.",
                    })
                )
            );
        } finally {
            setVerifyBusy(false);
        }
    };

    const handleVerifySampleIdChange = async () => {
        setWfError(null);

        let row = sidRow;

        if (!row && Number.isFinite(requestId) && requestId > 0) {
            try {
                const fetched = await getLatestSampleIdChangeBySampleId(requestId);
                if (fetched) {
                    setSidFetchedRaw(fetched);
                    row = sample ? toSidRow(sample as any, fetched) : null;
                }
            } catch {
                // ignore
            }
        }

        if (!row) {
            setWfError(
                t("samples.pages.requestDetail.errors.sampleIdChangeMissing", {
                    defaultValue: "Sample ID change detail is missing.",
                })
            );
            return;
        }

        setSidActiveRow(row);
        setSidPickOpen(true);
    };

    if (!canView) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t("errors.accessDeniedTitle")}</h1>
                <p className="text-sm text-gray-600 mb-6 text-center max-w-md">
                    {t("errors.accessDeniedBodyWithRole", { role: roleLabel })}
                </p>

                <button
                    type="button"
                    onClick={goBack}
                    className="mt-2 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:translate-y-px transition"
                >
                    <ArrowLeft size={16} />
                    {t("back", { defaultValue: "Back" })}
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            <div className="lims-detail-shell">
                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <RefreshCw size={16} className="animate-spin text-primary" />
                        <span>
                            {t("samples.pages.requestDetail.loading", {
                                defaultValue: "Loading request detail...",
                            })}
                        </span>
                    </div>
                ) : null}

                {error && !loading ? (
                    <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
                ) : null}

                {!loading && !error && sample ? (
                    <div className="space-y-6">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3">
                                <button
                                    type="button"
                                    onClick={goBack}
                                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:translate-y-px transition"
                                    aria-label={t("back", { defaultValue: "Back" })}
                                    title={t("back", { defaultValue: "Back" })}
                                >
                                    <ArrowLeft size={16} />
                                    {t("back", { defaultValue: "Back" })}
                                </button>

                                <div>
                                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                                        {t("samples.pages.requestDetail.title", {
                                            id: displayRequestId,
                                            defaultValue: `Request #${displayRequestId}`,
                                        })}
                                    </h1>

                                    <div className="text-sm text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-gray-500">{t("status")}</span>
                                        <StatusPill value={(sample as any)?.request_status ?? "-"} t={t} locale={locale} />

                                        {verifiedAt ? (
                                            <>
                                                <span className="text-gray-400">·</span>
                                                <span className="text-xs text-gray-500">
                                                    {t("samples.pages.requestDetail.verified", {
                                                        defaultValue: "Verified",
                                                    })}
                                                </span>
                                                <span className="text-xs font-semibold text-emerald-700">
                                                    {formatDateTimeLocal(verifiedAt)}
                                                </span>
                                            </>
                                        ) : null}

                                        {labSampleCode ? (
                                            <>
                                                <span className="text-gray-400">·</span>
                                                <span className="text-xs text-gray-500">
                                                    {t("samples.pages.requestDetail.labCode", {
                                                        defaultValue: "Lab Code",
                                                    })}
                                                </span>
                                                <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                                    {labSampleCode}
                                                </span>
                                            </>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <SmallButton type="button" onClick={refresh} disabled={pageRefreshing}>
                                    <RefreshCw size={16} className={cx(pageRefreshing && "animate-spin")} />
                                    {t("refresh")}
                                </SmallButton>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                            <div className="px-5 pt-5">
                                <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-1 flex-wrap">
                                    <TabButton active={tab === "info"} onClick={() => setTab("info")}>
                                        {t("info", { defaultValue: "Info" })}
                                    </TabButton>
                                    <TabButton active={tab === "workflow"} onClick={() => setTab("workflow")}>
                                        {t("workflow", { defaultValue: "Workflow" })}
                                    </TabButton>
                                </div>
                            </div>

                            <div className="px-5 py-5">
                                {tab === "info" ? <SampleRequestInfoTab sample={sample} /> : null}

                                {tab === "workflow" ? (
                                    <>
                                        <SampleRequestWorkflowTab
                                            sample={sample}
                                            roleId={roleId}
                                            roleLabel={roleLabel}
                                            wfBusy={wfBusy}
                                            wfError={wfError}
                                            verifyBusy={verifyBusy}
                                            assignFlash={assignFlash}
                                            workflowLogs={workflowLogs}
                                            onApprove={openAcceptModal}
                                            onOpenReturn={() => {
                                                if (!canUseReturnAction) {
                                                    setWfError(
                                                        t("samples.pages.requestDetail.errors.returnOnlyForFailedIntake", {
                                                            defaultValue:
                                                                "Use Reject request during admin review. Return is reserved for failed intake or returned-to-admin handling.",
                                                        })
                                                    );
                                                    return;
                                                }

                                                setWfError(null);
                                                setReturnModalOpen(true);
                                            }}
                                            onOpenReject={() => {
                                                setWfError(null);
                                                setRejectModalOpen(true);
                                            }}
                                            onMarkPhysicallyReceived={doMarkPhysicallyReceived}
                                            onDoPhysicalWorkflow={doPhysicalWorkflow}
                                            onOpenIntakeChecklist={() => setIntakeOpen(true)}
                                            onVerify={openVerifyModal}
                                            onVerifySampleIdChange={handleVerifySampleIdChange}
                                            onOpenAssignSampleId={() => {
                                                const key = normalizeStatusToken((sample as any)?.request_status ?? "");
                                                const approvedKeys = [
                                                    "sample_id_approved_for_assignment",
                                                    "approved_for_assignment",
                                                ];

                                                if (approvedKeys.includes(key)) {
                                                    setAssignOpen(false);
                                                    setFinalizeApprovedOpen(true);
                                                    return;
                                                }

                                                setFinalizeApprovedOpen(false);
                                                setAssignOpen(true);
                                            }}
                                        />

                                        {sidPickOpen ? (
                                            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                                                <div
                                                    className="absolute inset-0 bg-black/40"
                                                    onClick={() => (sidBusy ? null : setSidPickOpen(false))}
                                                />

                                                <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl border">
                                                    <div className="px-5 py-4 border-b">
                                                        <div className="text-sm font-bold text-gray-900">
                                                            {t("samples.pages.requestDetail.sidVerify.title", {
                                                                defaultValue: "Verify Sample ID change",
                                                            })}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {t("samples.pages.requestDetail.sidVerify.subtitle", {
                                                                defaultValue:
                                                                    "Review suggested vs proposed and choose an action.",
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div className="px-5 py-4 space-y-3">
                                                        <div className="text-xs text-gray-600">
                                                            {t("suggested", { defaultValue: "Suggested" })}:{" "}
                                                            <span className="font-mono text-gray-900">
                                                                {sidActiveRow?.suggested_lab_sample_code ||
                                                                    sidActiveRow?.suggested_sample_id ||
                                                                    "—"}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-600">
                                                            {t("proposed", { defaultValue: "Proposed" })}:{" "}
                                                            <span className="font-mono text-gray-900">
                                                                {sidActiveRow?.proposed_lab_sample_code ||
                                                                    sidActiveRow?.proposed_sample_id ||
                                                                    "—"}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="px-5 pb-5 flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSidPickOpen(false)}
                                                            disabled={sidBusy}
                                                            className={cx(
                                                                "btn-outline",
                                                                sidBusy && "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            {t("cancel", { defaultValue: "Cancel" })}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSidPickOpen(false);
                                                                setSidModalMode("reject");
                                                                setSidModalOpen(true);
                                                            }}
                                                            disabled={sidBusy || !sidActiveRow}
                                                            className={cx(
                                                                "btn-outline",
                                                                (sidBusy || !sidActiveRow) &&
                                                                "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            {t("reject", { defaultValue: "Reject" })}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSidPickOpen(false);
                                                                setSidModalMode("approve");
                                                                setSidModalOpen(true);
                                                            }}
                                                            disabled={sidBusy || !sidActiveRow}
                                                            className={cx(
                                                                "lims-btn-primary",
                                                                (sidBusy || !sidActiveRow) &&
                                                                "opacity-60 cursor-not-allowed"
                                                            )}
                                                        >
                                                            {t("approve", { defaultValue: "Approve" })}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}

                                        <SampleIdChangeDecisionModal
                                            open={sidModalOpen}
                                            mode={sidModalMode}
                                            busy={sidBusy}
                                            row={sidActiveRow}
                                            onClose={() => (sidBusy ? null : setSidModalOpen(false))}
                                            onConfirm={async (rejectReason?: string) => {
                                                if (!sidActiveRow) return;

                                                const changeId = Number(
                                                    sidActiveRow.change_request_id ??
                                                    sidActiveRow.id ??
                                                    sidActiveRow.sample_id_change_id ??
                                                    0
                                                );
                                                if (!Number.isFinite(changeId) || changeId <= 0) return;

                                                setSidBusy(true);
                                                setWfError(null);

                                                try {
                                                    if (sidModalMode === "approve") {
                                                        await approveSampleIdChange(changeId);
                                                    } else {
                                                        const r = String(rejectReason ?? "").trim();
                                                        await rejectSampleIdChange(changeId, r);
                                                    }

                                                    setSidModalOpen(false);
                                                    setSidPickOpen(false);
                                                    setSidActiveRow(null);
                                                    setSidFetchedRaw(null);

                                                    await load({ silent: true });
                                                    setTab("workflow");
                                                } catch (e: any) {
                                                    setSidModalOpen(false);
                                                    setSidPickOpen(false);
                                                    setWfError(
                                                        safeApiMessage(
                                                            e,
                                                            t("samples.pages.requestDetail.errors.sidDecisionFailed", {
                                                                defaultValue: "Failed to process decision.",
                                                            })
                                                        )
                                                    );
                                                } finally {
                                                    setSidBusy(false);
                                                }
                                            }}
                                        />
                                    </>
                                ) : null}
                            </div>
                        </div>

                        <AssignSampleIdModal
                            open={assignOpen}
                            sample={sample}
                            onClose={() => setAssignOpen(false)}
                            onDone={async (payload) => {
                                setAssignOpen(false);
                                setAssignFlash(payload.type ? { type: payload.type, message: payload.message } : null);
                                await load({ silent: true });

                                if (payload.type) window.setTimeout(() => setAssignFlash(null), 9000);
                            }}
                        />

                        <FinalizeApprovedSampleIdModal
                            open={finalizeApprovedOpen}
                            sample={sample}
                            onClose={() => setFinalizeApprovedOpen(false)}
                            onDone={async (payload) => {
                                setFinalizeApprovedOpen(false);
                                setAssignFlash(payload.type ? { type: payload.type, message: payload.message } : null);
                                await load({ silent: true });

                                if (payload.type) window.setTimeout(() => setAssignFlash(null), 9000);
                            }}
                        />

                        <UpdateRequestStatusModal
                            open={acceptModalOpen}
                            sampleId={requestId}
                            action="accept"
                            currentStatus={(sample as any)?.request_status ?? null}
                            batchId={batchId}
                            batchTotal={batchTotal}
                            batchActiveTotal={batchActiveTotal}
                            defaultApplyToBatch={hasActiveBatch}
                            onClose={() => setAcceptModalOpen(false)}
                            onUpdated={async () => {
                                await load({ silent: true });
                                setTab("workflow");
                            }}
                        />

                        <UpdateRequestStatusModal
                            open={returnModalOpen}
                            sampleId={requestId}
                            action="return"
                            currentStatus={(sample as any)?.request_status ?? null}
                            batchId={batchId}
                            batchTotal={batchTotal}
                            batchActiveTotal={batchActiveTotal}
                            defaultApplyToBatch={hasActiveBatch}
                            onClose={() => setReturnModalOpen(false)}
                            onUpdated={async () => {
                                await load({ silent: true });
                                setTab("workflow");
                            }}
                        />

                        <UpdateRequestStatusModal
                            open={rejectModalOpen}
                            sampleId={requestId}
                            action="reject"
                            currentStatus={(sample as any)?.request_status ?? null}
                            batchId={batchId}
                            batchTotal={batchTotal}
                            batchActiveTotal={batchActiveTotal}
                            defaultApplyToBatch={hasActiveBatch}
                            onClose={() => setRejectModalOpen(false)}
                            onUpdated={async () => {
                                await load({ silent: true });
                                setTab("workflow");
                            }}
                        />

                        {intakeOpen ? (
                            <IntakeChecklistModal
                                open={intakeOpen}
                                onClose={() => setIntakeOpen(false)}
                                sampleId={requestId}
                                requestLabel={t("samples.pages.requestDetail.requestLabel", {
                                    id: displayRequestId,
                                    defaultValue: `Request #${displayRequestId}`,
                                })}
                                onSubmitted={async () => {
                                    await load({ silent: true });
                                    setTab("workflow");
                                }}
                            />
                        ) : null}

                        {verifyOpen && sample ? (
                            <div
                                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                                role="dialog"
                                aria-modal="true"
                            >
                                <div
                                    className="absolute inset-0 bg-black/40"
                                    onClick={() => !verifyBusy && setVerifyOpen(false)}
                                />

                                <div
                                    className="relative w-full max-w-3xl rounded-2xl border border-gray-100 bg-white shadow-xl overflow-hidden"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="border-b border-gray-100 px-6 py-4 bg-gray-50">
                                        <div className="text-base font-semibold text-gray-900">
                                            {t("samples.pages.requestDetail.verifyModal.title", {
                                                defaultValue: "Verify intake result",
                                            })}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            {t("samples.pages.requestDetail.verifyModal.subtitle", {
                                                defaultValue:
                                                    "Review collector intake results before continuing to sample ID assignment.",
                                            })}
                                        </div>
                                    </div>

                                    <div className="px-6 py-5 max-h-[65vh] overflow-auto space-y-3">
                                        {wfError ? (
                                            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                                {wfError}
                                            </div>
                                        ) : null}

                                        {batchItemsPreview.map((row: any, index: number) => {
                                            const checklist = row?.intake_checklist ?? row?.intakeChecklist ?? null;
                                            const passed = !!checklist?.is_passed;

                                            return (
                                                <div
                                                    key={row?.sample_id ?? index}
                                                    className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="text-sm font-semibold text-gray-900">
                                                            #{row?.request_batch_item_no ?? index + 1} -{" "}
                                                            {row?.sample_type ?? "-"}
                                                        </div>
                                                        <span
                                                            className={cx(
                                                                "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                                                passed
                                                                    ? "bg-emerald-50 text-emerald-700"
                                                                    : "bg-rose-50 text-rose-700"
                                                            )}
                                                        >
                                                            {passed
                                                                ? t("samples.pages.requestDetail.verifyModal.passed", {
                                                                    defaultValue: "Passed",
                                                                })
                                                                : t("samples.pages.requestDetail.verifyModal.failed", {
                                                                    defaultValue: "Failed",
                                                                })}
                                                        </span>
                                                    </div>

                                                    {checklist?.notes ? (
                                                        <div className="mt-2 text-xs text-gray-600">
                                                            {String(checklist.notes)}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            );
                                        })}

                                        {hasActiveBatch ? (
                                            <label className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    className="mt-1"
                                                    checked={verifyApplyToBatch}
                                                    onChange={(e) => setVerifyApplyToBatch(e.target.checked)}
                                                    disabled={verifyBusy}
                                                />
                                                <div>
                                                    <div className="text-sm font-semibold text-sky-900">
                                                        {t("samples.pages.requestDetail.verifyModal.applyToBatchTitle", {
                                                            defaultValue: "Verify all active samples in this batch",
                                                        })}
                                                    </div>
                                                    <div className="text-xs text-sky-700 mt-1">
                                                        {batchActiveTotal}{" "}
                                                        {t("samples.pages.requestDetail.verifyModal.samples", {
                                                            defaultValue: "active samples",
                                                        })}
                                                    </div>
                                                </div>
                                            </label>
                                        ) : null}
                                    </div>

                                    <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-6 py-4 bg-white">
                                        <button
                                            type="button"
                                            className="lims-btn lims-btn-secondary"
                                            onClick={() => setVerifyOpen(false)}
                                            disabled={verifyBusy}
                                        >
                                            {t("cancel")}
                                        </button>
                                        <button
                                            type="button"
                                            className="lims-btn lims-btn-primary"
                                            onClick={doVerify}
                                            disabled={verifyBusy}
                                        >
                                            {verifyBusy
                                                ? t("processing")
                                                : t("samples.requestWorkflow.verify")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}