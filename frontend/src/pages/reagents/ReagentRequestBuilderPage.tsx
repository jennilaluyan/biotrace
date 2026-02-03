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
import ReagentRequestCartModal from "../../components/reagents/ReagentRequestCartModal";

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

/**
 * Normalize berbagai bentuk wrapper response:
 * - axios: { data: ... }
 * - ApiResponse: { data: { ... } }
 * - nested: { data: { data: { ... } } }
 */
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

export default function ReagentRequestBuilderPage() {
    const params = useParams();
    const loId = Number(params.loId);

    const [loading, setLoading] = useState(true);

    const [request, setRequest] = useState<ReagentRequestRow | null>(null);
    const [items, setItems] = useState<ReagentRequestItemRow[]>([]);
    const [bookings, setBookings] = useState<EquipmentBookingRow[]>([]);

    // Catalog browser
    const [catalogSearch, setCatalogSearch] = useState("");
    const debouncedCatalogSearch = useDebouncedValue(catalogSearch, 300);
    const [catalogType, setCatalogType] = useState<"all" | "bhp" | "reagen">("all");
    const [catalogPage, setCatalogPage] = useState(1);
    const CATALOG_PER_PAGE = 100;

    const [catalogResults, setCatalogResults] = useState<CatalogRow[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogMeta, setCatalogMeta] = useState<any>(null);

    // Equipment browser
    const [equipSearch, setEquipSearch] = useState("");
    const debouncedEquipSearch = useDebouncedValue(equipSearch, 300);
    const [equipPage, setEquipPage] = useState(1);
    const EQUIP_PER_PAGE = 60;

    const [equipResults, setEquipResults] = useState<EquipmentCatalogItem[]>([]);
    const [equipLoading, setEquipLoading] = useState(false);
    const [equipMeta, setEquipMeta] = useState<any>(null);

    // UI feedback
    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errorText, setErrorText] = useState<string | null>(null);
    const [gateDetails, setGateDetails] = useState<any>(null);

    // Modal state
    const [cartOpen, setCartOpen] = useState(false);

    useEffect(() => {
        if (!Number.isFinite(loId) || loId <= 0) return;

        setLoading(true);
        setErrorText(null);
        setGateDetails(null);

        getReagentRequestByLoo(loId)
            .then((res: any) => {
                const payload = unwrapApi(res);
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

    // Reset catalog paging when search/type changes
    useEffect(() => {
        setCatalogPage(1);
    }, [debouncedCatalogSearch, catalogType]);

    // Fetch catalog (show all by default)
    useEffect(() => {
        setCatalogLoading(true);

        const q = (debouncedCatalogSearch ?? "").trim();

        const qs = new URLSearchParams();
        qs.set("active", "1");
        qs.set("per_page", String(CATALOG_PER_PAGE));
        qs.set("page", String(catalogPage));
        if (q) qs.set("search", q);
        if (catalogType !== "all") qs.set("type", catalogType);

        apiGet(`/v1/catalog/consumables?${qs.toString()}`)
            .then((res: any) => {
                const payload = unwrapApi(res);

                const rows = Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload?.data)
                        ? payload.data
                        : Array.isArray(payload?.items)
                            ? payload.items
                            : [];

                const meta = payload?.meta ?? payload?.pagination ?? null;
                setCatalogMeta(meta);

                const normalized: CatalogRow[] = (rows as any[]).map((r) => {
                    const catalogId =
                        r.catalog_id ??
                        r.catalogId ??
                        r.id ??
                        r.consumables_catalog_id ??
                        r.consumable_catalog_id;

                    return {
                        catalog_id: Number(catalogId),
                        type: r.type ?? r.item_type ?? null,
                        name: r.name ?? r.item_name ?? r.title ?? null,
                        specification: r.specification ?? r.spec ?? r.description ?? null,
                        default_unit_text: r.default_unit_text ?? r.default_unit ?? r.unit_text ?? r.unit ?? null,
                    };
                });

                setCatalogResults((prev) => (catalogPage === 1 ? normalized : [...prev, ...normalized]));
            })
            .catch(() => {
                if (catalogPage === 1) setCatalogResults([]);
                setCatalogMeta(null);
            })
            .finally(() => setCatalogLoading(false));
    }, [debouncedCatalogSearch, catalogType, catalogPage]);

    // Reset equipment paging when search changes
    useEffect(() => {
        setEquipPage(1);
    }, [debouncedEquipSearch]);

    // Fetch equipment (show all by default)
    useEffect(() => {
        setEquipLoading(true);

        const q = (debouncedEquipSearch ?? "").trim();

        searchEquipmentCatalog(q || undefined, equipPage, EQUIP_PER_PAGE)
            .then((res: any) => {
                const payload = unwrapApi(res);

                const rows = Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload?.data)
                        ? payload.data
                        : Array.isArray(payload?.items)
                            ? payload.items
                            : [];

                const meta = payload?.meta ?? payload?.pagination ?? null;
                setEquipMeta(meta);

                setEquipResults((prev) => (equipPage === 1 ? rows : [...prev, ...rows]));
            })
            .catch(() => {
                if (equipPage === 1) setEquipResults([]);
                setEquipMeta(null);
            })
            .finally(() => setEquipLoading(false));
    }, [debouncedEquipSearch, equipPage]);

    const canSubmit = useMemo(() => items.length > 0 || bookings.length > 0, [items, bookings]);

    const canLoadMoreCatalog = useMemo(() => {
        if (catalogLoading) return false;
        const cur = Number(catalogMeta?.current_page ?? catalogPage);
        const last = Number(catalogMeta?.last_page ?? 0);
        if (last && cur >= last) return false;
        return true;
    }, [catalogLoading, catalogMeta, catalogPage]);

    const canLoadMoreEquip = useMemo(() => {
        if (equipLoading) return false;
        const cur = Number(equipMeta?.current_page ?? equipPage);
        const last = Number(equipMeta?.last_page ?? 0);
        if (last && cur >= last) return false;
        return true;
    }, [equipLoading, equipMeta, equipPage]);

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

        // buka modal otomatis biar user yakin item masuk
        setCartOpen(true);
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
                planned_start_at: start.toISOString(),
                planned_end_at: end.toISOString(),
                note: null,
                ...(equip.code ? ({ equipment_code: equip.code } as any) : null),
                ...(equip.name ? ({ equipment_name: equip.name } as any) : null),
            } as any,
        ]);

        setCartOpen(true);
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
                    booking_id: (b as any)?.booking_id,
                    equipment_id: Number(b.equipment_id),
                    planned_start_at: b.planned_start_at,
                    planned_end_at: b.planned_end_at,
                    note: b.note ?? null,
                })),
            };

            const res: any = await saveReagentRequestDraft(payload);
            const payload2 = unwrapApi(res);

            setRequest(payload2?.request ?? payload2?.data?.request ?? request);
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
            setCartOpen(true);
            return;
        }

        setSubmitting(true);
        setErrorText(null);
        setGateDetails(null);

        try {
            const res: any = await submitReagentRequest(request.reagent_request_id);
            const payload = unwrapApi(res);

            setRequest(payload?.request ?? payload?.data?.request ?? request);
            setItems(payload?.items ?? payload?.data?.items ?? items);
            setBookings(payload?.bookings ?? payload?.data?.bookings ?? bookings);
        } catch (e: any) {
            const resp = e?.response?.data ?? null;
            const msg = resp?.message ?? e?.message ?? "Submit failed";
            setErrorText(msg);

            const detail = resp?.data ?? resp?.context ?? null;
            if (resp?.code === "crosscheck_not_passed" || String(msg).toLowerCase().includes("crosscheck")) {
                setGateDetails(detail);
            }

            setCartOpen(true);
        } finally {
            setSubmitting(false);
        }
    }

    const totalSelected = items.reduce((sum, it) => sum + Number(it.qty ?? 0), 0);
    const hasAnySelection = items.length > 0 || bookings.length > 0;

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

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setCartOpen(true)}
                        className={cx("rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50")}
                        title="Lihat & edit request items"
                    >
                        Request{" "}
                        {hasAnySelection ? (
                            <span className="ml-2 inline-flex items-center rounded-full bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white">
                                {items.length} item • {bookings.length} alat
                            </span>
                        ) : (
                            <span className="ml-2 text-xs text-gray-500">(empty)</span>
                        )}
                    </button>

                    <button
                        className={cx(
                            "rounded-xl border px-4 py-2 text-sm font-semibold",
                            saving ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                        )}
                        disabled={saving}
                        onClick={onSaveDraft}
                        type="button"
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
                        type="button"
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

            {/* Full-width layout */}
            <div className="grid grid-cols-1 gap-4">
                {/* Catalog */}
                <div className="rounded-2xl border bg-white shadow-sm">
                    <div className="border-b px-4 py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="font-semibold text-gray-900">Catalog Items (BHP/Reagen)</div>

                            <div className="flex gap-2">
                                <button
                                    className={cx(
                                        "rounded-full px-3 py-1 text-xs font-semibold border",
                                        catalogType === "all"
                                            ? "bg-gray-900 text-white border-gray-900"
                                            : "bg-white hover:bg-gray-50"
                                    )}
                                    onClick={() => setCatalogType("all")}
                                    type="button"
                                >
                                    All
                                </button>
                                <button
                                    className={cx(
                                        "rounded-full px-3 py-1 text-xs font-semibold border",
                                        catalogType === "bhp"
                                            ? "bg-gray-900 text-white border-gray-900"
                                            : "bg-white hover:bg-gray-50"
                                    )}
                                    onClick={() => setCatalogType("bhp")}
                                    type="button"
                                >
                                    BHP
                                </button>
                                <button
                                    className={cx(
                                        "rounded-full px-3 py-1 text-xs font-semibold border",
                                        catalogType === "reagen"
                                            ? "bg-gray-900 text-white border-gray-900"
                                            : "bg-white hover:bg-gray-50"
                                    )}
                                    onClick={() => setCatalogType("reagen")}
                                    type="button"
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
                                Semua item tampil; search hanya untuk mempercepat. Klik item untuk masuk ke Request.
                            </div>
                        </div>
                    </div>

                    <div className="max-h-[560px] overflow-auto">
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
                                        type="button"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-semibold text-sm text-gray-900 truncate">{c.name ?? "-"}</div>
                                            <div className="text-xs text-gray-500 truncate">
                                                #{c.catalog_id} • {String(c.type ?? "-").toUpperCase()} • unit:{" "}
                                                {c.default_unit_text ?? "-"}
                                            </div>
                                            {c.specification ? (
                                                <div className="mt-1 text-xs text-gray-600 truncate">{c.specification}</div>
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

                    <div className="border-t px-4 py-3 flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                            Showing {catalogResults.length} items{catalogMeta?.total ? ` • total ${catalogMeta.total}` : ""}
                        </div>
                        <button
                            type="button"
                            className="rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={() => setCatalogPage((p) => p + 1)}
                            disabled={!canLoadMoreCatalog}
                            title={!canLoadMoreCatalog ? "No more pages" : ""}
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
                            <div className="mt-1 text-xs text-gray-500">Klik equipment untuk masuk ke booking di Request.</div>
                        </div>
                    </div>

                    <div className="max-h-[420px] overflow-auto">
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
                                        type="button"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-semibold text-sm text-gray-900 truncate">
                                                {(eq.code ? `${eq.code} • ` : "") + (eq.name ?? "Equipment")}
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">equipment_id: {eq.equipment_id}</div>
                                        </div>

                                        <span className="shrink-0 rounded-lg border px-3 py-1 text-xs font-semibold hover:bg-white">
                                            Add booking
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-t px-4 py-3 flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                            Showing {equipResults.length} items{equipMeta?.total ? ` • total ${equipMeta.total}` : ""}
                        </div>
                        <button
                            type="button"
                            className="rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                            onClick={() => setEquipPage((p) => p + 1)}
                            disabled={!canLoadMoreEquip}
                            title={!canLoadMoreEquip ? "No more pages" : ""}
                        >
                            {equipLoading ? "Loading…" : "Load more"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal: Request cart */}
            <ReagentRequestCartModal
                open={cartOpen}
                onClose={() => setCartOpen(false)}
                loId={loId}
                requestStatus={request?.status ?? null}
                cycleNo={request?.cycle_no ?? null}
                items={items}
                bookings={bookings}
                saving={saving}
                submitting={submitting}
                canSubmit={canSubmit}
                totalSelectedQty={totalSelected}
                onSaveDraft={onSaveDraft}
                onSubmit={onSubmit}
                onRemoveItem={removeItem}
                onUpdateItem={updateItem}
                onRemoveBooking={removeBooking}
                onUpdateBooking={updateBooking}
            />
        </div>
    );
}
