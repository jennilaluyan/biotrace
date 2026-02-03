import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
    getReagentRequestByLoo,
    approveReagentRequest,
    rejectReagentRequest,
    type ReagentRequestRow,
    type ReagentRequestItemRow,
    type EquipmentBookingRow,
} from "../../services/reagentRequests";
import { apiGet } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import ReagentApprovalDecisionModal from "../../components/reagents/ReagentApprovalDecisionModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

// unwrap like other pages
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

type LooDetail = {
    lo_id: number;
    number?: string | null;
    generated_at?: string | null;
    items?: Array<{
        sample_id?: number;
        lab_sample_code?: string | null;
        parameters?: any;
        sample?: any;
    }>;
    sample?: any;
    client?: any;
};

export default function ReagentApprovalDetailPage() {
    const params = useParams();
    const nav = useNavigate();

    const id = Number(params.requestId);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [request, setRequest] = useState<ReagentRequestRow | null>(null);
    const [items, setItems] = useState<ReagentRequestItemRow[]>([]);
    const [bookings, setBookings] = useState<EquipmentBookingRow[]>([]);

    const [loo, setLoo] = useState<LooDetail | null>(null);

    // decision modal
    const [modalOpen, setModalOpen] = useState(false);
    const [decisionMode, setDecisionMode] = useState<"approve" | "reject">("approve");
    const [busy, setBusy] = useState(false);

    function flash(msg: string) {
        setSuccess(msg);
        window.setTimeout(() => setSuccess(null), 2500);
    }

    async function load() {
        if (!Number.isFinite(id) || id <= 0) return;

        setLoading(true);
        setErr(null);
        setSuccess(null);

        try {
            // 1) load reagent request detail
            const res = await getReagentRequestByLoo(id);
            const payload = unwrapApi(res);

            const rr = payload?.request ?? null;
            const it = payload?.items ?? [];
            const bk = payload?.bookings ?? [];

            setRequest(rr);
            setItems(it);
            setBookings(bk);

            // 2) load LOO detail to show sample list
            const loId = Number(rr?.lo_id ?? 0);
            if (loId > 0) {
                const looRes = await apiGet(`/v1/loo/${loId}`);
                const looPayload = unwrapApi(looRes);
                setLoo(looPayload ?? null);
            } else {
                setLoo(null);
            }
        } catch (e: any) {
            setErr(getErrorMessage(e, "Failed to load approval detail"));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const title = useMemo(() => {
        const looNum = (loo as any)?.number ?? (request as any)?.loo_number ?? null;
        return looNum ? `Reagent Approval • ${looNum}` : `Reagent Approval • #${id}`;
    }, [loo, request, id]);

    const canAct = String(request?.status ?? "") === "submitted";

    function openApprove() {
        setDecisionMode("approve");
        setModalOpen(true);
    }

    function openReject() {
        setDecisionMode("reject");
        setModalOpen(true);
    }

    async function confirmDecision(rejectNote?: string) {
        if (!request?.reagent_request_id) return;

        setBusy(true);
        setErr(null);
        setSuccess(null);

        try {
            if (decisionMode === "approve") {
                await approveReagentRequest(request.reagent_request_id);
                flash("Approved.");
            } else {
                const note = String(rejectNote ?? "").trim();
                if (note.length < 3) {
                    setErr("Reject note wajib diisi (min 3 karakter).");
                    setBusy(false);
                    return;
                }
                await rejectReagentRequest(request.reagent_request_id, note);
                flash("Rejected.");
            }

            setModalOpen(false);
            await load();
        } catch (e: any) {
            setErr(getErrorMessage(e, `Failed to ${decisionMode}`));
        } finally {
            setBusy(false);
        }
    }

    if (!Number.isFinite(id) || id <= 0) {
        return <div className="p-4 text-red-600">Invalid requestId</div>;
    }

    if (loading) {
        return <div className="p-4">Loading approval detail…</div>;
    }

    return (
        <div className="p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
                    <div className="mt-1 text-sm text-gray-600">
                        request_id: <span className="font-semibold">{request?.reagent_request_id ?? id}</span>
                        {request?.cycle_no ? <span className="text-gray-500"> • cycle {request.cycle_no}</span> : null}
                    </div>
                    <div className="mt-2">
                        <span
                            className={cx(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                request?.status === "submitted"
                                    ? "bg-amber-100 text-amber-800"
                                    : request?.status === "approved"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : request?.status === "rejected"
                                            ? "bg-red-100 text-red-800"
                                            : "bg-gray-100 text-gray-700"
                            )}
                        >
                            {request?.status ?? "-"}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button type="button" className="btn-outline" onClick={() => nav(-1)}>
                        Back
                    </button>

                    <button
                        type="button"
                        className={cx("lims-btn-primary", !canAct || busy ? "opacity-60 cursor-not-allowed" : "")}
                        disabled={!canAct || busy}
                        onClick={openApprove}
                        title={!canAct ? "Only submitted requests can be approved" : ""}
                    >
                        Approve
                    </button>

                    <button
                        type="button"
                        className={cx("lims-btn-danger", !canAct || busy ? "opacity-60 cursor-not-allowed" : "")}
                        disabled={!canAct || busy}
                        onClick={openReject}
                        title={!canAct ? "Only submitted requests can be rejected" : ""}
                    >
                        Reject
                    </button>
                </div>
            </div>

            {success && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {success}
                </div>
            )}

            {err && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {err}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* LOO samples */}
                <div className="rounded-2xl border bg-white shadow-sm">
                    <div className="border-b px-4 py-3">
                        <div className="font-semibold text-gray-900">LOO Samples</div>
                        <div className="text-xs text-gray-500 mt-1">
                            {loo?.number ? (
                                <>
                                    LOO: <span className="font-semibold">{loo.number}</span>
                                </>
                            ) : (
                                "LOO detail not available"
                            )}
                        </div>
                    </div>

                    <div className="p-4">
                        {loo?.items?.length ? (
                            <div className="space-y-2">
                                {loo.items.map((it: any, idx: number) => (
                                    <div key={`${it.sample_id ?? idx}`} className="rounded-xl border px-3 py-2">
                                        <div className="text-sm font-semibold text-gray-900">
                                            {it.lab_sample_code ?? it.sample?.lab_sample_code ?? "-"}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            sample_id: {it.sample_id ?? it.sample?.sample_id ?? "-"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-600">No sample list found for this LOO.</div>
                        )}
                    </div>
                </div>

                {/* Request content */}
                <div className="rounded-2xl border bg-white shadow-sm">
                    <div className="border-b px-4 py-3">
                        <div className="font-semibold text-gray-900">Request Content</div>
                        <div className="text-xs text-gray-500 mt-1">
                            Items: <span className="font-semibold">{items.length}</span> • Bookings:{" "}
                            <span className="font-semibold">{bookings.length}</span>
                        </div>
                    </div>

                    <div className="p-4">
                        <div className="font-semibold text-sm text-gray-900 mb-2">Items</div>
                        {items.length ? (
                            <div className="space-y-2">
                                {items.map((it: any) => (
                                    <div
                                        key={it.reagent_request_item_id ?? `${it.catalog_item_id}-${it.item_name}`}
                                        className="rounded-xl border px-3 py-2"
                                    >
                                        <div className="text-sm font-semibold text-gray-900">{it.item_name ?? "-"}</div>
                                        <div className="text-xs text-gray-600">
                                            qty: <span className="font-semibold">{it.qty ?? 0}</span> {it.unit_text ?? ""} • type:{" "}
                                            <span className="font-semibold">{it.item_type ?? "-"}</span>
                                        </div>
                                        {it.note ? <div className="text-xs text-gray-500 mt-1">note: {it.note}</div> : null}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-600">No items.</div>
                        )}

                        <div className="font-semibold text-sm text-gray-900 mt-5 mb-2">Equipment Bookings</div>
                        {bookings.length ? (
                            <div className="space-y-2">
                                {bookings.map((b: any) => (
                                    <div
                                        key={b.booking_id ?? `${b.equipment_id}-${b.planned_start_at}`}
                                        className="rounded-xl border px-3 py-2"
                                    >
                                        <div className="text-sm font-semibold text-gray-900">
                                            {b.equipment_code ? `${b.equipment_code} • ` : ""}
                                            {b.equipment_name ?? "Equipment"} (#{b.equipment_id})
                                        </div>
                                        <div className="text-xs text-gray-600">
                                            planned:{" "}
                                            <span className="font-semibold">
                                                {b.planned_start_at ? new Date(b.planned_start_at).toLocaleString() : "-"}
                                            </span>{" "}
                                            →{" "}
                                            <span className="font-semibold">
                                                {b.planned_end_at ? new Date(b.planned_end_at).toLocaleString() : "-"}
                                            </span>
                                        </div>
                                        {b.note ? <div className="text-xs text-gray-500 mt-1">note: {b.note}</div> : null}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-600">No bookings.</div>
                        )}
                    </div>
                </div>
            </div>

            <ReagentApprovalDecisionModal
                open={modalOpen}
                mode={decisionMode}
                busy={busy}
                request={request}
                looNumber={(loo as any)?.number ?? (request as any)?.loo_number ?? null}
                clientName={(loo as any)?.client?.name ?? (request as any)?.client_name ?? null}
                itemsCount={items.length}
                bookingsCount={bookings.length}
                onClose={() => (busy ? null : setModalOpen(false))}
                onConfirm={confirmDecision}
            />
        </div>
    );
}
