import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Eye, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import {
    fetchSampleRequestsQueue,
    type Paginator,
    type SampleRequestQueueRow,
} from "../../services/sampleRequestQueue";
import { UpdateRequestStatusModal } from "../../components/samples/UpdateRequestStatusModal";

type DateFilter = "all" | "today" | "7d" | "30d";
type ModalAction = "accept" | "reject" | "received";
type AdminQueueAction = ModalAction;

const PAGE_SIZE = 15;

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type ApiErrorLike = {
    response?: { data?: any };
    data?: any;
    message?: string;
};

function safeApiMessage(err: unknown, fallback: string) {
    const e = err as ApiErrorLike;
    const data = e?.response?.data ?? e?.data ?? null;

    if (data && typeof data === "object") {
        const msg = (data as any).message ?? (data as any).error ?? null;
        if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    if (typeof e?.message === "string" && e.message.trim()) return e.message.trim();
    return fallback;
}

function normalizeToken(raw?: string | null) {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

/**
 * Normalize words for human readable output (chip text).
 */
function normalizeStatusWords(input?: string | null) {
    return String(input ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ");
}

/**
 * Short label for queue “chip” (scan-friendly).
 * Falls back to raw token if translation key doesn't exist.
 */
function compactRequestStatusToken(token: string, locale: string) {
    const isId = String(locale || "").toLowerCase().startsWith("id");

    const map: Record<string, { en: string; id: string }> = {
        // submission / moderation
        submitted: { en: "submitted", id: "terkirim" },
        needs_revision: { en: "revision", id: "revisi" },
        returned: { en: "revision", id: "revisi" },
        rejected: { en: "rejected", id: "ditolak" },

        // logistics / physical movement
        ready_for_delivery: { en: "ready", id: "siap" },
        physically_received: { en: "received", id: "diterima" },
        in_transit_to_collector: { en: "transit", id: "transit" },
        under_inspection: { en: "inspect", id: "inspeksi" },
        inspection_failed_returned_to_admin: { en: "failed", id: "gagal" },
        returned_to_admin: { en: "returned", id: "kembali" },

        // checklist + verification + sample id assignment
        intake_checklist_passed: { en: "intake", id: "intake" },
        awaiting_verification: { en: "verify", id: "verifikasi" },
        waiting_sample_id_assignment: { en: "waiting", id: "menunggu" },
        sample_id_pending_verification: { en: "pending", id: "menunggu" },
        sample_id_approved_for_assignment: { en: "approved", id: "disetujui" },
        intake_validated: { en: "validated", id: "validasi" },

        // SC ↔ Analyst handoff
        sc_delivered_to_analyst: { en: "to analyst", id: "ke analis" },
        analyst_received: { en: "analyst", id: "diterima analis" },
        analyst_returned_to_sc: { en: "returned", id: "kembali" },
        sc_received_from_analyst: { en: "received", id: "diterima" },
    };

    return (map[token]?.[isId ? "id" : "en"] ?? normalizeStatusWords(token)).toLowerCase();
}

function requestStatusChipLabel(t: TFunction, locale: string, raw?: string | null) {
    const token = normalizeToken(raw);
    if (!token) return "-";

    const keyMap: Record<string, string> = {
        // submission / moderation
        submitted: "requestStatus.submitted",
        needs_revision: "requestStatus.needsRevision",
        returned: "requestStatus.returned",
        rejected: "requestStatus.rejected",

        // logistics / physical movement
        ready_for_delivery: "requestStatus.readyForDelivery",
        physically_received: "requestStatus.physicallyReceived",
        in_transit_to_collector: "requestStatus.inTransitToCollector",
        under_inspection: "requestStatus.underInspection",
        inspection_failed_returned_to_admin: "requestStatus.inspectionFailedReturnedToAdmin",
        returned_to_admin: "requestStatus.returnedToAdmin",

        // checklist + verification + sample id assignment
        intake_checklist_passed: "requestStatus.intakeChecklistPassed",
        awaiting_verification: "requestStatus.awaitingVerification",
        waiting_sample_id_assignment: "requestStatus.waitingSampleIdAssignment",
        sample_id_pending_verification: "requestStatus.sampleIdPendingVerification",
        sample_id_approved_for_assignment: "requestStatus.sampleIdApprovedForAssignment",
        intake_validated: "requestStatus.intakeValidated",

        // SC ↔ Analyst handoff
        sc_delivered_to_analyst: "requestStatus.scDeliveredToAnalyst",
        analyst_received: "requestStatus.analystReceived",
        analyst_returned_to_sc: "requestStatus.analystReturnedToSc",
        sc_received_from_analyst: "requestStatus.scReceivedFromAnalyst",
    };

    const fallback = compactRequestStatusToken(token, locale);
    const key = keyMap[token] ?? `requestStatus.${token}`;

    // defaultValue penting supaya gak balik "requestStatus.xxx" atau raw underscore
    const out = t(key, { defaultValue: fallback });

    return normalizeStatusWords(out);
}

/**
 * Status chip tone.
 */
function statusTone(raw?: string | null) {
    const k = normalizeStatusWords(raw);

    if (k === "draft") return "bg-gray-100 text-gray-700";

    // submission
    if (k === "submitted") return "bg-blue-50 text-blue-700";
    if (k === "needs revision" || k === "returned" || k === "rejected") return "bg-red-100 text-red-700";

    // logistics / physical movement
    if (k === "ready for delivery") return "bg-indigo-50 text-indigo-700";
    if (k === "physically received") return "bg-green-100 text-green-800";
    if (k === "in transit to collector" || k === "under inspection") return "bg-amber-100 text-amber-800";
    if (k === "inspection failed returned to admin") return "bg-rose-100 text-rose-800";
    if (k === "returned to admin") return "bg-slate-100 text-slate-700";

    // verification + sample id assignment
    if (k === "intake checklist passed") return "bg-emerald-50 text-emerald-700";
    if (k === "awaiting verification") return "bg-violet-100 text-violet-800";
    if (k === "waiting sample id assignment") return "bg-fuchsia-100 text-fuchsia-800";
    if (k === "sample id pending verification") return "bg-fuchsia-100 text-fuchsia-800";
    if (k === "sample id approved for assignment") return "bg-teal-100 text-teal-800";
    if (k === "intake validated") return "bg-teal-100 text-teal-800";

    // SC ↔ Analyst handoff
    if (k === "sc delivered to analyst" || k === "analyst received") return "bg-amber-50 text-amber-800";
    if (k === "analyst returned to sc" || k === "sc received from analyst") return "bg-slate-100 text-slate-700";

    return "bg-gray-100 text-gray-700";
}

/**
 * Backend uses `sample_id` as primary identifier in the queue API.
 */
function getRequestId(row: SampleRequestQueueRow): number | null {
    const raw = (row.sample_id ?? row.id) as any;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Admin actions based on request_status.
 * Keep narrow to avoid affecting other workflows.
 */
function getAdminActionsForStatus(statusRaw?: string | null): AdminQueueAction[] {
    const st = normalizeToken(statusRaw);

    // submitted => Accept + Reject
    if (st === "submitted") return ["accept", "reject"];

    // ready_for_delivery => Received
    if (st === "ready_for_delivery") return ["received"];

    // physically_received+ => view only
    return [];
}

function parseDateFilter(raw: string | null): DateFilter {
    const d = (raw ?? "all") as DateFilter;
    return d === "today" || d === "7d" || d === "30d" ? d : "all";
}

export default function SampleRequestsQueuePage() {
    const { t, i18n } = useTranslation();
    const locale = i18n.language || "en";

    const navigate = useNavigate();
    const location = useLocation();

    const { user } = useAuth();
    const roleId = getUserRoleId(user) ?? ROLE_ID.CLIENT;
    const roleLabel = getUserRoleLabel(user);

    const canView = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.LAB_HEAD
        );
    }, [roleId]);

    const isAdmin = roleId === ROLE_ID.ADMIN;
    const isOperationalManager = roleId === ROLE_ID.OPERATIONAL_MANAGER;
    const isLabHead = roleId === ROLE_ID.LAB_HEAD;

    // ---- URL sync (read initial values only) ----
    const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);

    // ---- state ----
    const [pager, setPager] = useState<Paginator<SampleRequestQueueRow> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState(() => qs.get("q") ?? "");
    const [statusFilter, setStatusFilter] = useState<string>(() => qs.get("request_status") ?? "");
    const [dateFilter, setDateFilter] = useState<DateFilter>(() => parseDateFilter(qs.get("date")));
    const [currentPage, setCurrentPage] = useState(1);

    // Manual refresh trigger (keeps current filters/page)
    const [refreshTick, setRefreshTick] = useState(0);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<ModalAction>("accept");
    const [modalRequestId, setModalRequestId] = useState<number | null>(null);
    const [modalCurrentStatus, setModalCurrentStatus] = useState<string | null>(null);

    const lastFetchKeyRef = useRef<string>("");

    const itemsRaw = useMemo(() => pager?.data ?? [], [pager]);

    /**
     * Queue items:
     * - exclude draft
     * - exclude rows that already have lab_sample_code (already promoted to lab sample)
     */
    const items = useMemo(() => {
        return itemsRaw.filter((r) => {
            const st = normalizeToken(r.request_status);
            if (st === "draft") return false;
            return !r.lab_sample_code;
        });
    }, [itemsRaw]);

    const total = pager?.total ?? 0;
    const totalPages = pager?.last_page ?? 1;

    const closeModal = useCallback(() => {
        setModalOpen(false);
        setModalRequestId(null);
        setModalCurrentStatus(null);
    }, []);

    const openModal = useCallback(
        (row: SampleRequestQueueRow, action: ModalAction) => {
            const requestId = getRequestId(row);
            if (!requestId) {
                setError(
                    t("samples.pages.queue.errors.missingSampleId", {
                        defaultValue: "Cannot open request: missing request id.",
                    })
                );
                return;
            }

            setModalRequestId(requestId);
            setModalCurrentStatus(row.request_status ?? null);
            setModalAction(action);
            setModalOpen(true);
        },
        [t]
    );

    // Default filter for OM/LH (only if user hasn't set it)
    useEffect(() => {
        if (isOperationalManager || isLabHead) {
            setStatusFilter((prev) => prev || "awaiting_verification");
        }
    }, [isOperationalManager, isLabHead]);

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, dateFilter]);

    const loadQueue = useCallback(async () => {
        const key = [
            currentPage,
            searchTerm.trim(),
            statusFilter.trim(),
            dateFilter,
            refreshTick,
        ].join("|");

        if (lastFetchKeyRef.current === key) return;
        lastFetchKeyRef.current = key;

        try {
            setLoading(true);
            setError(null);

            const data = await fetchSampleRequestsQueue({
                page: currentPage,
                per_page: PAGE_SIZE,
                q: searchTerm.trim() || undefined,
                request_status: statusFilter || undefined,
                date: dateFilter !== "all" ? dateFilter : undefined,
            });

            setPager(data);
        } catch (err: unknown) {
            setError(
                safeApiMessage(
                    err,
                    t("samples.pages.queue.errors.loadFailed", {
                        defaultValue: "Failed to load queue.",
                    })
                )
            );
        } finally {
            setLoading(false);
        }
    }, [currentPage, dateFilter, refreshTick, searchTerm, statusFilter, t]);

    // Single source of truth fetching
    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setCurrentPage(page);
    };

    const onRefresh = () => {
        // force reload with same filters/page
        setRefreshTick((x) => x + 1);
    };

    const statusGroups = useMemo(() => {
        return [
            {
                label: t("samples.pages.queue.filters.groups.submission", { defaultValue: "Submission" }),
                options: [
                    { value: "submitted", label: t("requestStatus.submitted", { defaultValue: "submitted" }) },
                    { value: "needs_revision", label: t("requestStatus.needsRevision", { defaultValue: "needs revision" }) },
                    { value: "returned", label: t("requestStatus.returned", { defaultValue: "returned" }) },
                    { value: "rejected", label: t("requestStatus.rejected", { defaultValue: "rejected" }) },
                ],
            },
            {
                label: t("samples.pages.queue.filters.groups.logistics", { defaultValue: "Logistics" }),
                options: [
                    { value: "ready_for_delivery", label: t("requestStatus.readyForDelivery", { defaultValue: "ready for delivery" }) },
                    { value: "physically_received", label: t("requestStatus.physicallyReceived", { defaultValue: "physically received" }) },
                    { value: "in_transit_to_collector", label: t("requestStatus.inTransitToCollector", { defaultValue: "in transit to collector" }) },
                    { value: "under_inspection", label: t("requestStatus.underInspection", { defaultValue: "under inspection" }) },
                    {
                        value: "inspection_failed_returned_to_admin",
                        label: t("requestStatus.inspectionFailedReturnedToAdmin", { defaultValue: "inspection failed (returned)" }),
                    },
                    { value: "returned_to_admin", label: t("requestStatus.returnedToAdmin", { defaultValue: "returned to admin" }) },
                ],
            },
            {
                label: t("samples.pages.queue.filters.groups.verification", { defaultValue: "Verification & Sample ID" }),
                options: [
                    {
                        value: "intake_checklist_passed",
                        label: t("requestStatus.intakeChecklistPassed", { defaultValue: "intake checklist passed" }),
                    },
                    { value: "awaiting_verification", label: t("requestStatus.awaitingVerification", { defaultValue: "awaiting verification" }) },
                    {
                        value: "waiting_sample_id_assignment",
                        label: t("requestStatus.waitingSampleIdAssignment", { defaultValue: "waiting sample id assignment" }),
                    },
                    {
                        value: "sample_id_pending_verification",
                        label: t("requestStatus.sampleIdPendingVerification", { defaultValue: "sample id pending verification" }),
                    },
                    {
                        value: "sample_id_approved_for_assignment",
                        label: t("requestStatus.sampleIdApprovedForAssignment", { defaultValue: "sample id approved for assignment" }),
                    },
                    { value: "intake_validated", label: t("requestStatus.intakeValidated", { defaultValue: "intake validated" }) },
                ],
            },
            {
                label: t("samples.pages.queue.filters.groups.analyst", { defaultValue: "SC ↔ Analyst" }),
                options: [
                    { value: "sc_delivered_to_analyst", label: t("requestStatus.scDeliveredToAnalyst", { defaultValue: "SC delivered to analyst" }) },
                    { value: "analyst_received", label: t("requestStatus.analystReceived", { defaultValue: "analyst received" }) },
                    { value: "analyst_returned_to_sc", label: t("requestStatus.analystReturnedToSc", { defaultValue: "analyst returned to SC" }) },
                    { value: "sc_received_from_analyst", label: t("requestStatus.scReceivedFromAnalyst", { defaultValue: "SC received from analyst" }) },
                ],
            },
        ];
    }, [t]);

    if (!canView) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t("errors.accessDeniedTitle")}</h1>
                <p className="text-sm text-gray-600 text-center max-w-md">
                    {t("errors.accessDeniedBodyWithRole", { role: roleLabel })}
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="flex flex-col">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        {t("samples.pages.queue.title", { defaultValue: "Sample Requests Queue" })}
                    </h1>
                    <p className="text-sm text-gray-600">
                        {t("samples.pages.queue.subtitle", {
                            defaultValue: "Requests here are not lab samples yet (no lab code).",
                        })}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={onRefresh}
                        aria-label={t("refresh", { defaultValue: "Refresh" })}
                        title={t("refresh", { defaultValue: "Refresh" })}
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={cx(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Card */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    {/* Search */}
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="rq-search">
                            {t("search", { defaultValue: "Search" })}
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search className="h-4 w-4" />
                            </span>

                            <input
                                id="rq-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t("samples.pages.queue.filters.searchPlaceholder", {
                                    defaultValue: "Search by sample type, status, client…",
                                })}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Status */}
                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="rq-status">
                            {t("samples.pages.queue.filters.status", { defaultValue: "Status" })}
                        </label>

                        <div className="relative">
                            <select
                                id="rq-status"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className={cx(
                                    "w-full appearance-none rounded-xl border border-gray-300 bg-white px-3 py-2 pr-9 text-sm",
                                    "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                )}
                            >
                                <option value="">
                                    {t("samples.pages.queue.filters.all", { defaultValue: "All statuses" })}
                                </option>

                                {statusGroups.map((g) => (
                                    <optgroup key={g.label} label={g.label}>
                                        {g.options.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>

                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        </div>
                    </div>

                    {/* Date filter */}
                    <div className="w-full md:w-44">
                        <label className="sr-only" htmlFor="rq-date">
                            {t("date", { defaultValue: "Date" })}
                        </label>

                        <select
                            id="rq-date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("dateAll", { defaultValue: "All" })}</option>
                            <option value="today">{t("dateToday", { defaultValue: "Today" })}</option>
                            <option value="7d">{t("dateLast7Days", { defaultValue: "Last 7 days" })}</option>
                            <option value="30d">{t("dateLast30Days", { defaultValue: "Last 30 days" })}</option>
                        </select>
                    </div>
                </div>

                {/* Body */}
                <div className="px-4 md:px-6 py-4">
                    {error && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}

                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <RefreshCw size={16} className="animate-spin text-primary" />
                            <span>{t("samples.pages.queue.loading", { defaultValue: "Loading queue…" })}</span>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-sm text-gray-600">
                            {t("samples.pages.queue.empty.body", { defaultValue: "No pending sample requests found." })}
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">
                                                {t("samples.pages.queue.table.request", { defaultValue: "Request ID" })}
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                {t("samples.pages.queue.table.sampleType", { defaultValue: "Sample Type" })}
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                {t("samples.pages.queue.table.client", { defaultValue: "Client" })}
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                {t("samples.pages.queue.table.status", { defaultValue: "Status" })}
                                            </th>
                                            <th className="text-right font-semibold px-4 py-3">
                                                {t("actions", { defaultValue: "Actions" })}
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((r, idx) => {
                                            const requestId = getRequestId(r);
                                            const canRowOpen = !!requestId;

                                            const actions = getAdminActionsForStatus(r.request_status);
                                            const canAccept = isAdmin && canRowOpen && actions.includes("accept");
                                            const canReject = isAdmin && canRowOpen && actions.includes("reject");
                                            const canReceived = isAdmin && canRowOpen && actions.includes("received");

                                            const statusLabel = requestStatusChipLabel(t, locale, r.request_status);

                                            return (
                                                <tr key={requestId ?? `row-${idx}`} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-900 font-semibold">
                                                        {requestId ? `#${requestId}` : "-"}
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">{r.sample_type ?? "-"}</td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{r.client_name ?? "-"}</span>
                                                            <span className="text-xs text-gray-500">{r.client_email ?? "-"}</span>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <span
                                                            className={cx(
                                                                "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold",
                                                                statusTone(r.request_status)
                                                            )}
                                                            title={statusLabel}
                                                        >
                                                            {statusLabel}
                                                        </span>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {/* View icon (always visible) */}
                                                            <button
                                                                type="button"
                                                                className="lims-icon-button"
                                                                onClick={() => requestId && navigate(`/samples/requests/${requestId}`)}
                                                                aria-label={t("view", { defaultValue: "View" })}
                                                                title={t("view", { defaultValue: "View" })}
                                                                disabled={!canRowOpen}
                                                            >
                                                                <Eye size={16} />
                                                            </button>

                                                            {/* Rule-based actions (Admin only) */}
                                                            {canAccept ? (
                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold",
                                                                        "bg-primary text-white hover:bg-primary/90"
                                                                    )}
                                                                    onClick={() => openModal(r, "accept")}
                                                                    title={t("samples.pages.queue.actions.accept", {
                                                                        defaultValue: "Accept request",
                                                                    })}
                                                                >
                                                                    {t("accept", { defaultValue: "Accept" })}
                                                                </button>
                                                            ) : null}

                                                            {canReject ? (
                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold border",
                                                                        "border-red-200 text-red-700 hover:bg-red-50"
                                                                    )}
                                                                    onClick={() => openModal(r, "reject")}
                                                                    title={t("samples.pages.queue.actions.reject", {
                                                                        defaultValue: "Reject request",
                                                                    })}
                                                                >
                                                                    {t("reject", { defaultValue: "Reject" })}
                                                                </button>
                                                            ) : null}

                                                            {canReceived ? (
                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold border",
                                                                        "border-gray-300 text-gray-700 hover:bg-gray-50"
                                                                    )}
                                                                    onClick={() => openModal(r, "received")}
                                                                    title={t("samples.pages.queue.actions.received", {
                                                                        defaultValue: "Mark physically received",
                                                                    })}
                                                                >
                                                                    {t("samples.pages.queue.actions.received", {
                                                                        defaultValue: "Received",
                                                                    })}
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    {t("pageOfTotal", {
                                        page: pager?.current_page ?? 1,
                                        totalPages,
                                        total,
                                        defaultValue: `Page ${pager?.current_page ?? 1} of ${totalPages} — ${total} total`,
                                    })}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage <= 1}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    >
                                        {t("prev", { defaultValue: "Prev" })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage >= totalPages}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    >
                                        {t("next", { defaultValue: "Next" })}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Modal */}
                <UpdateRequestStatusModal
                    open={modalOpen}
                    sampleId={modalRequestId}
                    action={modalAction}
                    currentStatus={modalCurrentStatus}
                    onClose={closeModal}
                    onUpdated={async () => {
                        onRefresh();
                    }}
                />
            </div>
        </div>
    );
}