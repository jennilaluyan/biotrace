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

function getHttpStatus(err: any): number | null {
    const s = err?.response?.status ?? err?.status ?? null;
    return typeof s === "number" ? s : null;
}

/**
 * Best-effort PDF href builder.
 * Backend may return:
 * - absolute URL (https://...)
 * - relative path (documents/... or storage/...)
 */
function normalizePdfHref(raw: any): string | null {
    const v = String(raw ?? "").trim();
    if (!v) return null;

    // already absolute
    if (v.startsWith("http://") || v.startsWith("https://")) return v;

    // if backend returns "/storage/..." keep it
    if (v.startsWith("/")) return v;

    // common Laravel public disk pattern
    // if you store to public disk, files are served via /storage/<path>
    return `/storage/${v.replace(/^storage\//, "")}`;
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

async function fetchLooDetailBestEffort(loId: number): Promise<LooDetail | null> {
    if (!Number.isFinite(loId) || loId <= 0) return null;

    // Backend tiap project suka beda-beda naming endpoint.
    // Kita coba beberapa yang umum.
    const candidates = [
        `/v1/letters-of-order/${loId}`,
        `/v1/loo/${loId}`,
    ];

    let sawNon404 = false;

    for (const url of candidates) {
        try {
            const res = await apiGet(url);
            const payload = unwrapApi(res);
            if (payload) return payload as LooDetail;
        } catch (e: any) {
            const status = getHttpStatus(e);
            if (status !== 404) sawNon404 = true;
            // lanjut coba kandidat berikutnya
            continue;
        }
    }

    // kalau semua 404 => kemungkinan LOO id memang tidak ada
    // kalau ada non-404 => kemungkinan endpoint/format tidak match / error server
    return sawNon404 ? null : null;

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
            setItems(it);
            setBookings(bk);
        } catch (e: any) {
            setRequest(null);
            setItems([]);
            setBookings([]);
            setErr(getErrorMessage(e, "Failed to load approval detail"));
            setLoading(false);
            return;
        }

        // 2) OPTIONAL: LOO detail (GAGAL => jangan bikin page error)
        try {
            const looPayload = await fetchLooDetailBestEffort(loId);
            if (looPayload) {
                setLoo(looPayload);
                setLooWarn(null);
            } else {
                setLoo(null);
                setLooWarn("LOO detail tidak tersedia / endpoint tidak cocok. List sample tidak bisa ditampilkan.");
            }
        } catch {
            setLoo(null);
            setLooWarn("LOO detail gagal dimuat. List sample tidak bisa ditampilkan.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loId]);

    const title = useMemo(() => {
        const looNum = (loo as any)?.number ?? (request as any)?.loo_number ?? null;
        return looNum ? `Reagent Approval • ${looNum}` : `Reagent Approval • LOO #${loId}`;
    }, [loo, request, loId]);

    const canAct = String(request?.status ?? "") === "submitted";

    const pdfHref = useMemo(() => {
        // prefer file_url (from step 8.2), fallback to pdf_url if you later rename
        const raw = (request as any)?.file_url ?? (request as any)?.pdf_url ?? null;
        return normalizePdfHref(raw);
    }, [request]);

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

    if (!Number.isFinite(loId) || loId <= 0) {
        return <div className="p-4 text-red-600">Invalid id</div>;
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
                        lo_id: <span className="font-semibold">{loId}</span>
                        {request?.reagent_request_id ? (
                            <span className="text-gray-500"> • request_id {request.reagent_request_id}</span>
                        ) : null}
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

            {String(request?.status ?? "") === "approved" ? (
                <div className="mb-4 rounded-2xl border bg-white shadow-sm px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <div className="text-sm font-semibold text-gray-900">Reagent Request PDF</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                {pdfHref ? "PDF tersedia untuk dibuka/diunduh." : "PDF belum tersedia (file_url kosong)."}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className={cx("btn-outline", !pdfHref ? "opacity-60 cursor-not-allowed" : "")}
                                disabled={!pdfHref}
                                onClick={() => {
                                    if (!pdfHref) return;
                                    window.open(pdfHref, "_blank", "noopener,noreferrer");
                                }}
                                title={!pdfHref ? "PDF belum tersedia" : "Buka PDF di tab baru"}
                            >
                                View PDF
                            </button>

                            <a
                                className={cx("lims-btn-primary", !pdfHref ? "opacity-60 pointer-events-none" : "")}
                                href={pdfHref ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                title={!pdfHref ? "PDF belum tersedia" : "Unduh PDF"}
                            >
                                Download
                            </a>
                        </div>
                    </div>
                </div>
            ) : null}

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
                        {looWarn ? (
                            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                {looWarn}
                            </div>
                        ) : null}

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
