import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Check, Eye, Loader2, RefreshCw, Search, X, AlertTriangle } from "lucide-react";

import { clientApprovalsService, type ClientApplication } from "../../services/clientApprovals";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";

import ClientApprovalDecisionModal from "../../components/clients/ClientApprovalDecisionModal";

type TypeFilter = "all" | "individual" | "institution";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function typeLabel(t: TFunction, type: ClientApplication["type"]) {
    return type === "institution"
        ? t("clients.badges.institution", "Institution")
        : t("clients.badges.individual", "Individual");
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

export const ClientApprovalsPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const { user } = useAuth();
    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canApproveClients = roleId === ROLE_ID.ADMIN;

    const [items, setItems] = useState<ClientApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [pageError, setPageError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"approve" | "reject">("approve");
    const [selected, setSelected] = useState<ClientApplication | null>(null);
    const [modalBusy, setModalBusy] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setPageError(null);

            const res = await clientApprovalsService.listPending();
            setItems(unwrapList<ClientApplication>(res));
        } catch (err) {
            setItems([]);
            setPageError(getApiMessage(err, t("clients.approvals.errors.loadFailed", "Failed to load pending client applications.")));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        if (!canApproveClients) {
            setLoading(false);
            return;
        }

        void load();
    }, [canApproveClients, load]);

    const filtered = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();

        return items.filter((c) => {
            if (typeFilter !== "all" && c.type !== typeFilter) return false;
            if (!term) return true;

            const haystack = [c.name, c.email, c.institution_name, c.contact_person_name]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [items, searchTerm, typeFilter]);

    const pendingCount = filtered.length;

    const openApprove = useCallback((item: ClientApplication) => {
        setModalMode("approve");
        setSelected(item);
        setModalError(null);
        setModalOpen(true);
    }, []);

    const openReject = useCallback((item: ClientApplication) => {
        setModalMode("reject");
        setSelected(item);
        setModalError(null);
        setModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        if (modalBusy) return;
        setModalOpen(false);
        setSelected(null);
        setModalError(null);
    }, [modalBusy]);

    const onConfirmModal = useCallback(async () => {
        const id = selected?.client_application_id;
        if (!id) return;

        try {
            setModalBusy(true);
            setModalError(null);

            if (modalMode === "approve") {
                await clientApprovalsService.approve(id);
            } else {
                // Requirement: no rejection note
                await clientApprovalsService.reject(id);
            }

            setModalOpen(false);
            setSelected(null);

            await load();
        } catch (err) {
            const fallback =
                modalMode === "approve"
                    ? t("clients.approvals.errors.approveFailed", "Approve failed. Please try again.")
                    : t("clients.approvals.errors.rejectFailed", "Reject failed. Please try again.");

            setModalError(getApiMessage(err, fallback));
        } finally {
            setModalBusy(false);
        }
    }, [selected, modalMode, load, t]);

    const busyRowId = modalBusy ? selected?.client_application_id ?? null : null;

    if (!canApproveClients) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <div className="bg-red-50 p-4 rounded-full mb-3">
                    <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-1">{t("clients.forbidden.title", "Access denied")}</h1>
                <p className="text-sm text-gray-600 max-w-md">
                    {t("clients.forbidden.bodyApprovals", "Your role ({{role}}) is not allowed to approve clients.", {
                        role: roleLabel,
                    })}
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        {t("clients.approvals.title", "Client Approvals")}
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        {t("clients.approvals.subtitle", "Review new client registrations. Approving creates an active client account.")}
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                    <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 inline-flex items-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-gray-500" />
                        <span>
                            {t("clients.approvals.pendingLabel", "Pending")}:{" "}
                            <span className="font-semibold text-gray-900">{pendingCount}</span>
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={load}
                        className="btn-outline inline-flex items-center gap-2"
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        {t("common.refresh", "Refresh")}
                    </button>
                </div>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="pending-client-search">
                            {t("common.search", "Search")}
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search className="h-4 w-4" />
                            </span>
                            <input
                                id="pending-client-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t("clients.filters.searchPlaceholder", "Search by name, email, institution…")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="pending-client-type-filter">
                            {t("clients.detail.labels.clientType", "Client type")}
                        </label>
                        <select
                            id="pending-client-type-filter"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("clients.filters.typeAll", "All types")}</option>
                            <option value="individual">{t("clients.badges.individual", "Individual")}</option>
                            <option value="institution">{t("clients.badges.institution", "Institution")}</option>
                        </select>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {pageError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">
                            {pageError}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("loading", "Loading...")}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="mx-auto h-10 w-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600">
                                <BadgeCheck className="h-5 w-5" />
                            </div>
                            <div className="mt-3 text-sm font-semibold text-gray-900">
                                {t("clients.approvals.emptyTitle", "No pending applications")}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                                {t("clients.approvals.emptyBody", "New client registrations will appear here for review.")}
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                        <th className="px-4 py-3 text-left">{t("clients.approvals.table.name", "Name")}</th>
                                        <th className="px-4 py-3 text-left">{t("clients.approvals.table.type", "Type")}</th>
                                        <th className="px-4 py-3 text-left">{t("clients.approvals.table.email", "Email")}</th>
                                        <th className="px-4 py-3 text-right">{t("common.actions", "Actions")}</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filtered.map((c) => {
                                        const busy = busyRowId === c.client_application_id;

                                        return (
                                            <tr
                                                key={c.client_application_id}
                                                className="border-t border-gray-100 hover:bg-gray-50/60"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{c.name}</div>
                                                    <div className="mt-1 inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] text-amber-700">
                                                        {t("clients.approvals.statusPending", "Pending review")}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span
                                                        className={cx(
                                                            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                                            c.type === "institution"
                                                                ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                                                                : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                                        )}
                                                    >
                                                        {typeLabel(t, c.type)}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">
                                                    {c.email ? <span className="break-all">{c.email}</span> : <span className="text-gray-400">—</span>}
                                                </td>

                                                <td className="px-4 py-3 text-right">
                                                    <div className="inline-flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            className="btn-outline inline-flex items-center gap-2"
                                                            onClick={() => navigate(`/clients/approvals/${c.client_application_id}`)}
                                                            disabled={busy}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                            {t("common.view", "View")}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className="lims-btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            onClick={() => openApprove(c)}
                                                            disabled={busy}
                                                        >
                                                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                            {busy ? t("common.processing", "Processing...") : t("common.approve", "Approve")}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className="lims-btn-danger inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            onClick={() => openReject(c)}
                                                            disabled={busy}
                                                        >
                                                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                                                            {busy ? t("common.processing", "Processing...") : t("common.reject", "Reject")}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <ClientApprovalDecisionModal
                open={modalOpen}
                mode={modalMode}
                item={selected}
                busy={modalBusy}
                error={modalError}
                onClose={closeModal}
                onConfirm={onConfirmModal}
            />
        </div>
    );
};