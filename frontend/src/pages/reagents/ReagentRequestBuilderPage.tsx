import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
    getReagentRequestByLoo,
    saveReagentRequestDraft,
    submitReagentRequest,
    ReagentRequestRow,
    ReagentRequestItemRow,
    EquipmentBookingRow,
} from "../../services/reagentRequests";
import { apiGet } from "../../services/api";
import { searchEquipmentCatalog, EquipmentCatalogItem } from "../../services/equipmentCatalog";
import { useDebouncedValue } from "../../utils/useDebouncedValue";

type CatalogRow = {
    catalog_id: number;
    type?: string | null; // bhp | reagen
    name?: string | null;
    specification?: string | null;
    default_unit_text?: string | null;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export default function ReagentRequestBuilderPage() {
    const params = useParams();
    const loId = Number(params.loId);

    const [loading, setLoading] = useState(true);

    const [request, setRequest] = useState<ReagentRequestRow | null>(null);
    const [items, setItems] = useState<ReagentRequestItemRow[]>([]);
    const [bookings, setBookings] = useState<EquipmentBookingRow[]>([]);

    // Catalog search (consumables/reagents)
    const [catalogSearch, setCatalogSearch] = useState("");
    const debouncedCatalogSearch = useDebouncedValue(catalogSearch, 300);
    const [catalogResults, setCatalogResults] = useState<CatalogRow[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);

    // Equipment search
    const [equipSearch, setEquipSearch] = useState("");
    const debouncedEquipSearch = useDebouncedValue(equipSearch, 300);
    const [equipResults, setEquipResults] = useState<EquipmentCatalogItem[]>([]);
    const [equipLoading, setEquipLoading] = useState(false);

    // UI feedback
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);
    const [gateDetails, setGateDetails] = useState<any>(null);

    useEffect(() => {
        if (!Number.isFinite(loId) || loId <= 0) return;

        setLoading(true);
        setErrorText(null);
        setGateDetails(null);

        getReagentRequestByLoo(loId)
            .then((res: any) => {
                const data = res?.data ?? res; // depending on ApiResponse wrapper
                const payload = data?.data ?? data; // extra safety
                const rr = payload?.request ?? null;
                const it = payload?.items ?? [];
                const bk = payload?.bookings ?? [];

                setRequest(rr);
                setItems(it);
                setBookings(bk);
            })
            .catch((e: any) => {
                setErrorText(e?.message ?? "Failed to load reagent request");
            })
            .finally(() => setLoading(false));
    }, [loId]);

    // Search catalog items
    useEffect(() => {
        const q = (debouncedCatalogSearch ?? "").trim();
        if (!q) {
            setCatalogResults([]);
            return;
        }

        setCatalogLoading(true);
        const qs = new URLSearchParams();
        qs.set("search", q);
        qs.set("active", "1");
        qs.set("per_page", "20");

        // catalog endpoint kamu sudah ada: /v1/catalog/consumables
        apiGet(`/v1/catalog/consumables?${qs.toString()}`)
            .then((res: any) => {
                const data = res?.data ?? res;
                const payload = data?.data ?? data;
                const rows = payload?.data ?? payload?.items ?? payload ?? [];
                // normalize
                setCatalogResults(
                    (rows as any[]).map((r) => ({
                        catalog_id: r.catalog_id ?? r.id ?? r.catalogId,
                        type: r.type ?? null,
                        name: r.name ?? null,
                        specification: r.specification ?? r.spec ?? null,
                        default_unit_text: r.default_unit_text ?? r.unit_text ?? null,
                    }))
                );
            })
            .catch(() => setCatalogResults([]))
            .finally(() => setCatalogLoading(false));
    }, [debouncedCatalogSearch]);

    // Search equipment catalog
    useEffect(() => {
        const q = (debouncedEquipSearch ?? "").trim();
        if (!q) {
            setEquipResults([]);
            return;
        }
        setEquipLoading(true);
        searchEquipmentCatalog(q)
            .then((res: any) => {
                const data = res?.data ?? res;
                const payload = data?.data ?? data;
                const rows = payload?.data ?? payload?.items ?? payload ?? [];
                setEquipResults(rows);
            })
            .catch(() => setEquipResults([]))
            .finally(() => setEquipLoading(false));
    }, [debouncedEquipSearch]);

    const canSubmit = useMemo(() => {
        const hasItems = items.length > 0;
        const hasBookings = bookings.length > 0;
        return hasItems || hasBookings;
    }, [items, bookings]);

    function addCatalogToItems(cat: CatalogRow) {
        const name = cat.name ?? "(unnamed)";
        const unit = cat.default_unit_text ?? "";
        setItems((prev) => [
            ...prev,
            {
                catalog_item_id: cat.catalog_id,
                item_type: cat.type ?? null,
                item_name: name,
                specification: cat.specification ?? null,
                qty: 1,
                unit_text: unit,
                note: null,
            },
        ]);
        setCatalogSearch("");
        setCatalogResults([]);
    }

    function removeItem(idx: number) {
        setItems((prev) => prev.filter((_, i) => i !== idx));
    }

    function updateItem(idx: number, patch: Partial<ReagentRequestItemRow>) {
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    }

    function addBooking(equip: EquipmentCatalogItem) {
        setBookings((prev) => [
            ...prev,
            {
                equipment_id: equip.equipment_id,
                planned_start_at: new Date().toISOString(),
                planned_end_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                note: null,
            },
        ]);
        setEquipSearch("");
        setEquipResults([]);
    }

    function removeBooking(idx: number) {
        setBookings((prev) => prev.filter((_, i) => i !== idx));
    }

    function updateBooking(idx: number, patch: Partial<EquipmentBookingRow>) {
        setBookings((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
    }

    async function onSaveDraft() {
        setSaving(true);
        setErrorText(null);
        setGateDetails(null);

        try {
            const payload = {
                lo_id: loId,
                items: items.map((it) => ({
                    catalog_id: Number(it.catalog_item_id),
                    qty: Number(it.qty),
                    unit_text: it.unit_text ?? null,
                    note: it.note ?? null,
                })),
                bookings: bookings.map((b) => ({
                    booking_id: b.booking_id,
                    equipment_id: Number(b.equipment_id),
                    planned_start_at: b.planned_start_at,
                    planned_end_at: b.planned_end_at,
                    note: b.note ?? null,
                })),
            };

            const res: any = await saveReagentRequestDraft(payload);
            const data = res?.data ?? res;
            const payload2 = data?.data ?? data;

            setRequest(payload2?.request ?? payload2?.data?.request ?? payload2?.request ?? request);
            setItems(payload2?.items ?? payload2?.data?.items ?? items);
            setBookings(payload2?.bookings ?? payload2?.data?.bookings ?? bookings);
        } catch (e: any) {
            setErrorText(e?.message ?? "Failed to save draft");
        } finally {
            setSaving(false);
        }
    }

    async function onSubmit() {
        if (!request?.reagent_request_id) {
            setErrorText("No request found. Save draft first.");
            return;
        }

        setSubmitting(true);
        setErrorText(null);
        setGateDetails(null);

        try {
            const res: any = await submitReagentRequest(request.reagent_request_id);
            const data = res?.data ?? res;
            const payload = data?.data ?? data;

            setRequest(payload?.request ?? payload?.data?.request ?? request);
            setItems(payload?.items ?? payload?.data?.items ?? items);
            setBookings(payload?.bookings ?? payload?.data?.bookings ?? bookings);
        } catch (e: any) {
            // ApiResponse error biasanya punya: status, code, message, data/context
            const resp = e?.response?.data ?? null;
            const msg = resp?.message ?? e?.message ?? "Submit failed";
            setErrorText(msg);

            // jika gate fail, backend kirim detail (tergantung format ApiResponse)
            const detail = resp?.data ?? resp?.context ?? null;
            if (resp?.code === "crosscheck_not_passed" || msg.toLowerCase().includes("crosscheck")) {
                setGateDetails(detail);
            }
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <div className="p-4">Loading reagent request…</div>;
    }

    if (!Number.isFinite(loId) || loId <= 0) {
        return <div className="p-4 text-red-600">Invalid loId</div>;
    }

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-semibold">Reagent Request Builder</h1>
                    <div className="text-sm opacity-70">LOO ID: {loId}</div>
                    {request && (
                        <div className="text-sm mt-1">
                            Status: <span className="font-medium">{request.status}</span>{" "}
                            <span className="opacity-70">• Cycle {request.cycle_no}</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        className={cx(
                            "px-3 py-2 rounded border",
                            saving ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                        )}
                        disabled={saving}
                        onClick={onSaveDraft}
                    >
                        {saving ? "Saving…" : "Save Draft"}
                    </button>

                    <button
                        className={cx(
                            "px-3 py-2 rounded border",
                            !canSubmit || submitting ? "opacity-60 cursor-not-allowed" : "bg-black text-white"
                        )}
                        disabled={!canSubmit || submitting}
                        onClick={onSubmit}
                        title={!canSubmit ? "Add at least 1 item or 1 booking" : ""}
                    >
                        {submitting ? "Submitting…" : "Submit"}
                    </button>
                </div>
            </div>

            {errorText && (
                <div className="p-3 rounded border border-red-200 bg-red-50 text-red-700">
                    {errorText}
                </div>
            )}

            {gateDetails?.not_passed_samples?.length > 0 && (
                <div className="p-3 rounded border border-amber-200 bg-amber-50">
                    <div className="font-medium mb-2">Crosscheck gate not passed</div>
                    <ul className="list-disc pl-5 text-sm">
                        {gateDetails.not_passed_samples.map((s: any) => (
                            <li key={s.sample_id}>
                                Sample #{s.sample_id} • {s.lab_sample_code ?? "-"} • status:{" "}
                                <span className="font-medium">{s.crosscheck_status ?? "pending"}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Items */}
            <div className="rounded border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">Items</div>

                    <div className="w-full max-w-md">
                        <input
                            className="w-full border rounded px-3 py-2"
                            placeholder="Search catalog items (BHP/Reagen)…"
                            value={catalogSearch}
                            onChange={(e) => setCatalogSearch(e.target.value)}
                        />
                        {(catalogLoading || catalogResults.length > 0) && (
                            <div className="border rounded mt-1 bg-white max-h-56 overflow-auto">
                                {catalogLoading && <div className="p-2 text-sm opacity-70">Searching…</div>}
                                {!catalogLoading &&
                                    catalogResults.map((c) => (
                                        <button
                                            key={c.catalog_id}
                                            className="w-full text-left p-2 hover:bg-gray-50 border-b last:border-b-0"
                                            onClick={() => addCatalogToItems(c)}
                                        >
                                            <div className="text-sm font-medium">{c.name ?? "-"}</div>
                                            <div className="text-xs opacity-70">
                                                #{c.catalog_id} • {c.type ?? "-"} • unit: {c.default_unit_text ?? "-"}
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>

                {items.length === 0 ? (
                    <div className="text-sm opacity-70">No items yet.</div>
                ) : (
                    <div className="space-y-2">
                        {items.map((it, idx) => (
                            <div key={idx} className="p-2 rounded border flex flex-col gap-2">
                                <div className="flex justify-between gap-2">
                                    <div>
                                        <div className="font-medium text-sm">{it.item_name}</div>
                                        <div className="text-xs opacity-70">
                                            catalog_id: {it.catalog_item_id ?? "-"} • type: {it.item_type ?? "-"}
                                        </div>
                                    </div>
                                    <button className="text-sm underline" onClick={() => removeItem(idx)}>
                                        Remove
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                    <input
                                        className="border rounded px-2 py-1"
                                        type="number"
                                        min="0"
                                        step="0.001"
                                        value={it.qty}
                                        onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                                        placeholder="Qty"
                                    />
                                    <input
                                        className="border rounded px-2 py-1"
                                        value={it.unit_text ?? ""}
                                        onChange={(e) => updateItem(idx, { unit_text: e.target.value })}
                                        placeholder="Unit text (e.g. box, pcs)"
                                    />
                                    <input
                                        className="border rounded px-2 py-1 md:col-span-2"
                                        value={it.note ?? ""}
                                        onChange={(e) => updateItem(idx, { note: e.target.value })}
                                        placeholder="Note (optional)"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Bookings */}
            <div className="rounded border p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="font-medium">Equipment Bookings (planned)</div>

                    <div className="w-full max-w-md">
                        <input
                            className="w-full border rounded px-3 py-2"
                            placeholder="Search equipment…"
                            value={equipSearch}
                            onChange={(e) => setEquipSearch(e.target.value)}
                        />
                        {(equipLoading || equipResults.length > 0) && (
                            <div className="border rounded mt-1 bg-white max-h-56 overflow-auto">
                                {equipLoading && <div className="p-2 text-sm opacity-70">Searching…</div>}
                                {!equipLoading &&
                                    equipResults.map((eq) => (
                                        <button
                                            key={eq.equipment_id}
                                            className="w-full text-left p-2 hover:bg-gray-50 border-b last:border-b-0"
                                            onClick={() => addBooking(eq)}
                                        >
                                            <div className="text-sm font-medium">
                                                {(eq.code ? `${eq.code} • ` : "") + (eq.name ?? "Equipment")}
                                            </div>
                                            <div className="text-xs opacity-70">equipment_id: {eq.equipment_id}</div>
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>

                {bookings.length === 0 ? (
                    <div className="text-sm opacity-70">No bookings yet.</div>
                ) : (
                    <div className="space-y-2">
                        {bookings.map((b, idx) => (
                            <div key={idx} className="p-2 rounded border flex flex-col gap-2">
                                <div className="flex justify-between gap-2">
                                    <div className="text-sm">
                                        <span className="font-medium">equipment_id:</span> {b.equipment_id}
                                        {b.booking_id ? <span className="opacity-70"> • booking_id: {b.booking_id}</span> : null}
                                    </div>
                                    <button className="text-sm underline" onClick={() => removeBooking(idx)}>
                                        Remove
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <input
                                        className="border rounded px-2 py-1"
                                        value={b.planned_start_at}
                                        onChange={(e) => updateBooking(idx, { planned_start_at: e.target.value })}
                                        placeholder="planned_start_at (ISO)"
                                    />
                                    <input
                                        className="border rounded px-2 py-1"
                                        value={b.planned_end_at}
                                        onChange={(e) => updateBooking(idx, { planned_end_at: e.target.value })}
                                        placeholder="planned_end_at (ISO)"
                                    />
                                    <input
                                        className="border rounded px-2 py-1"
                                        value={b.note ?? ""}
                                        onChange={(e) => updateBooking(idx, { note: e.target.value })}
                                        placeholder="Note (optional)"
                                    />
                                </div>

                                <div className="text-xs opacity-60">
                                    Tip: pakai format ISO string (contoh: 2026-02-03 10:00:00+08). Nanti bisa kita rapihin jadi datetime-local UI.
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
