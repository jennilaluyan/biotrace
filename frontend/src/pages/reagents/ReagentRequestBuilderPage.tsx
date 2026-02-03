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

function pad2(n: number) {
    return String(n).padStart(2, "0");
}

function isoToLocalInput(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    // format: YYYY-MM-DDTHH:mm (LOCAL time)
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
        d.getMinutes()
    )}`;
}

function localInputToIso(value?: string | null) {
    if (!value) return null;
    const d = new Date(value); // treated as local time
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString(); // backend should accept ISO Z
}

function uniqUnits(...units: Array<string | null | undefined>) {
    const set = new Set<string>();
    for (const u of units) {
        const s = (u ?? "").trim();
        if (s) set.add(s);
    }
    return Array.from(set);
}

export default function ReagentRequestBuilderPage() {
    const params = useParams();
    const loId = Number(params.loId);

    const [loading, setLoading] = useState(true);

    const [request, setRequest] = useState<ReagentRequestRow | null>(null);
    const [items, setItems] = useState<ReagentRequestItemRow[]>([]);
    const [bookings, setBookings] = useState<EquipmentBookingRow[]>([]);

    // Catalog browser (show all by default + search + filter + paging)
    const [catalogSearch, setCatalogSearch] = useState("");
    const debouncedCatalogSearch = useDebouncedValue(catalogSearch, 300);
    const [catalogType, setCatalogType] = useState<"all" | "bhp" | "reagen">("all");
    const [catalogPage, setCatalogPage] = useState(1);
    const CATALOG_PER_PAGE = 100;

    const [catalogResults, setCatalogResults] = useState<CatalogRow[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);

    // Equipment browser (show all by default + search + paging)
    const [equipSearch, setEquipSearch] = useState("");
    const debouncedEquipSearch = useDebouncedValue(equipSearch, 300);
    const [equipPage, setEquipPage] = useState(1);
    const EQUIP_PER_PAGE = 60;

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
        // reset paging when search/type changes
        setCatalogPage(1);
    }, [debouncedCatalogSearch, catalogType]);

    useEffect(() => {
        const q = (debouncedCatalogSearch ?? "").trim();

        setCatalogLoading(true);
        const qs = new URLSearchParams();
        qs.set("active", "1");
        qs.set("per_page", String(CATALOG_PER_PAGE));
        qs.set("page", String(catalogPage));
        if (q) qs.set("search", q);
        if (catalogType !== "all") qs.set("type", catalogType);

        apiGet(`/v1/catalog/consumables?${qs.toString()}`)
            .then((res: any) => {
                const data = res?.data ?? res;
                const payload = data?.data ?? data;
                const rows = payload?.data ?? payload?.items ?? payload ?? [];

                const normalized = (rows as any[]).map((r) => ({
                    catalog_id: r.catalog_id ?? r.id ?? r.catalogId,
                    type: r.type ?? null,
                    name: r.name ?? null,
                    specification: r.specification ?? r.spec ?? null,
                    default_unit_text: r.default_unit_text ?? r.unit_text ?? null,
                }));

                // page=1 replace, next pages append
                setCatalogResults((prev) => (catalogPage === 1 ? normalized : [...prev, ...normalized]));
            })
            .catch(() => {
                if (catalogPage === 1) setCatalogResults([]);
            })
            .finally(() => setCatalogLoading(false));
    }, [debouncedCatalogSearch, catalogType, catalogPage]);

    // Search equipment catalog
    useEffect(() => {
        setEquipPage(1);
    }, [debouncedEquipSearch]);

    useEffect(() => {
        const q = (debouncedEquipSearch ?? "").trim();

        setEquipLoading(true);

        // kalau service kamu cuma support search string, kita pakai trick:
        // - q kosong => cari "*" (atau "a") supaya keluar list default
        // - idealnya: service diupgrade support per_page/page. untuk sekarang keep simple.
        const query = q || "a";

        searchEquipmentCatalog(query)
            .then((res: any) => {
                const data = res?.data ?? res;
                const payload = data?.data ?? data;
                const rows = payload?.data ?? payload?.items ?? payload ?? [];

                // kalau "a" terlalu banyak, list ini minimal sudah tidak kosong.
                setEquipResults(rows);
            })
            .catch(() => setEquipResults([]))
            .finally(() => setEquipLoading(false));
    }, [debouncedEquipSearch, equipPage]);

    const canSubmit = useMemo(() => {
        const hasItems = items.length > 0;
        const hasBookings = bookings.length > 0;
        return hasItems || hasBookings;
    }, [items, bookings]);

    function addCatalogToItems(cat: CatalogRow) {
        const name = cat.name ?? "(unnamed)";
        const unit = cat.default_unit_text ?? "";

        setItems((prev) => {
            const idx = prev.findIndex((x) => Number(x.catalog_item_id) === Number(cat.catalog_id));
            if (idx >= 0) {
                return prev.map((x, i) => (i === idx ? { ...x, qty: Number(x.qty ?? 0) + 1 } : x));
            }
            return [
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
            ];
        });
    }

    function removeItem(idx: number) {
        setItems((prev) => prev.filter((_, i) => i !== idx));
    }

    function updateItem(idx: number, patch: Partial<ReagentRequestItemRow>) {
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    }

    function addBooking(equip: EquipmentCatalogItem) {
        const start = new Date();
        const end = new Date(Date.now() + 60 * 60 * 1000);

        setBookings((prev) => [
            ...prev,
            {
                equipment_id: equip.equipment_id,
                // simpan ISO untuk backend, tapi inputnya nanti kita render jadi datetime-local
                planned_start_at: start.toISOString(),
                planned_end_at: end.toISOString(),
                note: null,

                // extra display-only (aman walau backend tidak peduli)
                ...(equip.code ? { equipment_code: equip.code } : null),
                ...(equip.name ? { equipment_name: equip.name } : null),
            } as any,
        ]);

        setEquipSearch("");
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
        <div className="p-4">
            {/* Header */}
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Reagent Request</h1>
                    <div className="text-sm text-gray-600">LOO ID: {loId}</div>
                    {request && (
                        <div className="mt-1 text-sm text-gray-700">
                            Status:{" "}
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold">
                                {request.status}
                            </span>{" "}
                            <span className="text-gray-500">• Cycle {request.cycle_no}</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button
                        className={cx(
                            "rounded-xl border px-4 py-2 text-sm font-semibold",
                            saving ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                        )}
                        disabled={saving}
                        onClick={onSaveDraft}
                    >
                        {saving ? "Saving…" : "Save Draft"}
                    </button>

                    <button
                        className={cx(
                            "rounded-xl px-4 py-2 text-sm font-semibold",
                            !canSubmit || submitting
                                ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                : "bg-primary text-white hover:opacity-95"
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
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {errorText}
                </div>
            )}

            {gateDetails?.not_passed_samples?.length > 0 && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="font-semibold text-amber-900">Crosscheck gate not passed</div>
                    <div className="mt-1 text-sm text-amber-900/80">
                        Submit ditolak karena ada sample di LOO ini yang belum <b>passed</b>.
                    </div>
                    <ul className="mt-2 list-disc pl-5 text-sm text-amber-900/90">
                        {gateDetails.not_passed_samples.map((s: any) => (
                            <li key={s.sample_id}>
                                Sample #{s.sample_id} • {s.lab_sample_code ?? "-"} •{" "}
                                <span className="font-semibold">{s.crosscheck_status ?? "pending"}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* 2-panel layout */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* LEFT: Catalog browser */}
                <div className="lg:col-span-7 space-y-4">
                    {/* Catalog Items */}
                    <div className="rounded-2xl border bg-white shadow-sm">
                        <div className="border-b px-4 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="font-semibold text-gray-900">Catalog Items (BHP/Reagen)</div>

                                <div className="flex gap-2">
                                    <button
                                        className={cx(
                                            "rounded-full px-3 py-1 text-xs font-semibold border",
                                            catalogType === "all" ? "bg-gray-900 text-white border-gray-900" : "bg-white hover:bg-gray-50"
                                        )}
                                        onClick={() => setCatalogType("all")}
                                    >
                                        All
                                    </button>
                                    <button
                                        className={cx(
                                            "rounded-full px-3 py-1 text-xs font-semibold border",
                                            catalogType === "bhp" ? "bg-gray-900 text-white border-gray-900" : "bg-white hover:bg-gray-50"
                                        )}
                                        onClick={() => setCatalogType("bhp")}
                                    >
                                        BHP
                                    </button>
                                    <button
                                        className={cx(
                                            "rounded-full px-3 py-1 text-xs font-semibold border",
                                            catalogType === "reagen" ? "bg-gray-900 text-white border-gray-900" : "bg-white hover:bg-gray-50"
                                        )}
                                        onClick={() => setCatalogType("reagen")}
                                    >
                                        Reagen
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3">
                                <input
                                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft"
                                    placeholder="Search catalog items…"
                                    value={catalogSearch}
                                    onChange={(e) => setCatalogSearch(e.target.value)}
                                />
                                <div className="mt-1 text-xs text-gray-500">
                                    Semua item tampil; search hanya untuk mempercepat.
                                </div>
                            </div>
                        </div>

                        <div className="max-h-[420px] overflow-auto">
                            {catalogLoading && catalogResults.length === 0 ? (
                                <div className="p-4 text-sm text-gray-600">Loading catalog…</div>
                            ) : catalogResults.length === 0 ? (
                                <div className="p-4 text-sm text-gray-600">No catalog items found.</div>
                            ) : (
                                <div className="divide-y">
                                    {catalogResults.map((c) => (
                                        <button
                                            key={c.catalog_id}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start justify-between gap-3"
                                            onClick={() => addCatalogToItems(c)}
                                        >
                                            <div className="min-w-0">
                                                <div className="font-semibold text-sm text-gray-900 truncate">
                                                    {c.name ?? "-"}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">
                                                    #{c.catalog_id} • {String(c.type ?? "-").toUpperCase()} • unit:{" "}
                                                    {c.default_unit_text ?? "-"}
                                                </div>
                                                {c.specification ? (
                                                    <div className="mt-1 text-xs text-gray-600 truncate">
                                                        {c.specification}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <span className="shrink-0 rounded-lg border px-3 py-1 text-xs font-semibold hover:bg-white">
                                                Add
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* optional load more kalau paging */}
                        <div className="border-t px-4 py-3 flex items-center justify-between">
                            <div className="text-xs text-gray-500">
                                Showing {catalogResults.length} items
                            </div>
                            <button
                                type="button"
                                className="rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-gray-50"
                                onClick={() => setCatalogPage((p) => p + 1)}
                                disabled={catalogLoading}
                            >
                                {catalogLoading ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    </div>

                    {/* Equipment */}
                    <div className="rounded-2xl border bg-white shadow-sm">
                        <div className="border-b px-4 py-3">
                            <div className="font-semibold text-gray-900">Equipment</div>
                            <div className="mt-3">
                                <input
                                    className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft"
                                    placeholder="Search equipment…"
                                    value={equipSearch}
                                    onChange={(e) => setEquipSearch(e.target.value)}
                                />
                                <div className="mt-1 text-xs text-gray-500">
                                    Semua alat tampil; search hanya untuk mempercepat.
                                </div>
                            </div>
                        </div>

                        <div className="max-h-80 overflow-auto">
                            {equipLoading && equipResults.length === 0 ? (
                                <div className="p-4 text-sm text-gray-600">Loading equipment…</div>
                            ) : equipResults.length === 0 ? (
                                <div className="p-4 text-sm text-gray-600">No equipment found.</div>
                            ) : (
                                <div className="divide-y">
                                    {equipResults.map((eq) => (
                                        <button
                                            key={eq.equipment_id}
                                            className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-start justify-between gap-3"
                                            onClick={() => addBooking(eq)}
                                        >
                                            <div className="min-w-0">
                                                <div className="font-semibold text-sm text-gray-900 truncate">
                                                    {(eq.code ? `${eq.code} • ` : "") + (eq.name ?? "Equipment")}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">
                                                    equipment_id: {eq.equipment_id}
                                                </div>
                                            </div>
                                            <span className="shrink-0 rounded-lg border px-3 py-1 text-xs font-semibold hover:bg-white">
                                                Add booking
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT: Request cart */}
                <div className="lg:col-span-5 space-y-4">
                    {/* Cart Items */}
                    <div className="rounded-2xl border bg-white shadow-sm">
                        <div className="border-b px-4 py-3">
                            <div className="font-semibold text-gray-900">Request Items</div>
                            <div className="text-xs text-gray-500 mt-1">
                                Nama • Jumlah (±) • Satuan • Note
                            </div>
                        </div>

                        {items.length === 0 ? (
                            <div className="p-4 text-sm text-gray-600">No items selected yet.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-semibold">Name</th>
                                            <th className="px-4 py-2 text-left font-semibold w-[120px]">Qty</th>
                                            <th className="px-4 py-2 text-left font-semibold w-[140px]">Unit</th>
                                            <th className="px-4 py-2 text-left font-semibold">Note</th>
                                            <th className="px-4 py-2 text-right font-semibold w-[60px]"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {items.map((it, idx) => {
                                            const unitOptions = uniqUnits(
                                                it.unit_text ?? null,
                                                (it as any)?.default_unit_text ?? null,
                                                "pcs",
                                                "box",
                                                "bottle",
                                                "mL",
                                                "L",
                                                "g",
                                                "kg"
                                            );

                                            return (
                                                <tr key={idx}>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-gray-900">{it.item_name}</div>
                                                        <div className="text-xs text-gray-500">
                                                            #{it.catalog_item_id} • {String(it.item_type ?? "-").toUpperCase()}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                className="h-8 w-8 rounded-lg border hover:bg-gray-50"
                                                                onClick={() => updateItem(idx, { qty: Math.max(0, Number(it.qty ?? 0) - 1) })}
                                                                type="button"
                                                            >
                                                                −
                                                            </button>
                                                            <input
                                                                className="h-8 w-14 rounded-lg border text-center"
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                value={Number(it.qty ?? 0)}
                                                                onChange={(e) => updateItem(idx, { qty: Number(e.target.value) })}
                                                            />
                                                            <button
                                                                className="h-8 w-8 rounded-lg border hover:bg-gray-50"
                                                                onClick={() => updateItem(idx, { qty: Number(it.qty ?? 0) + 1 })}
                                                                type="button"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <select
                                                            className="h-8 w-full rounded-lg border px-2"
                                                            value={it.unit_text ?? ""}
                                                            onChange={(e) => updateItem(idx, { unit_text: e.target.value })}
                                                        >
                                                            {unitOptions.map((u) => (
                                                                <option key={u} value={u}>
                                                                    {u}
                                                                </option>
                                                            ))}
                                                            <option value="">(empty)</option>
                                                        </select>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            className="h-8 w-full rounded-lg border px-2"
                                                            value={it.note ?? ""}
                                                            onChange={(e) => updateItem(idx, { note: e.target.value })}
                                                            placeholder="optional…"
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                            onClick={() => removeItem(idx)}
                                                            type="button"
                                                        >
                                                            Remove
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Cart Bookings */}
                    <div className="rounded-2xl border bg-white shadow-sm">
                        <div className="border-b px-4 py-3">
                            <div className="font-semibold text-gray-900">Equipment Bookings</div>
                            <div className="text-xs text-gray-500 mt-1">Nama alat • Mulai • Selesai • Note</div>
                        </div>

                        {bookings.length === 0 ? (
                            <div className="p-4 text-sm text-gray-600">No bookings selected yet.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-semibold">Equipment</th>
                                            <th className="px-4 py-2 text-left font-semibold w-[180px]">Start</th>
                                            <th className="px-4 py-2 text-left font-semibold w-[180px]">End</th>
                                            <th className="px-4 py-2 text-left font-semibold">Note</th>
                                            <th className="px-4 py-2 text-right font-semibold w-[60px]"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {bookings.map((b, idx) => {
                                            const displayName =
                                                (b as any)?.equipment_name ||
                                                (b as any)?.equipment_code ||
                                                `equipment_id: ${b.equipment_id}`;

                                            return (
                                                <tr key={idx}>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-gray-900">{displayName}</div>
                                                        {b.booking_id ? (
                                                            <div className="text-xs text-gray-500">booking_id: {b.booking_id}</div>
                                                        ) : (
                                                            <div className="text-xs text-gray-500">new booking</div>
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            className="h-8 w-full rounded-lg border px-2"
                                                            type="datetime-local"
                                                            value={isoToLocalInput(b.planned_start_at)}
                                                            onChange={(e) => {
                                                                const iso = localInputToIso(e.target.value);
                                                                updateBooking(idx, { planned_start_at: iso ?? b.planned_start_at });
                                                            }}
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            className="h-8 w-full rounded-lg border px-2"
                                                            type="datetime-local"
                                                            value={isoToLocalInput(b.planned_end_at)}
                                                            onChange={(e) => {
                                                                const iso = localInputToIso(e.target.value);
                                                                updateBooking(idx, { planned_end_at: iso ?? b.planned_end_at });
                                                            }}
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            className="h-8 w-full rounded-lg border px-2"
                                                            value={b.note ?? ""}
                                                            onChange={(e) => updateBooking(idx, { note: e.target.value })}
                                                            placeholder="optional…"
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                            onClick={() => removeBooking(idx)}
                                                            type="button"
                                                        >
                                                            Remove
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* hint */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <div className="font-semibold">Tips</div>
                        <div className="mt-1">
                            Pilih item/alat dari panel kiri → otomatis masuk ke “Request” di kanan → atur jumlah/unit/waktu → Save Draft → Submit.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
