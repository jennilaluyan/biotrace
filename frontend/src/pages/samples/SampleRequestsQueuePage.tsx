// L:\Campus\Final Countdown\biotrace\frontend\src\pages\samples\SampleRequestsQueuePage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { fetchSampleRequestsQueue, type Paginator, type SampleRequestQueueRow } from "../../services/sampleRequestQueue";
import { UpdateRequestStatusModal } from "../../components/samples/UpdateRequestStatusModal";

type DateFilter = "all" | "today" | "7d" | "30d";
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

const normalizeToken = (raw?: string | null) =>
    String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

const requestStatusChipLabel = (t: TFunction, raw?: string | null) => {
    const k = normalizeToken(raw);
    if (!k) return "-";

    // short “chip” labels (queue list needs scan-friendly text)
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
        intake_checklist_passed: "requestStatus.intakePassedShort",
    };

    const key = map[k] ?? `requestStatus.${k}`;
    const out = t(key);
    return out === key ? (raw ?? "-") : out;
};

// OLD design tone (no border)
const statusTone = (raw?: string | null) => {
    const s = String(raw ?? "").toLowerCase();
    const k = s.replace(/_/g, " ").replace(/\s+/g, " ").trim();

    if (k === "draft") return "bg-gray-100 text-gray-700";
    if (k === "submitted") return "bg-blue-50 text-blue-700";
    if (k === "needs revision" || k === "returned") return "bg-red-100 text-red-700";
    if (k === "ready for delivery") return "bg-indigo-50 text-indigo-700";
    if (k === "physically received") return "bg-green-100 text-green-800";
    if (k === "awaiting verification") return "bg-violet-100 text-violet-800";
    if (k === "in transit to collector") return "bg-amber-100 text-amber-800";
    if (k === "under inspection") return "bg-amber-100 text-amber-800";
    if (k === "returned to admin") return "bg-slate-100 text-slate-700";
    if (k === "intake checklist passed") return "bg-emerald-50 text-emerald-700";

    return "bg-gray-100 text-gray-700";
};

export default function SampleRequestsQueuePage() {
    const { t } = useTranslation();

    const navigate = useNavigate();
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

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [currentPage, setCurrentPage] = useState(1);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<"return" | "approve" | "received">("return");
    const [modalSampleId, setModalSampleId] = useState<number | null>(null);
    const [modalCurrentStatus, setModalCurrentStatus] = useState<string | null>(null);

    const loadQueue = async (opts?: { keepPage?: boolean }) => {
        try {
            setLoading(true);
            setError(null);

            const page = opts?.keepPage ? currentPage : 1;
            const data = await fetchSampleRequestsQueue({
                page,
                per_page: PAGE_SIZE,
                q: searchTerm.trim() || undefined,
                request_status: statusFilter || undefined,
                date: dateFilter !== "all" ? dateFilter : undefined,
            });

            setPager(data);
            if (!opts?.keepPage) setCurrentPage(1);
        } catch (err: any) {
            setError(safeApiMessage(err, t("samples.pages.queue.errors.loadFailed", { defaultValue: "Failed to load queue." })));
        } finally {
            setLoading(false);
        }
    };

    // first load
    useEffect(() => {
        loadQueue();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // reload when filters change
    useEffect(() => {
        loadQueue();
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
            const st = String(r.request_status ?? "").toLowerCase();
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

    const openModal = (row: SampleRequestQueueRow, action: "return" | "approve" | "received") => {
        if (row.sample_id == null) {
            setError(t("samples.pages.queue.errors.missingSampleId", { defaultValue: "Cannot open request: missing sample_id." }));
            return;
        }
        setModalSampleId(row.sample_id);
        setModalCurrentStatus(row.request_status ?? null);
        setModalAction(action);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setModalSampleId(null);
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
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">{t("errors.accessDeniedTitle")}</h1>
                <p className="text-sm text-gray-600 text-center max-w-md">
                    {t("errors.accessDeniedBodyWithRole", { role: roleLabel })}
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header (OLD design) */}
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
                            <option value="">{t("samples.pages.queue.filters.all", { defaultValue: "All statuses" })}</option>

                            <option value="submitted">{t("requestStatus.submitted", { defaultValue: "submitted" })}</option>
                            <option value="ready_for_delivery">
                                {t("requestStatus.readyForDelivery", { defaultValue: "ready for delivery" })}
                            </option>
                            <option value="physically_received">
                                {t("requestStatus.physicallyReceived", { defaultValue: "physically received" })}
                            </option>
                            <option value="returned">{t("requestStatus.returned", { defaultValue: "returned" })}</option>
                            <option value="needs_revision">{t("requestStatus.needsRevision", { defaultValue: "needs revision" })}</option>

                            <option value="in_transit_to_collector">
                                {t("requestStatus.inTransitToCollector", { defaultValue: "in transit to collector" })}
                            </option>
                            <option value="under_inspection">
                                {t("requestStatus.underInspection", { defaultValue: "under inspection" })}
                            </option>
                            <option value="returned_to_admin">
                                {t("requestStatus.returnedToAdmin", { defaultValue: "returned to admin" })}
                            </option>
                            <option value="intake_checklist_passed">
                                {t("requestStatus.intakeChecklistPassed", { defaultValue: "intake checklist passed" })}
                            </option>
                            <option value="awaiting_verification">
                                {t("requestStatus.awaitingVerification", { defaultValue: "awaiting verification" })}
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
                                            const rowId = r.sample_id;
                                            const canAct = rowId != null;
                                            const st = String(r.request_status ?? "").toLowerCase();

                                            const canApprove = canAct && (st === "submitted" || st === "returned" || st === "needs_revision");
                                            const canReturn = canAct && (st === "submitted" || st === "returned" || st === "needs_revision");
                                            const canReceived = canAct && st === "ready_for_delivery";

                                            const statusLabel = requestStatusChipLabel(t, r.request_status);

                                            return (
                                                <tr key={rowId ?? `row-${idx}`} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-900 font-semibold">
                                                        {rowId != null ? `#${rowId}` : "-"}
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
                                                            {/* View icon */}
                                                            <button
                                                                type="button"
                                                                className="lims-icon-button"
                                                                onClick={() => navigate(`/samples/requests/${rowId}`)}
                                                                aria-label={t("view", { defaultValue: "View" })}
                                                                title={t("view", { defaultValue: "View" })}
                                                                disabled={!canAct}
                                                            >
                                                                <Eye size={16} />
                                                            </button>

                                                            {/* Admin-only actions */}
                                                            {roleId === ROLE_ID.ADMIN ? (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        className={cx(
                                                                            "inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold",
                                                                            "bg-primary text-white hover:bg-primary/90",
                                                                            !canApprove && "opacity-50 cursor-not-allowed"
                                                                        )}
                                                                        disabled={!canApprove}
                                                                        onClick={() => openModal(r, "approve")}
                                                                        title={t("samples.pages.queue.actions.accept", { defaultValue: "Approve request" })}
                                                                    >
                                                                        {t("approve", { defaultValue: "Approve" })}
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        className={cx(
                                                                            "inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold border",
                                                                            "border-red-200 text-red-700 hover:bg-red-50",
                                                                            !canReturn && "opacity-50 cursor-not-allowed"
                                                                        )}
                                                                        disabled={!canReturn}
                                                                        onClick={() => openModal(r, "return")}
                                                                        title={t("samples.pages.queue.actions.return", { defaultValue: "Return request to client" })}
                                                                    >
                                                                        {t("samples.pages.queue.actions.returnBtn", { defaultValue: "Return" })}
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        className={cx(
                                                                            "inline-flex items-center rounded-xl px-3 py-1.5 text-xs font-semibold border",
                                                                            "border-gray-300 text-gray-700 hover:bg-gray-50",
                                                                            !canReceived && "opacity-50 cursor-not-allowed"
                                                                        )}
                                                                        disabled={!canReceived}
                                                                        onClick={() => openModal(r, "received")}
                                                                        title={t("samples.pages.queue.actions.received", { defaultValue: "Mark physically received" })}
                                                                    >
                                                                        {t("samples.pages.queue.actions.receivedBtn", { defaultValue: "Received" })}
                                                                    </button>
                                                                </>
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
                    sampleId={modalSampleId}
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
