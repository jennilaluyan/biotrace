import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, X } from "lucide-react";

import { approveSampleIdChange, listSampleIdChanges, rejectSampleIdChange, type SampleIdChangeRow } from "../../services/sampleIdChanges";
import { getErrorMessage } from "../../utils/errors";
import SampleIdChangeDecisionModal from "../../components/samples/SampleIdChangeDecisionModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export default function SampleIdChangeApprovalsInboxPage() {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "all">("pending");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [perPage] = useState(25);

    const [rows, setRows] = useState<SampleIdChangeRow[]>([]);
    const [meta, setMeta] = useState<{ page?: number; per_page?: number; total?: number; total_pages?: number } | null>(null);

    const [busyId, setBusyId] = useState<number | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"approve" | "reject">("approve");
    const [activeRow, setActiveRow] = useState<SampleIdChangeRow | null>(null);

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
            const res = await listSampleIdChanges({
                status,
                search: search.trim() || undefined,
                page: nextPage,
                per_page: perPage,
            });

            setRows(res.data ?? []);
            setMeta((res as any).meta ?? null);
            if (opts?.resetPage) setPage(1);
        } catch (e: any) {
            setErr(getErrorMessage(e, "Failed to load sample id change approvals"));
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

    const totalPages = meta?.total_pages ?? 1;
    const canPrev = page > 1;
    const canNext = meta?.total_pages ? page < totalPages : rows.length === perPage;

    function openDecision(row: SampleIdChangeRow, mode: "approve" | "reject") {
        setActiveRow(row);
        setModalMode(mode);
        setModalOpen(true);
    }

    async function confirmDecision(note?: string) {
        const id = Number(activeRow?.id ?? activeRow?.sample_id_change_id ?? 0);
        if (!Number.isFinite(id) || id <= 0) return;

        setBusyId(id);
        setErr(null);
        setSuccess(null);

        try {
            if (modalMode === "approve") {
                await approveSampleIdChange(id);
                flash("Approved.");
            } else {
                const n = String(note ?? "").trim();
                if (n.length < 3) {
                    setErr("Reject reason wajib diisi (min 3 karakter).");
                    setBusyId(null);
                    return;
                }
                await rejectSampleIdChange(id, n);
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
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample ID Change Approvals</h1>
                    <p className="text-xs text-gray-500 mt-1">OM/LH — approve/reject proposed Sample ID changes.</p>
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

            {success ? (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {success}
                </div>
            ) : null}

            {err ? (
                <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
            ) : null}

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="sid-status">
                            Status
                        </label>
                        <select
                            id="sid-status"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as any)}
                        >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="all">All</option>
                        </select>
                    </div>

                    <div className="flex-1">
                        <label className="sr-only" htmlFor="sid-search">
                            Search
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="sid-search"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder="Search by client / request id / proposed id…"
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
                                        <th className="text-left font-semibold px-4 py-3">Request</th>
                                        <th className="text-left font-semibold px-4 py-3">Client</th>
                                        <th className="text-left font-semibold px-4 py-3">Suggested</th>
                                        <th className="text-left font-semibold px-4 py-3">Proposed</th>
                                        <th className="text-left font-semibold px-4 py-3">Status</th>
                                        <th className="text-right font-semibold px-4 py-3">Actions</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-gray-100">
                                    {rows.map((r, idx) => {
                                        const id = Number(r.id ?? r.sample_id_change_id ?? 0);
                                        const busy = busyId === id;

                                        const st = String(r.status ?? "pending").toLowerCase();
                                        const canAct = st === "pending" || st === "submitted" || st === "waiting";

                                        const suggested = r.suggested_lab_sample_code ?? r.suggested_sample_id ?? "-";
                                        const proposed = r.proposed_lab_sample_code ?? r.proposed_sample_id ?? "-";
                                        const requestId = r.sample_id ?? r.request_id ?? "-";

                                        return (
                                            <tr key={id > 0 ? id : `row-${idx}`} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">#{requestId}</div>
                                                    <div className="text-[11px] text-gray-500">change #{id > 0 ? id : "-"}</div>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{r.client_name ?? "-"}</span>
                                                        <span className="text-xs text-gray-500">{r.client_email ?? "-"}</span>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 font-mono text-xs text-gray-700">{String(suggested)}</td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-700">{String(proposed)}</td>

                                                <td className="px-4 py-3">
                                                    <span
                                                        className={cx(
                                                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                                            st === "pending" || st === "submitted" || st === "waiting"
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

                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Link
                                                            to={`/samples/sample-id-changes/${id}`}
                                                            className={cx("lims-icon-button", id > 0 ? "" : "opacity-40 cursor-not-allowed")}
                                                            aria-label="View detail"
                                                            title="View detail"
                                                            onClick={(e) => {
                                                                if (!(id > 0)) e.preventDefault();
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

            <SampleIdChangeDecisionModal
                open={modalOpen}
                mode={modalMode}
                busy={busyId != null}
                row={activeRow}
                onClose={() => (busyId != null ? null : setModalOpen(false))}
                onConfirm={confirmDecision}
            />
        </div>
    );
}
