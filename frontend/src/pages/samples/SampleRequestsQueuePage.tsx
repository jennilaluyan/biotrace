import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, RefreshCw } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import {
    fetchSampleRequestsQueue,
    type Paginator,
    type SampleRequestQueueRow,
} from "../../services/sampleRequestQueue";
import { UpdateRequestStatusModal } from "../../components/samples/UpdateRequestStatusModal";

type DateFilter = "all" | "today" | "7d" | "30d";
const PAGE_SIZE = 15;

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

const normalizeStatusLabel = (raw?: string | null) => {
    const s = String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ");

    // small friendly shortenings
    if (s === "ready for delivery") return "ready for delivery";
    if (s === "physically received") return "received";
    if (s === "awaiting verification") return "awaiting verification";
    if (s === "in transit to collector") return "in transit";
    if (s === "under inspection") return "under inspection";
    if (s === "returned to admin") return "returned to admin";
    if (s === "needs revision") return "needs revision";
    if (s === "intake checklist passed") return "intake passed";

    return s || "-";
};

const statusTone = (raw?: string | null) => {
    const s = String(raw ?? "").toLowerCase();

    // normalize common underscores just for matching
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
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to load sample requests queue.";
            setError(msg);
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
            setError("Cannot open request: missing sample_id in queue row.");
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
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to access this module.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header (match SamplesPage) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="flex flex-col">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample Requests Queue</h1>
                    <p className="text-sm text-gray-600">
                        Requests here are <span className="font-semibold">not</span> lab samples yet (no lab code).
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={() => loadQueue({ keepPage: true })}
                        aria-label="Refresh"
                        title="Refresh"
                        disabled={loading}
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {/* Card */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters (match SamplesPage style) */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    {/* Search */}
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="rq-search">
                            Search requests
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <circle cx="11" cy="11" r="6" />
                                    <line x1="16" y1="16" x2="21" y2="21" />
                                </svg>
                            </span>
                            <input
                                id="rq-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by sample type, status, client…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Status */}
                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="rq-status">
                            Status
                        </label>
                        <select
                            id="rq-status"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="">All statuses</option>

                            {/* common */}
                            <option value="submitted">submitted</option>
                            <option value="ready_for_delivery">ready for delivery</option>
                            <option value="physically_received">physically received</option>
                            <option value="returned">returned</option>
                            <option value="needs_revision">needs revision</option>

                            {/* workflow */}
                            <option value="in_transit_to_collector">in transit</option>
                            <option value="under_inspection">under inspection</option>
                            <option value="returned_to_admin">returned to admin</option>
                            <option value="intake_checklist_passed">intake passed</option>

                            {/* gate */}
                            <option value="awaiting_verification">awaiting verification</option>
                        </select>
                    </div>

                    {/* Date filter */}
                    <div className="w-full md:w-44">
                        <label className="sr-only" htmlFor="rq-date">
                            Date
                        </label>
                        <select
                            id="rq-date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All</option>
                            <option value="today">Today</option>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                        </select>
                    </div>
                </div>

                {/* Body */}
                <div className="px-4 md:px-6 py-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
                    )}

                    {loading ? (
                        <div className="text-sm text-gray-600">Loading queue…</div>
                    ) : items.length === 0 ? (
                        <div className="text-sm text-gray-600">No pending sample requests found.</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">Request ID</th>
                                            <th className="text-left font-semibold px-4 py-3">Sample Type</th>
                                            <th className="text-left font-semibold px-4 py-3">Client</th>
                                            <th className="text-left font-semibold px-4 py-3">Status</th>
                                            <th className="text-right font-semibold px-4 py-3">Actions</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((r, idx) => {
                                            const id = r.sample_id;
                                            const canAct = id != null;
                                            const st = String(r.request_status ?? "").toLowerCase();

                                            const canApprove = canAct && (st === "submitted" || st === "returned" || st === "needs_revision");
                                            const canReturn = canAct && (st === "submitted" || st === "returned" || st === "needs_revision");
                                            const canReceived = canAct && st === "ready_for_delivery";

                                            const statusLabel = normalizeStatusLabel(r.request_status);

                                            return (
                                                <tr key={id ?? `row-${idx}`} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-900 font-semibold">{id ?? "-"}</td>

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
                                                            {/* View icon only */}
                                                            <button
                                                                type="button"
                                                                className="lims-icon-button"
                                                                onClick={() => navigate(`/samples/requests/${id}`)}
                                                                aria-label="View request"
                                                                title="View request"
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
                                                                        title="Approve request"
                                                                    >
                                                                        Approve
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
                                                                        title="Return request to client"
                                                                    >
                                                                        Return
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
                                                                        title="Mark physically received"
                                                                    >
                                                                        Received
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

                            {/* Pagination */}
                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    Page <span className="font-semibold">{pager?.current_page ?? 1}</span> of{" "}
                                    <span className="font-semibold">{totalPages}</span> —{" "}
                                    <span className="font-semibold">{total}</span> total
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage <= 1}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    >
                                        Prev
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage >= totalPages}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    >
                                        Next
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
