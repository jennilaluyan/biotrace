import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import {
    fetchSampleRequestsQueue,
    type Paginator,
    type SampleRequestQueueRow,
} from "../../services/sampleRequestQueue";
import { updateRequestStatus } from "../../services/sampleRequestStatus";
import { UpdateRequestStatusModal } from "../../components/samples/UpdateRequestStatusModal";

type DateFilter = "all" | "today" | "7d" | "30d";
const PAGE_SIZE = 10;

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function formatMaybeDate(v?: string | null) {
    if (!v) return "-";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
}

function StatusPill({ value }: { value?: string | null }) {
    const v = String(value ?? "-").toLowerCase();
    const tones: Record<string, string> = {
        draft: "bg-slate-100 text-slate-700 border-slate-200",
        submitted: "bg-blue-50 text-blue-700 border-blue-200",
        returned: "bg-amber-50 text-amber-800 border-amber-200",
        ready_for_delivery: "bg-indigo-50 text-indigo-700 border-indigo-200",
        physically_received: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
    const tone = tones[v] ?? "bg-gray-50 text-gray-600 border-gray-200";
    return (
        <span
            className={cx(
                "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border",
                tone
            )}
            title={String(value ?? "-")}
        >
            {String(value ?? "-")}
        </span>
    );
}

type ApiError = {
    data?: {
        message?: string;
        error?: string;
        details?: Record<string, string[] | string>;
    };
};

const getErrorMessage = (err: unknown, fallback: string) => {
    const e = err as ApiError;
    const details = e?.data?.details;
    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstVal = firstKey ? details[firstKey] : undefined;
        if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
        if (typeof firstVal === "string" && firstVal) return firstVal;
    }
    return e?.data?.message ?? e?.data?.error ?? fallback;
};

export default function SampleRequestsQueuePage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canView = roleId === ROLE_ID.ADMIN;

    // ---- state ----
    const [pager, setPager] = useState<Paginator<SampleRequestQueueRow> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // filters
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [currentPage, setCurrentPage] = useState(1);

    // action state
    const [actionBusyId, setActionBusyId] = useState<number | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // return modal
    const [returnOpen, setReturnOpen] = useState(false);
    const [returnSampleId, setReturnSampleId] = useState<number | null>(null);
    const [returnCurrentStatus, setReturnCurrentStatus] = useState<string | null>(null);

    const loadQueue = async (opts?: { keepPage?: boolean }) => {
        try {
            setLoading(true);
            setError(null);

            const page = opts?.keepPage ? currentPage : 1;

            const data = await fetchSampleRequestsQueue({
                page,
                per_page: PAGE_SIZE,
                q: searchTerm.trim() || undefined,
                // ✅ FIX: backend expects request_status, bukan "status"
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
                "Failed to load request queue.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // initial + pagination
    useEffect(() => {
        if (!canView) return;
        loadQueue({ keepPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canView, currentPage]);

    // reset to page 1 when filters change
    useEffect(() => {
        if (!canView) return;
        setCurrentPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, statusFilter, dateFilter]);

    const rawItems = useMemo(() => pager?.data ?? [], [pager]);

    /**
     * ✅ STEP 6 (F1):
     * Queue = hanya request yang belum punya lab_sample_code.
     * (defensive filter; backend juga harusnya sudah benar)
     */
    const items = useMemo(() => {
        return rawItems.filter((r) => !r.lab_sample_code);
    }, [rawItems]);

    const total = pager?.total ?? 0;
    const totalPages = pager?.last_page ?? 1;

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setCurrentPage(page);
    };

    const clearFilters = () => {
        setSearchTerm("");
        setStatusFilter("");
        setDateFilter("all");
        setCurrentPage(1);
        loadQueue({ keepPage: false });
    };

    const openReturn = (sampleId: number, currentStatus?: string | null) => {
        setReturnSampleId(sampleId);
        setReturnCurrentStatus(currentStatus ?? null);
        setReturnOpen(true);
    };

    const closeReturn = () => {
        setReturnOpen(false);
        setReturnSampleId(null);
        setReturnCurrentStatus(null);
    };

    const doQuickStatus = async (
        sampleId: number,
        nextStatus: "ready_for_delivery" | "physically_received"
    ) => {
        try {
            setActionBusyId(sampleId);
            setActionError(null);
            await updateRequestStatus(sampleId, nextStatus, null);
            // reload list, keep current page (biar UX enak)
            await loadQueue({ keepPage: true });
        } catch (err: unknown) {
            setActionError(getErrorMessage(err, "Failed to update request status."));
        } finally {
            setActionBusyId(null);
        }
    };

    if (!canView) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not
                    allowed to access the request queue.
                </p>
                <Link to="/samples" className="mt-4 lims-btn-primary">
                    Back to samples
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        Sample Request Queue
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Incoming client requests that need admin review / triage.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button type="button" className="lims-btn" onClick={() => navigate(-1)}>
                        Back
                    </button>
                </div>
            </div>

            {/* Card */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="queue-search">
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
                                id="queue-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by request id, client, sample type…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="queue-status">
                            Status filter
                        </label>
                        <select
                            id="queue-status"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="">All statuses</option>
                            <option value="draft">draft</option>
                            <option value="submitted">submitted</option>
                            <option value="returned">returned</option>
                            <option value="ready_for_delivery">ready_for_delivery</option>
                            <option value="physically_received">physically_received</option>
                        </select>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="sr-only" htmlFor="queue-date">
                            Date filter
                        </label>
                        <select
                            id="queue-date"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All dates</option>
                            <option value="today">Today</option>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        className="lims-btn-primary"
                        onClick={() => loadQueue({ keepPage: false })}
                        disabled={loading}
                    >
                        Apply
                    </button>

                    <button
                        type="button"
                        className="lims-btn"
                        onClick={clearFilters}
                        disabled={loading}
                    >
                        Clear
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 md:px-6 py-4">
                    {loading && <div className="text-sm text-gray-600">Loading queue...</div>}

                    {error && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    {actionError && !loading && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded mb-4">
                            {actionError}
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            {items.length === 0 ? (
                                <div className="text-sm text-gray-600">No requests found.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">Request</th>
                                                <th className="px-4 py-3 text-left">Client</th>
                                                <th className="px-4 py-3 text-left">Sample Type</th>
                                                <th className="px-4 py-3 text-left">Code</th>
                                                <th className="px-4 py-3 text-left">Status</th>
                                                <th className="px-4 py-3 text-left">Updated</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {items.map((r, idx) => {
                                                const id = r.sample_id ?? r.id;
                                                const key = id ? `req-${id}` : `req-row-${idx}`;
                                                const displayTitle = (r.title ?? r.name ?? "").trim();
                                                const client = (r.client_name ?? "").trim();
                                                const sampleType = (r.sample_type ?? "-").trim();
                                                const code = String(r.lab_sample_code ?? r.code ?? "-").trim();
                                                const status = String(r.request_status ?? "-");
                                                const busy = !!id && actionBusyId === id;

                                                // gating rules (simple & masuk akal)
                                                const canReturn = !!id && status !== "physically_received";
                                                const canApprove =
                                                    !!id && (status === "submitted" || status === "returned");
                                                const canReceive = !!id && status === "ready_for_delivery";

                                                return (
                                                    <tr
                                                        key={key}
                                                        className="border-t border-gray-100 hover:bg-gray-50/60"
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">
                                                                {id ? `#${id}` : "-"}
                                                            </div>
                                                            {displayTitle ? (
                                                                <div className="text-xs text-gray-500 mt-0.5">
                                                                    {displayTitle}
                                                                </div>
                                                            ) : null}
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            {client || (r.client_id ? `Client #${r.client_id}` : "-")}
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            {sampleType || "-"}
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            <span className="font-mono text-xs">{code || "-"}</span>
                                                        </td>

                                                        <td className="px-4 py-3">
                                                            <StatusPill value={status} />
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            {formatMaybeDate(r.updated_at ?? r.created_at)}
                                                        </td>

                                                        <td className="px-4 py-3 text-right">
                                                            <div className="flex justify-end items-center gap-2 flex-wrap">
                                                                {/* View detail */}
                                                                {id ? (
                                                                    <Link
                                                                        to={`/samples/${id}`}
                                                                        className="lims-icon-button text-gray-600 inline-flex items-center justify-center"
                                                                        aria-label="Open sample detail"
                                                                        title="Open detail"
                                                                    >
                                                                        <svg
                                                                            viewBox="0 0 24 24"
                                                                            className="h-4 w-4"
                                                                            fill="none"
                                                                            stroke="currentColor"
                                                                            strokeWidth="1.8"
                                                                            strokeLinecap="round"
                                                                            strokeLinejoin="round"
                                                                        >
                                                                            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                                                            <circle cx="12" cy="12" r="3" />
                                                                        </svg>
                                                                    </Link>
                                                                ) : (
                                                                    <span className="text-xs text-gray-400">-</span>
                                                                )}

                                                                {/* Return */}
                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "px-3 py-1 rounded-full text-xs border",
                                                                        canReturn
                                                                            ? "bg-white text-red-700 border-red-200 hover:bg-red-50"
                                                                            : "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                                                    )}
                                                                    disabled={!canReturn || busy}
                                                                    onClick={() => id && openReturn(id, status)}
                                                                    title={
                                                                        canReturn
                                                                            ? "Return to client (requires note)"
                                                                            : "Return disabled"
                                                                    }
                                                                >
                                                                    {busy ? "..." : "Return"}
                                                                </button>

                                                                {/* Approve -> ready_for_delivery */}
                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "px-3 py-1 rounded-full text-xs border",
                                                                        canApprove
                                                                            ? "bg-white text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                                                                            : "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                                                    )}
                                                                    disabled={!canApprove || busy}
                                                                    onClick={() => id && doQuickStatus(id, "ready_for_delivery")}
                                                                    title={
                                                                        canApprove
                                                                            ? "Approve -> ready_for_delivery"
                                                                            : "Approve only when submitted/returned"
                                                                    }
                                                                >
                                                                    {busy ? "Saving..." : "Approve"}
                                                                </button>

                                                                {/* Mark physically_received */}
                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "px-3 py-1 rounded-full text-xs border",
                                                                        canReceive
                                                                            ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                                                                            : "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                                                                    )}
                                                                    disabled={!canReceive || busy}
                                                                    onClick={() => id && doQuickStatus(id, "physically_received")}
                                                                    title={
                                                                        canReceive
                                                                            ? "Mark physically received"
                                                                            : "Only available when ready_for_delivery"
                                                                    }
                                                                >
                                                                    {busy ? "Saving..." : "Received"}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {/* Pagination */}
                                    <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-gray-600">
                                        <div>
                                            Showing{" "}
                                            <span className="font-semibold">
                                                {total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
                                            </span>{" "}
                                            –{" "}
                                            <span className="font-semibold">
                                                {Math.min(currentPage * PAGE_SIZE, total)}
                                            </span>{" "}
                                            of <span className="font-semibold">{total}</span> requests
                                        </div>

                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handlePageChange(currentPage - 1)}
                                                disabled={currentPage === 1}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Previous
                                            </button>

                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                                <button
                                                    key={page}
                                                    type="button"
                                                    onClick={() => handlePageChange(page)}
                                                    className={cx(
                                                        "px-3 py-1 rounded-full text-xs border",
                                                        page === currentPage
                                                            ? "bg-primary text-white border-primary"
                                                            : "bg-white text-gray-700 hover:bg-gray-50"
                                                    )}
                                                >
                                                    {page}
                                                </button>
                                            ))}

                                            <button
                                                type="button"
                                                onClick={() => handlePageChange(currentPage + 1)}
                                                disabled={currentPage === totalPages}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Return modal */}
            <UpdateRequestStatusModal
                open={returnOpen}
                sampleId={returnSampleId}
                action="return"
                currentStatus={returnCurrentStatus}
                onClose={closeReturn}
                onUpdated={async () => {
                    await loadQueue({ keepPage: true });
                }}
            />
        </div>
    );
}
