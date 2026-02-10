import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, X } from "lucide-react";

import ReagentApprovalDecisionModal from "../../components/reagents/ReagentApprovalDecisionModal";
import {
    approveReagentRequest,
    rejectReagentRequest,
    getReagentApproverInbox,
    type ApproverInboxRow,
} from "../../services/reagentRequests";
import { getErrorMessage } from "../../utils/errors";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function unwrapApi(res: any) {
    let x = res?.data ?? res;
    for (let i = 0; i < 5; i++) {
        if (x && typeof x === "object" && "data" in x && (x as any).data != null) {
            x = (x as any).data;
            continue;
        }
        break;
    }
    return x;
}

export default function ReagentApprovalInboxPage() {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [status, setStatus] = useState<"submitted" | "approved" | "rejected" | "draft" | "all">("submitted");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [perPage] = useState(25);

    const [rows, setRows] = useState<ApproverInboxRow[]>([]);
    const [meta, setMeta] = useState<{ page: number; per_page: number; total: number; total_pages: number } | null>(
        null
    );

    const [busyId, setBusyId] = useState<number | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"approve" | "reject">("approve");
    const [activeRow, setActiveRow] = useState<ApproverInboxRow | null>(null);

    function flash(msg: string) {
        setSuccess(msg);
        window.setTimeout(() => setSuccess(null), 2500);
    }

    async function load(opts?: { resetPage?: boolean }) {
        setErr(null);
        setSuccess(null);
        setLoading(true);

        const nextPage = opts?.resetPage ? 1 : page;

        try {
            const res = await getReagentApproverInbox({
                status,
                search: search.trim() || undefined,
                page: nextPage,
                per_page: perPage,
            });

            const payload = unwrapApi(res);

            const data: ApproverInboxRow[] = Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload)
                    ? payload
                    : [];

            setRows(data);
            setMeta(payload?.meta ?? null);
            if (opts?.resetPage) setPage(1);
        } catch (e: any) {
            setErr(getErrorMessage(e, "Failed to load reagent approvals inbox"));
            setRows([]);
            setMeta(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, page]);

    const totalLabel = useMemo(() => {
        const t = meta?.total ?? rows.length;
        return String(t);
    }, [meta, rows.length]);

    const canPrev = page > 1;
    const canNext = meta?.total_pages ? page < meta.total_pages : rows.length === perPage;

    function openDecision(row: ApproverInboxRow, mode: "approve" | "reject") {
        setActiveRow(row);
        setModalMode(mode);
        setModalOpen(true);
    }

    async function confirmDecision(note?: string) {
        if (!activeRow?.reagent_request_id) return;

        setBusyId(activeRow.reagent_request_id);
        setErr(null);
        setSuccess(null);

        try {
            if (modalMode === "approve") {
                await approveReagentRequest(activeRow.reagent_request_id);
                flash("Approved.");
            } else {
                const n = String(note ?? "").trim();
                if (n.length < 3) {
                    setErr("Reject note wajib diisi (min 3 karakter).");
                    setBusyId(null);
                    return;
                }
                await rejectReagentRequest(activeRow.reagent_request_id, n);
                flash("Rejected.");
            }

            setModalOpen(false);
            await load();
        } catch (e: any) {
            setErr(getErrorMessage(e, `Failed to ${modalMode}`));
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Reagent Approvals</h1>
                    <p className="text-xs text-gray-500 mt-1">Approve/Reject reagent requests (OM/LH).</p>
                </div>

                <button
                    type="button"
                    onClick={() => load()}
                    className="lims-icon-button self-start md:self-auto"
                    aria-label="Refresh"
                    title="Refresh"
                    disabled={loading}
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Feedback */}
            {success && (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {success}
                </div>
            )}
            {err && (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
            )}

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="rr-status">
                            Status
                        </label>
                        <select
                            id="rr-status"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as any)}
                        >
                            <option value="submitted">Submitted</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="draft">Draft</option>
                            <option value="all">All</option>
                        </select>
                    </div>

                    <div className="flex-1">
                        <label className="sr-only" htmlFor="rr-search">
                            Search
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="rr-search"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder="Search by LOO number / client name…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") load({ resetPage: true });
                                }}
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3">
                        <div className="text-xs text-gray-500">
                            Total: <span className="font-semibold">{totalLabel}</span>
                        </div>

                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={() => load({ resetPage: true })}
                            aria-label="Apply search"
                            title="Apply search"
                            disabled={loading}
                        >
                            <Search size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading ? (
                        <div className="text-sm text-gray-600">Loading approvals…</div>
                    ) : rows.length === 0 ? (
                        <div className="text-sm text-gray-600">Tidak ada data.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-white text-gray-700 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left font-semibold px-4 py-3">LOO</th>
                                        <th className="text-left font-semibold px-4 py-3">Status</th>
                                        <th className="text-left font-semibold px-4 py-3">Items</th>
                                        <th className="text-left font-semibold px-4 py-3">Bookings</th>
                                        <th className="text-left font-semibold px-4 py-3">Submitted</th>
                                        <th className="text-right font-semibold px-4 py-3">Actions</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-gray-100">
                                    {rows.map((r) => {
                                        const busy = busyId === r.reagent_request_id;
                                        const st = String(r.status ?? "");
                                        const canAct = st === "submitted";

                                        const loId = Number((r as any).lo_id ?? 0);

                                        return (
                                            <tr key={r.reagent_request_id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{r.loo_number ?? `LOO #${r.lo_id}`}</div>
                                                    <div className="text-[11px] text-gray-500">
                                                        req_id: {r.reagent_request_id} • cycle {r.cycle_no}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span
                                                        className={cx(
                                                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                                            st === "submitted"
                                                                ? "bg-amber-100 text-amber-800"
                                                                : st === "approved"
                                                                    ? "bg-emerald-100 text-emerald-800"
                                                                    : st === "rejected"
                                                                        ? "bg-red-100 text-red-800"
                                                                        : "bg-gray-100 text-gray-700"
                                                        )}
                                                    >
                                                        {st}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">{r.items_count ?? 0}</td>
                                                <td className="px-4 py-3 text-gray-700">{r.bookings_count ?? 0}</td>

                                                <td className="px-4 py-3 text-gray-700">
                                                    {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "-"}
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Link
                                                            to={`/reagents/approvals/loo/${loId}`}
                                                            className={cx("lims-icon-button", loId > 0 ? "" : "opacity-40 cursor-not-allowed")}
                                                            aria-label="View detail"
                                                            title={loId > 0 ? "View detail" : "Missing LOO id"}
                                                            onClick={(e) => {
                                                                if (!(loId > 0)) e.preventDefault();
                                                            }}
                                                        >
                                                            <Eye size={16} />
                                                        </Link>

                                                        {canAct ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className={cx("lims-icon-button", busy && "opacity-40 cursor-not-allowed")}
                                                                    onClick={() => openDecision(r, "approve")}
                                                                    aria-label="Approve"
                                                                    title="Approve"
                                                                >
                                                                    <Check size={16} />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className={cx(
                                                                        "lims-icon-button lims-icon-button--danger",
                                                                        busy && "opacity-40 cursor-not-allowed"
                                                                    )}
                                                                    onClick={() => openDecision(r, "reject")}
                                                                    aria-label="Reject"
                                                                    title="Reject"
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    <div className="mt-4 flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                            Page <span className="font-semibold">{page}</span>
                            {meta?.total_pages ? (
                                <>
                                    {" "}
                                    / <span className="font-semibold">{meta.total_pages}</span>
                                </>
                            ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className={cx("lims-icon-button", (!canPrev || loading) && "opacity-40 cursor-not-allowed")}
                                disabled={!canPrev || loading}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                aria-label="Prev"
                                title="Prev"
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <button
                                type="button"
                                className={cx("lims-icon-button", (!canNext || loading) && "opacity-40 cursor-not-allowed")}
                                disabled={!canNext || loading}
                                onClick={() => setPage((p) => p + 1)}
                                aria-label="Next"
                                title="Next"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <ReagentApprovalDecisionModal
                open={modalOpen}
                mode={modalMode}
                busy={busyId != null}
                request={activeRow as any}
                looNumber={(activeRow as any)?.loo_number ?? null}
                clientName={(activeRow as any)?.client_name ?? null}
                itemsCount={(activeRow as any)?.items_count ?? 0}
                bookingsCount={(activeRow as any)?.bookings_count ?? 0}
                onClose={() => (busyId != null ? null : setModalOpen(false))}
                onConfirm={confirmDecision}
            />
        </div>
    );
}
