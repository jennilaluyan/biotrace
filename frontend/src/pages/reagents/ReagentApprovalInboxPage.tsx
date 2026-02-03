import { useEffect, useMemo, useState } from "react";
import {
    approveReagentRequest,
    getReagentApproverInbox,
    rejectReagentRequest,
    ApproverInboxRow,
} from "../../services/reagentRequests";
import { getReagentRequestByLoo } from "../../services/reagentRequests";
import { formatDateTimeLocal } from "../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type DetailPayload = {
    request: any | null;
    items: any[];
    bookings: any[];
};

export default function ReagentApprovalInboxPage() {
    const [status, setStatus] = useState<
        "submitted" | "approved" | "rejected" | "all"
    >("submitted");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const perPage = 25;

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [rows, setRows] = useState<ApproverInboxRow[]>([]);
    const [meta, setMeta] = useState<any>(null);

    // detail drawer
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState<ApproverInboxRow | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailErr, setDetailErr] = useState<string | null>(null);
    const [detail, setDetail] = useState<DetailPayload | null>(null);

    // reject state
    const [rejecting, setRejecting] = useState(false);
    const [rejectNote, setRejectNote] = useState("");

    const [approving, setApproving] = useState(false);

    const totalPages = meta?.total_pages ?? 1;

    async function loadList() {
        setLoading(true);
        setErr(null);
        try {
            const res: any = await getReagentApproverInbox({
                status,
                search: search.trim() || undefined,
                page,
                per_page: perPage,
            });

            const payload = res?.data ?? res; // tolerate different ApiResponse wrappers
            const data = payload?.data ?? [];
            setRows(data);
            setMeta(payload?.meta ?? null);
        } catch (e: any) {
            setErr(e?.message || "Failed to load inbox.");
            setRows([]);
            setMeta(null);
        } finally {
            setLoading(false);
        }
    }

    async function loadDetail(loId: number) {
        setDetailLoading(true);
        setDetailErr(null);
        try {
            const res: any = await getReagentRequestByLoo(loId);
            const payload = res?.data ?? res;

            setDetail({
                request: payload?.request ?? null,
                items: payload?.items ?? [],
                bookings: payload?.bookings ?? [],
            });
        } catch (e: any) {
            setDetailErr(e?.message || "Failed to load request detail.");
            setDetail(null);
        } finally {
            setDetailLoading(false);
        }
    }

    function openDetail(row: ApproverInboxRow) {
        setActive(row);
        setOpen(true);
        setRejectNote("");
        setRejecting(false);
        setApproving(false);
        setDetail(null);
        if (row?.lo_id) loadDetail(row.lo_id);
    }

    function closeDetail() {
        setOpen(false);
        setActive(null);
        setDetail(null);
        setRejectNote("");
        setRejecting(false);
        setApproving(false);
        setDetailErr(null);
    }

    async function onApprove() {
        if (!active?.reagent_request_id) return;
        setApproving(true);
        try {
            await approveReagentRequest(active.reagent_request_id);
            closeDetail();
            await loadList();
        } catch (e: any) {
            setDetailErr(e?.message || "Failed to approve.");
        } finally {
            setApproving(false);
        }
    }

    async function onReject() {
        if (!active?.reagent_request_id) return;
        const note = rejectNote.trim();
        if (note.length < 3) return;

        setRejecting(true);
        try {
            await rejectReagentRequest(active.reagent_request_id, note);
            closeDetail();
            await loadList();
        } catch (e: any) {
            setDetailErr(e?.message || "Failed to reject.");
        } finally {
            setRejecting(false);
        }
    }

    useEffect(() => {
        loadList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, page]);

    const header = useMemo(() => {
        const count = rows.length;
        return `${count} request(s)`;
    }, [rows.length]);

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-xl font-extrabold text-gray-900">
                        Reagent Approval Inbox
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                        OM/LH review submitted reagent requests. Approve or reject with a
                        mandatory note.
                    </div>
                </div>

                <button
                    type="button"
                    onClick={loadList}
                    disabled={loading}
                    className={cx(
                        "rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700",
                        loading ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                    )}
                >
                    {loading ? "Loading..." : "Refresh"}
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-gray-200 bg-white overflow-hidden">
                    {(["submitted", "approved", "rejected", "all"] as const).map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => {
                                setPage(1);
                                setStatus(s);
                            }}
                            className={cx(
                                "px-3 py-2 text-sm font-semibold",
                                status === s ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-50"
                            )}
                        >
                            {s.toUpperCase()}
                        </button>
                    ))}
                </div>

                <div className="flex-1 min-w-60">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by LOO number or client name..."
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                    />
                </div>

                <button
                    type="button"
                    onClick={() => {
                        setPage(1);
                        loadList();
                    }}
                    className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-95"
                >
                    Search
                </button>

                <div className="text-xs text-gray-500">{header}</div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold">LOO</th>
                            <th className="px-4 py-3 text-left font-semibold">Client</th>
                            <th className="px-4 py-3 text-left font-semibold">Cycle</th>
                            <th className="px-4 py-3 text-left font-semibold">Items</th>
                            <th className="px-4 py-3 text-left font-semibold">Bookings</th>
                            <th className="px-4 py-3 text-left font-semibold">Submitted</th>
                            <th className="px-4 py-3 text-left font-semibold">Status</th>
                        </tr>
                    </thead>

                    <tbody className="border-t border-gray-100">
                        {err && !loading && (
                            <tr>
                                <td colSpan={7} className="px-4 py-3 text-sm text-red-700 bg-red-50">
                                    {err}
                                </td>
                            </tr>
                        )}

                        {!err && loading && (
                            <tr>
                                <td colSpan={7} className="px-4 py-3 text-sm text-gray-600">
                                    Loading inbox...
                                </td>
                            </tr>
                        )}

                        {!err && !loading && rows.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-3 text-sm text-gray-600">
                                    No requests found.
                                </td>
                            </tr>
                        )}

                        {!err &&
                            !loading &&
                            rows.map((r) => (
                                <tr
                                    key={r.reagent_request_id}
                                    className="border-t border-gray-100 hover:bg-gray-50/60 cursor-pointer"
                                    onClick={() => openDetail(r)}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <td className="px-4 py-3 font-semibold text-gray-900">
                                        {r.loo_number || `LOO #${r.lo_id}`}
                                    </td>
                                    <td className="px-4 py-3 text-gray-700">{r.client_name || "-"}</td>
                                    <td className="px-4 py-3 text-gray-700">{r.cycle_no ?? "-"}</td>
                                    <td className="px-4 py-3 text-gray-700">{r.items_count ?? 0}</td>
                                    <td className="px-4 py-3 text-gray-700">{r.bookings_count ?? 0}</td>
                                    <td className="px-4 py-3 text-gray-700">
                                        {r.submitted_at ? formatDateTimeLocal(r.submitted_at) : "-"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={cx(
                                                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border",
                                                r.status === "submitted" &&
                                                "border-amber-200 bg-amber-50 text-amber-800",
                                                r.status === "approved" &&
                                                "border-emerald-200 bg-emerald-50 text-emerald-800",
                                                r.status === "rejected" &&
                                                "border-rose-200 bg-rose-50 text-rose-800",
                                                r.status === "draft" && "border-gray-200 bg-gray-50 text-gray-700"
                                            )}
                                        >
                                            {String(r.status || "-").toUpperCase()}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                    Page {page} / {totalPages}
                </div>

                <div className="flex gap-2">
                    <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className={cx(
                            "rounded-xl border px-3 py-2 text-sm font-semibold",
                            page <= 1 ? "text-gray-400 bg-gray-50 cursor-not-allowed" : "hover:bg-gray-50"
                        )}
                    >
                        Prev
                    </button>
                    <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className={cx(
                            "rounded-xl border px-3 py-2 text-sm font-semibold",
                            page >= totalPages ? "text-gray-400 bg-gray-50 cursor-not-allowed" : "hover:bg-gray-50"
                        )}
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* Detail Drawer */}
            {open && (
                <div className="fixed inset-0 z-50">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/40"
                        aria-label="Close"
                        onClick={closeDetail}
                    />

                    <div
                        className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white shadow-xl border-l border-black/10"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 border-b flex items-start justify-between gap-3">
                            <div>
                                <div className="text-lg font-extrabold text-gray-900">
                                    {active?.loo_number || `LOO #${active?.lo_id}`}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Client: <span className="font-semibold">{active?.client_name || "-"}</span> •
                                    Cycle: <span className="font-semibold">{active?.cycle_no ?? "-"}</span>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Submitted:{" "}
                                    <span className="font-semibold">
                                        {active?.submitted_at ? formatDateTimeLocal(active.submitted_at) : "-"}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                                onClick={closeDetail}
                            >
                                Close
                            </button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto h-[calc(100%-80px)]">
                            {detailErr && (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {detailErr}
                                </div>
                            )}

                            {!detailErr && detailLoading && (
                                <div className="text-sm text-gray-600">Loading detail...</div>
                            )}

                            {!detailErr && !detailLoading && detail && (
                                <>
                                    {/* Items */}
                                    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                        <div className="px-4 py-3 border-b bg-gray-50">
                                            <div className="font-semibold text-gray-900">Request Items</div>
                                            <div className="text-xs text-gray-500 mt-1">Read-only snapshot</div>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead className="bg-white text-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left">Name</th>
                                                        <th className="px-4 py-3 text-left">Qty</th>
                                                        <th className="px-4 py-3 text-left">Unit</th>
                                                        <th className="px-4 py-3 text-left">Note</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="border-t border-gray-100">
                                                    {detail.items.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={4} className="px-4 py-3 text-sm text-gray-600">
                                                                No items.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        detail.items.map((it: any, idx: number) => (
                                                            <tr key={idx} className="border-t border-gray-100">
                                                                <td className="px-4 py-3 font-semibold text-gray-900">
                                                                    {it?.name || it?.reagent_name || "-"}
                                                                </td>
                                                                <td className="px-4 py-3 text-gray-700">{String(it?.qty ?? 0)}</td>
                                                                <td className="px-4 py-3 text-gray-700">
                                                                    {it?.unit_text || it?.unit || it?.default_unit_text || "-"}
                                                                </td>
                                                                <td className="px-4 py-3 text-gray-700">{it?.note || "-"}</td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Bookings */}
                                    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                        <div className="px-4 py-3 border-b bg-gray-50">
                                            <div className="font-semibold text-gray-900">Equipment Bookings</div>
                                            <div className="text-xs text-gray-500 mt-1">Planned schedule</div>
                                        </div>

                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-sm">
                                                <thead className="bg-white text-gray-700">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left">Equipment</th>
                                                        <th className="px-4 py-3 text-left">Planned Start</th>
                                                        <th className="px-4 py-3 text-left">Planned End</th>
                                                        <th className="px-4 py-3 text-left">Note</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="border-t border-gray-100">
                                                    {detail.bookings.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={4} className="px-4 py-3 text-sm text-gray-600">
                                                                No bookings.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        detail.bookings.map((b: any, idx: number) => (
                                                            <tr key={idx} className="border-t border-gray-100">
                                                                <td className="px-4 py-3 font-semibold text-gray-900">
                                                                    {b?.equipment_name || `Equipment #${b?.equipment_id ?? "-"}`}
                                                                </td>
                                                                <td className="px-4 py-3 text-gray-700">
                                                                    {b?.planned_start_at ? formatDateTimeLocal(b.planned_start_at) : "-"}
                                                                </td>
                                                                <td className="px-4 py-3 text-gray-700">
                                                                    {b?.planned_end_at ? formatDateTimeLocal(b.planned_end_at) : "-"}
                                                                </td>
                                                                <td className="px-4 py-3 text-gray-700">{b?.note || "-"}</td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                                        <div className="font-semibold text-gray-900">Decision</div>

                                        {active?.status !== "submitted" ? (
                                            <div className="text-sm text-gray-600">
                                                This request is already <b>{active?.status}</b>.
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={onApprove}
                                                        disabled={approving || rejecting}
                                                        className={cx(
                                                            "rounded-xl px-4 py-2 text-sm font-semibold",
                                                            approving || rejecting
                                                                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                                                : "bg-emerald-600 text-white hover:opacity-95"
                                                        )}
                                                    >
                                                        {approving ? "Approving..." : "Approve"}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            // toggle reject input
                                                            setRejectNote("");
                                                        }}
                                                        className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                                                    >
                                                        Prepare Reject Note
                                                    </button>
                                                </div>

                                                <div>
                                                    <label className="text-xs font-semibold text-gray-700">
                                                        Reject note (required if rejecting)
                                                    </label>
                                                    <textarea
                                                        value={rejectNote}
                                                        onChange={(e) => setRejectNote(e.target.value)}
                                                        rows={3}
                                                        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                                        placeholder="Explain why this request is rejected (min 3 chars)..."
                                                    />
                                                    <div className="mt-2 flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={onReject}
                                                            disabled={rejecting || approving || rejectNote.trim().length < 3}
                                                            className={cx(
                                                                "rounded-xl px-4 py-2 text-sm font-semibold",
                                                                rejecting || approving || rejectNote.trim().length < 3
                                                                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                                                    : "bg-rose-600 text-white hover:opacity-95"
                                                            )}
                                                            title={
                                                                rejectNote.trim().length < 3
                                                                    ? "Reject note is required."
                                                                    : undefined
                                                            }
                                                        >
                                                            {rejecting ? "Rejecting..." : "Reject"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
