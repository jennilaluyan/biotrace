import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ClipboardList,
    Hash,
    RefreshCw,
    ShieldCheck,
    User,
    Wrench,
    XCircle,
} from "lucide-react";

import {
    approveReagentRequest,
    getReagentRequestByLoo,
    rejectReagentRequest,
    type EquipmentBookingRow,
    type ReagentRequestItemRow,
    type ReagentRequestRow,
} from "../../services/reagentRequests";
import { apiGet } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";
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

function getHttpStatus(err: any): number | null {
    const s = err?.response?.status ?? err?.status ?? null;
    return typeof s === "number" ? s : null;
}

function statusBadgeTone(status?: string | null) {
    const s = String(status ?? "").toLowerCase();
    if (s === "submitted") return "bg-amber-50 text-amber-800 border-amber-200";
    if (s === "approved") return "bg-emerald-50 text-emerald-800 border-emerald-200";
    if (s === "rejected") return "bg-rose-50 text-rose-800 border-rose-200";
    if (s === "draft") return "bg-slate-50 text-slate-700 border-slate-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
}

type LooDetail = {
    lo_id: number;
    number?: string | null;
    generated_at?: string | null;
    client?: any;
    items?: Array<{
        sample_id?: number;
        lab_sample_code?: string | null;
        sample?: any;
    }>;
};

async function fetchLooDetailBestEffort(loId: number): Promise<LooDetail | null> {
    if (!Number.isFinite(loId) || loId <= 0) return null;

    // Backend tiap project suka beda endpoint.
    // Coba beberapa kandidat umum.
    const candidates = [
        `/v1/letters-of-order/${loId}`,
        `/v1/letters-of-order/${loId}/detail`,
        `/v1/loo/${loId}`,
    ];

    for (const url of candidates) {
        try {
            const res = await apiGet(url);
            const payload = unwrapApi(res);
            if (payload) return payload as LooDetail;
        } catch (e: any) {
            const status = getHttpStatus(e);
            if (status === 404) continue;
            // selain 404: anggap endpoint tidak cocok / server error, coba kandidat lain
            continue;
        }
    }

    return null;
}

export default function ReagentApprovalDetailPage() {
    const params = useParams();
    const nav = useNavigate();

    // Route detail: /reagents/approvals/loo/:loId
    const loId = Number((params as any).loId);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [request, setRequest] = useState<ReagentRequestRow | null>(null);
    const [items, setItems] = useState<ReagentRequestItemRow[]>([]);
    const [bookings, setBookings] = useState<EquipmentBookingRow[]>([]);

    const [loo, setLoo] = useState<LooDetail | null>(null);
    const [looWarn, setLooWarn] = useState<string | null>(null);

    // decision modal
    const [modalOpen, setModalOpen] = useState(false);
    const [decisionMode, setDecisionMode] = useState<"approve" | "reject">("approve");
    const [busy, setBusy] = useState(false);

    function flash(msg: string) {
        setSuccess(msg);
        window.setTimeout(() => setSuccess(null), 2500);
    }

    async function load() {
        if (!Number.isFinite(loId) || loId <= 0) return;

        setLoading(true);
        setErr(null);
        setSuccess(null);
        setLooWarn(null);

        // 1) WAJIB: reagent request detail
        try {
            const res = await getReagentRequestByLoo(loId);
            const payload = unwrapApi(res);

            const rr = payload?.request ?? null;
            const it = payload?.items ?? [];
            const bk = payload?.bookings ?? [];

            setRequest(rr);
            setItems(Array.isArray(it) ? it : []);
            setBookings(Array.isArray(bk) ? bk : []);
        } catch (e: any) {
            setRequest(null);
            setItems([]);
            setBookings([]);
            setErr(getErrorMessage(e, "Failed to load reagent approval detail."));
            setLoading(false);
            return;
        }

        // 2) OPTIONAL: LOO detail (fail => jangan bikin page error)
        try {
            const looPayload = await fetchLooDetailBestEffort(loId);
            if (looPayload) {
                setLoo(looPayload);
                setLooWarn(null);
            } else {
                setLoo(null);
                setLooWarn("LOO detail tidak tersedia (endpoint tidak cocok). Daftar sampel mungkin tidak tampil.");
            }
        } catch {
            setLoo(null);
            setLooWarn("LOO detail gagal dimuat. Daftar sampel mungkin tidak tampil.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loId]);

    const looNumber = useMemo(() => {
        return (loo as any)?.number ?? (request as any)?.loo_number ?? (loId > 0 ? `LOO #${loId}` : "LOO");
    }, [loo, request, loId]);

    const pageTitle = useMemo(() => {
        return `Reagent Approval • ${looNumber}`;
    }, [looNumber]);

    const requestStatus = String(request?.status ?? "");
    const canAct = requestStatus === "submitted";

    const clientName = useMemo(() => {
        return (loo as any)?.client?.name ?? (request as any)?.client_name ?? null;
    }, [loo, request]);

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
                flash("Approved. Reagent Request document can be generated next.");
            } else {
                const note = String(rejectNote ?? "").trim();
                if (note.length < 3) {
                    setErr("Reject note wajib diisi (min 3 karakter).");
                    setBusy(false);
                    return;
                }
                await rejectReagentRequest(request.reagent_request_id, note);
                flash("Rejected. The analyst needs to revise and resubmit.");
            }

            setModalOpen(false);
            await load();
        } catch (e: any) {
            setErr(getErrorMessage(e, `Failed to ${decisionMode}.`));
        } finally {
            setBusy(false);
        }
    }

    if (!Number.isFinite(loId) || loId <= 0) {
        return (
            <div className="min-h-[60vh] px-0 py-4">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 inline-flex items-center gap-2">
                    <AlertTriangle size={18} />
                    Invalid LOO id.
                </div>
            </div>
        );
    }

    if (loading) {
        return <div className="min-h-[60vh] px-0 py-4 text-sm text-gray-600">Loading approval detail…</div>;
    }

    return (
        <div className="min-h-[60vh]">
            {/* Breadcrumb */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/reagents/approvals" className="lims-breadcrumb-link inline-flex items-center gap-2">
                        <ArrowLeft size={16} />
                        Reagent Approvals
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">{looNumber}</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {/* Header */}
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-lg md:text-xl font-bold text-gray-900 truncate">{pageTitle}</h1>
                        <div className="mt-1 text-xs text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="inline-flex items-center gap-1">
                                <Hash size={14} />
                                lo_id <span className="font-semibold">{loId}</span>
                            </span>
                            {request?.reagent_request_id ? (
                                <span className="text-gray-500">• request_id {request.reagent_request_id}</span>
                            ) : null}
                            {request?.cycle_no ? <span className="text-gray-500">• cycle {request.cycle_no}</span> : null}
                            {clientName ? (
                                <span className="text-gray-500 inline-flex items-center gap-1">
                                    • <User size={14} /> {clientName}
                                </span>
                            ) : null}
                        </div>

                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span
                                className={cx(
                                    "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border",
                                    statusBadgeTone(request?.status)
                                )}
                            >
                                <ClipboardList size={16} />
                                {request?.status ?? "—"}
                            </span>

                            {!canAct && requestStatus ? (
                                <span className="text-xs text-gray-500">
                                    • Actions only available when status is <span className="font-semibold">submitted</span>
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => nav(-1)}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                            title="Back"
                        >
                            <ArrowLeft size={16} />
                            Back
                        </button>

                        <button
                            type="button"
                            onClick={load}
                            className={cx("lims-icon-button", busy ? "opacity-60 cursor-not-allowed" : "")}
                            aria-label="Refresh"
                            title="Refresh"
                            disabled={busy}
                        >
                            <RefreshCw size={16} />
                        </button>

                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                                !canAct || busy
                                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                    : "bg-emerald-600 text-white hover:opacity-95"
                            )}
                            disabled={!canAct || busy}
                            onClick={openApprove}
                            title={!canAct ? "Only submitted requests can be approved" : "Approve"}
                        >
                            <ShieldCheck size={16} />
                            Approve
                        </button>

                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                                !canAct || busy
                                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                    : "bg-rose-600 text-white hover:opacity-95"
                            )}
                            disabled={!canAct || busy}
                            onClick={openReject}
                            title={!canAct ? "Only submitted requests can be rejected" : "Reject"}
                        >
                            <XCircle size={16} />
                            Reject
                        </button>
                    </div>
                </div>

                {/* Feedback */}
                {success && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 inline-flex items-center gap-2">
                        <CheckCircle2 size={18} />
                        {success}
                    </div>
                )}

                {err && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 inline-flex items-center gap-2">
                        <AlertTriangle size={18} />
                        {err}
                    </div>
                )}

                {/* Content */}
                <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* LOO summary + samples */}
                    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <div className="border-b border-gray-100 px-5 py-4 bg-gray-50">
                            <div className="font-bold text-gray-900">LOO overview</div>
                            <div className="mt-1 text-xs text-gray-600">
                                {loo?.number ? (
                                    <>
                                        LOO number: <span className="font-semibold">{loo.number}</span>
                                    </>
                                ) : (
                                    "LOO detail not available"
                                )}
                                {loo?.generated_at ? (
                                    <span className="text-gray-500"> • generated {formatDateTimeLocal(loo.generated_at)}</span>
                                ) : null}
                            </div>
                        </div>

                        <div className="p-5">
                            {looWarn ? (
                                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 inline-flex items-center gap-2">
                                    <AlertTriangle size={16} />
                                    {looWarn}
                                </div>
                            ) : null}

                            <div className="text-sm font-semibold text-gray-900 mb-2">Samples in this LOO</div>

                            {loo?.items?.length ? (
                                <div className="space-y-2">
                                    {loo.items.map((it: any, idx: number) => (
                                        <div key={`${it.sample_id ?? idx}`} className="rounded-xl border border-gray-200 px-3 py-2">
                                            <div className="text-sm font-semibold text-gray-900">
                                                {it.lab_sample_code ?? it.sample?.lab_sample_code ?? "—"}
                                            </div>
                                            <div className="text-xs text-gray-600">
                                                sample_id: <span className="font-semibold">{it.sample_id ?? it.sample?.sample_id ?? "—"}</span>
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
                    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                        <div className="border-b border-gray-100 px-5 py-4 bg-gray-50">
                            <div className="font-bold text-gray-900">Request content</div>
                            <div className="mt-1 text-xs text-gray-600">
                                Items: <span className="font-semibold">{items.length}</span> • Bookings:{" "}
                                <span className="font-semibold">{bookings.length}</span>
                            </div>
                        </div>

                        <div className="p-5 space-y-6">
                            {/* Items */}
                            <div>
                                <div className="text-sm font-semibold text-gray-900 mb-2">Items</div>

                                {items.length ? (
                                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-white text-gray-700 border-b border-gray-100">
                                                <tr>
                                                    <th className="text-left font-semibold px-4 py-3">Name</th>
                                                    <th className="text-left font-semibold px-4 py-3">Type</th>
                                                    <th className="text-left font-semibold px-4 py-3">Qty</th>
                                                    <th className="text-left font-semibold px-4 py-3">Unit</th>
                                                    <th className="text-left font-semibold px-4 py-3">Note</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {items.map((it: any, idx: number) => (
                                                    <tr key={it.reagent_request_item_id ?? `${it.catalog_item_id}-${idx}`} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 font-medium text-gray-900">{it.item_name ?? "—"}</td>
                                                        <td className="px-4 py-3 text-gray-700">{it.item_type ?? "—"}</td>
                                                        <td className="px-4 py-3 text-gray-700">{Number(it.qty ?? 0)}</td>
                                                        <td className="px-4 py-3 text-gray-700">{it.unit_text ?? "—"}</td>
                                                        <td className="px-4 py-3 text-gray-700">{it.note ? String(it.note) : "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-600">No items.</div>
                                )}
                            </div>

                            {/* Bookings */}
                            <div>
                                <div className="text-sm font-semibold text-gray-900 mb-2 inline-flex items-center gap-2">
                                    <Wrench size={16} />
                                    Equipment bookings
                                </div>

                                {bookings.length ? (
                                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-white text-gray-700 border-b border-gray-100">
                                                <tr>
                                                    <th className="text-left font-semibold px-4 py-3">Equipment</th>
                                                    <th className="text-left font-semibold px-4 py-3">Planned start</th>
                                                    <th className="text-left font-semibold px-4 py-3">Planned end</th>
                                                    <th className="text-left font-semibold px-4 py-3">Note</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {bookings.map((b: any, idx: number) => (
                                                    <tr key={b.booking_id ?? `${b.equipment_id}-${idx}`} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 font-medium text-gray-900">
                                                            {(b.equipment_code ? `${b.equipment_code} • ` : "") + (b.equipment_name ?? "Equipment")}
                                                            <span className="text-gray-500"> (#{b.equipment_id})</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">
                                                            {b.planned_start_at ? formatDateTimeLocal(b.planned_start_at) : "—"}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">
                                                            {b.planned_end_at ? formatDateTimeLocal(b.planned_end_at) : "—"}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">{b.note ? String(b.note) : "—"}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-600">No bookings.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal */}
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
        </div>
    );
}
