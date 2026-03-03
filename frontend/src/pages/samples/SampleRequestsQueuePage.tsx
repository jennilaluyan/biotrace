import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, RefreshCw, Search } from "lucide-react";
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

function safeApiMessage(err: any, fallback: string) {
    const data = err?.response?.data ?? err?.data ?? null;
    if (data && typeof data === "object") {
        const msg = (data as any).message ?? (data as any).error ?? null;
        if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
    return fallback;
}

function normalizeToken(raw?: string | null) {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

/**
 * Short label for queue “chip” (scan-friendly).
 * Falls back to raw string if translation key doesn't exist.
 */
function requestStatusChipLabel(t: TFunction, raw?: string | null) {
    const k = normalizeToken(raw);
    if (!k) return "-";

    const map: Record<string, string> = {
        ready_for_delivery: "requestStatus.readyForDelivery",
        physically_received: "requestStatus.receivedShort",
        awaiting_verification: "requestStatus.awaitingVerification",
        in_transit_to_collector: "requestStatus.inTransitShort",
        under_inspection: "requestStatus.underInspection",
        returned_to_admin: "requestStatus.returnedToAdmin",
        needs_revision: "requestStatus.needsRevision",
        returned: "requestStatus.returned",
        submitted: "requestStatus.submitted",
        rejected: "requestStatus.rejected",
        intake_checklist_passed: "requestStatus.intakePassedShort",
    };

    const key = map[k] ?? `requestStatus.${k}`;
    const out = t(key);
    return out === key ? (raw ?? "-") : out;
}

/**
 * Status chip tone (OLD tone: no border).
 */
function statusTone(raw?: string | null) {
    const s = String(raw ?? "").toLowerCase();
    const k = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();

    if (k === "draft") return "bg-gray-100 text-gray-700";
    if (k === "submitted") return "bg-blue-50 text-blue-700";
    if (k === "ready for delivery") return "bg-indigo-50 text-indigo-700";
    if (k === "physically received") return "bg-green-100 text-green-800";

    if (k === "needs revision" || k === "returned" || k === "rejected")
        return "bg-red-100 text-red-700";

    if (k === "awaiting verification") return "bg-violet-100 text-violet-800";
    if (k === "in transit to collector") return "bg-amber-100 text-amber-800";
    if (k === "under inspection") return "bg-amber-100 text-amber-800";
    if (k === "returned to admin") return "bg-slate-100 text-slate-700";
    if (k === "intake checklist passed") return "bg-emerald-50 text-emerald-700";

    return "bg-gray-100 text-gray-700";
}

/**
 * Request ID resolver.
 * Backend uses `sample_id` as primary identifier in the queue API.
 */
function getRequestId(row: SampleRequestQueueRow): number | null {
    const raw = (row.sample_id ?? row.id) as any;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * ✅ New button rules:
 * - submitted            => Accept + Reject
 * - ready_for_delivery   => Received
 * - physically_received+ => no action buttons (View only)
 */
function getAdminActionsForStatus(statusRaw?: string | null): AdminQueueAction[] {
    const st = normalizeToken(statusRaw);

    if (st === "submitted") return ["accept", "reject"];
    if (st === "ready_for_delivery") return ["received"];

    return [];
}

export default function SampleRequestsQueuePage() {
    const { t } = useTranslation();

    const navigate = useNavigate();
    const location = useLocation();

    const { user } = useAuth();
    const roleId = getUserRoleId(user) ?? ROLE_ID.CLIENT;
    const roleLabel = getUserRoleLabel(user);

    const canView = useMemo(
        () =>
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.LAB_HEAD,
        [roleId]
    );

    // ---- state ----
    const [pager, setPager] = useState<Paginator<SampleRequestQueueRow> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);

    const [searchTerm, setSearchTerm] = useState(() => qs.get("q") ?? "");
    const [statusFilter, setStatusFilter] = useState<string>(() => qs.get("request_status") ?? "");
    const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
        const d = (qs.get("date") ?? "all") as DateFilter;
        return d === "today" || d === "7d" || d === "30d" ? d : "all";
    });
    const [currentPage, setCurrentPage] = useState(1);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<ModalAction>("accept");
    const [modalRequestId, setModalRequestId] = useState<number | null>(null);
    const [modalCurrentStatus, setModalCurrentStatus] = useState<string | null>(null);

    /**
     * Prevent duplicate fetches when filters + page updates happen close together.
     */
    const lastFetchKeyRef = useRef<string>("");

    const buildFetchKey = (page: number) =>
        [
            page,
            searchTerm.trim(),
            statusFilter.trim(),
            dateFilter,
        ].join("|");

    const loadQueue = async (opts?: { page?: number; keepPage?: boolean }) => {
        const page = opts?.page ?? (opts?.keepPage ? currentPage : 1);
        const fetchKey = buildFetchKey(page);

        // Skip exact duplicate request
        if (lastFetchKeyRef.current === fetchKey && !opts?.keepPage) return;
        lastFetchKeyRef.current = fetchKey;

        try {
            setLoading(true);
            setError(null);

            const data = await fetchSampleRequestsQueue({
                page,
                per_page: PAGE_SIZE,
                q: searchTerm.trim() || undefined,
                request_status: statusFilter || undefined,
                date: dateFilter !== "all" ? dateFilter : undefined,
            });

            setPager(data);

            // Keep state consistent with what we fetched
            setCurrentPage(page);
        } catch (err: any) {
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
    };

    // first load
    useEffect(() => {
        loadQueue({ page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // reload when filters change (reset to page 1)
    useEffect(() => {
        loadQueue({ page: 1 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, statusFilter, dateFilter]);

    // reload when page changes
    useEffect(() => {
        loadQueue({ keepPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage]);

    const rawItems = useMemo(() => pager?.data ?? [], [pager]);

    /**
     * ✅ Queue = request yang:
     * - belum punya lab_sample_code
     * - bukan draft (draft hanya client)
     */
    const items = useMemo(() => {
        return rawItems.filter((r) => {
            const st = normalizeToken(r.request_status);
            if (st === "draft") return false;
            return !r.lab_sample_code;
        });
    }, [rawItems]);

    const total = pager?.total ?? 0;
    const totalPages = pager?.last_page ?? 1;

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setCurrentPage(page);
    };

    const openModal = (row: SampleRequestQueueRow, action: ModalAction) => {
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
    };

    const closeModal = () => {
        setModalOpen(false);
        setModalRequestId(null);
        setModalCurrentStatus(null);
    };

    // default filter for OM/LH
    const isOperationalManager = roleId === ROLE_ID.OPERATIONAL_MANAGER;
    const isLabHead = roleId === ROLE_ID.LAB_HEAD;

    useEffect(() => {
        if (isOperationalManager || isLabHead) {
            setStatusFilter((prev) => prev || "awaiting_verification");
        }
    }, [isOperationalManager, isLabHead]);

    if (!canView) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                    {t("errors.accessDeniedTitle")}
                </h1>
                <p className="text-sm text-gray-600 text-center max-w-md">
                    {t("errors.accessDeniedBodyWithRole", { role: roleLabel })}
                </p>
            </div>
        );
    }

    const isAdmin = roleId === ROLE_ID.ADMIN;

    return (
        <div className="min-h-[60vh]">
            {/* Header (OLD design) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="flex flex-col">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        {t("samples.pages.queue.title", {
                            defaultValue: "Sample Requests Queue",
                        })}
                    </h1>
                    <p className="text-sm text-gray-600">
                        {t("samples.pages.queue.subtitle", {
                            defaultValue:
                                "Requests here are not lab samples yet (no lab code).",
                        })}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={() => loadQueue({ keepPage: true })}
                        aria-label={t("refresh", { defaultValue: "Refresh" })}
                        title={t("refresh", { defaultValue: "Refresh" })}
                        disabled={loading}
                    >
                        <RefreshCw size={16} className={cx(loading && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Card (OLD design) */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters (OLD design) */}
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
                        <select
                            id="rq-status"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="">
                                {t("samples.pages.queue.filters.all", {
                                    defaultValue: "All statuses",
                                })}
                            </option>

                            <option value="submitted">
                                {t("requestStatus.submitted", { defaultValue: "submitted" })}
                            </option>
                            <option value="ready_for_delivery">
                                {t("requestStatus.readyForDelivery", {
                                    defaultValue: "ready for delivery",
                                })}
                            </option>
                            <option value="physically_received">
                                {t("requestStatus.physicallyReceived", {
                                    defaultValue: "physically received",
                                })}
                            </option>

                            <option value="returned">
                                {t("requestStatus.returned", { defaultValue: "returned" })}
                            </option>
                            <option value="needs_revision">
                                {t("requestStatus.needsRevision", {
                                    defaultValue: "needs revision",
                                })}
                            </option>

                            <option value="rejected">
                                {t("requestStatus.rejected", { defaultValue: "rejected" })}
                            </option>

                            <option value="in_transit_to_collector">
                                {t("requestStatus.inTransitToCollector", {
                                    defaultValue: "in transit to collector",
                                })}
                            </option>
                            <option value="under_inspection">
                                {t("requestStatus.underInspection", {
                                    defaultValue: "under inspection",
                                })}
                            </option>
                            <option value="returned_to_admin">
                                {t("requestStatus.returnedToAdmin", {
                                    defaultValue: "returned to admin",
                                })}
                            </option>
                            <option value="intake_checklist_passed">
                                {t("requestStatus.intakeChecklistPassed", {
                                    defaultValue: "intake checklist passed",
                                })}
                            </option>
                            <option value="awaiting_verification">
                                {t("requestStatus.awaitingVerification", {
                                    defaultValue: "awaiting verification",
                                })}
                            </option>
                        </select>
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

                {/* Body (OLD design) */}
                <div className="px-4 md:px-6 py-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <RefreshCw size={16} className="animate-spin text-primary" />
                            <span>{t("samples.pages.queue.loading", { defaultValue: "Loading queue…" })}</span>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-sm text-gray-600">
                            {t("samples.pages.queue.empty.body", {
                                defaultValue: "No pending sample requests found.",
                            })}
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

                                            const statusLabel = requestStatusChipLabel(t, r.request_status);

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

                                                            {/* ✅ New rule-based actions (Admin only) */}
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

                            {/* Pagination (OLD design) */}
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
                        await loadQueue({ keepPage: true });
                    }}
                />
            </div>
        </div>
    );
}