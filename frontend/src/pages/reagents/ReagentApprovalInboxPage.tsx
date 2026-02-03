import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

// Normalize berbagai bentuk wrapper response:
// - axios: { data: ... }
// - ApiResponse: { data: { ... } }
// - nested: { data: { data: { ... } } }
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

function EyeIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
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

    async function load() {
        setErr(null);
        setSuccess(null);
        setLoading(true);

        try {
            const res = await getReagentApproverInbox({
                status,
                search: search.trim() || undefined,
                page,
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
        } catch (e: any) {
            setErr(getErrorMessage(e, "Failed to load reagent approvals inbox"));
            setRows([]);
            setMeta(null);
        } finally {
            setLoading(false);
        }
    }

    // reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [status, search]);

    // reload when status/page changes
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

                <button type="button" onClick={load} className="btn-outline self-start md:self-auto">
                    Refresh
                </button>
            </div>

            {/* Feedback */}
            {success && (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {success}
                </div>
            )}
            {err && (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {err}
                </div>
            )}

            {/* Filters */}
            <div className="mt-4 rounded-2xl border bg-white shadow-sm">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-col md:flex-row gap-2 md:items-center">
                        <select
                            className="h-10 rounded-xl border px-3 text-sm"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as any)}
                        >
                            <option value="submitted">Submitted</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="draft">Draft</option>
                            <option value="all">All</option>
                        </select>

                        <input
                            className="h-10 w-full md:w-[340px] rounded-xl border px-3 text-sm"
                            placeholder="Search by LOO number / client name…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="text-xs text-gray-500">
                        Total: <span className="font-semibold">{totalLabel}</span>
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
                                <thead className="bg-gray-50">
                                    <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                        <th className="px-4 py-3 text-left">LOO</th>
                                        <th className="px-4 py-3 text-left">Client</th>
                                        <th className="px-4 py-3 text-left">Status</th>
                                        <th className="px-4 py-3 text-left">Items</th>
                                        <th className="px-4 py-3 text-left">Bookings</th>
                                        <th className="px-4 py-3 text-left">Submitted</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {rows.map((r) => {
                                        const busy = busyId === r.reagent_request_id;
                                        const st = String(r.status ?? "");
                                        const canAct = st === "submitted";

                                        const loId = Number((r as any).lo_id ?? 0); // wajib: detail fetch by LOO id

                                        return (
                                            <tr key={r.reagent_request_id} className="border-t border-gray-100 hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{r.loo_number ?? `LOO #${r.lo_id}`}</div>
                                                    <div className="text-[11px] text-gray-500">
                                                        req_id: {r.reagent_request_id} • cycle {r.cycle_no}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">{r.client_name ?? "-"}</td>

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

                                                <td className="px-4 py-3 text-right">
                                                    <div className="inline-flex items-center gap-2">
                                                        <Link to={`/reagents/approvals/loo/${loId}`}
                                                            className={cx(
                                                                "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold",
                                                                loId > 0 ? "hover:bg-gray-50" : "opacity-50 cursor-not-allowed"
                                                            )}
                                                            title={loId > 0 ? "View details" : "Missing LOO id"}
                                                            onClick={(e) => {
                                                                if (!(loId > 0)) e.preventDefault();
                                                            }}
                                                        >
                                                            <EyeIcon />
                                                        </Link>

                                                        {canAct ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className="lims-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    onClick={() => openDecision(r, "approve")}
                                                                >
                                                                    {busy ? "..." : "Approve"}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className="lims-btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    onClick={() => openDecision(r, "reject")}
                                                                >
                                                                    {busy ? "..." : "Reject"}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-gray-500">—</span>
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
                                className="rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={!canPrev || loading}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                Prev
                            </button>
                            <button
                                type="button"
                                className="rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                disabled={!canNext || loading}
                                onClick={() => setPage((p) => p + 1)}
                            >
                                Next
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
