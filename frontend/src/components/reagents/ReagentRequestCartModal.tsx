import { useMemo } from "react";
import type { EquipmentBookingRow, ReagentRequestItemRow } from "../../services/reagentRequests";

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
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
        d.getMinutes()
    )}`;
}

function localInputToIso(value?: string | null) {
    if (!value) return null;
    const d = new Date(value); // local time
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function uniqUnits(...units: Array<string | null | undefined>) {
    const set = new Set<string>();
    for (const u of units) {
        const s = (u ?? "").trim();
        if (s) set.add(s);
    }
    return Array.from(set);
}

type Props = {
    open: boolean;
    onClose: () => void;

    loId: number;
    requestStatus: string | null;
    cycleNo: number | null;

    items: ReagentRequestItemRow[];
    bookings: EquipmentBookingRow[];

    saving: boolean;
    submitting: boolean;
    canSubmit: boolean;
    totalSelectedQty: number;

    onSaveDraft: () => Promise<void> | void;
    onSubmit: () => Promise<void> | void;

    onRemoveItem: (idx: number) => void;
    onUpdateItem: (idx: number, patch: Partial<ReagentRequestItemRow>) => void;

    onRemoveBooking: (idx: number) => void;
    onUpdateBooking: (idx: number, patch: Partial<EquipmentBookingRow>) => void;
};

export default function ReagentRequestCartModal(props: Props) {
    const {
        open,
        onClose,
        loId,
        requestStatus,
        cycleNo,
        items,
        bookings,
        saving,
        submitting,
        canSubmit,
        totalSelectedQty,
        onSaveDraft,
        onSubmit,
        onRemoveItem,
        onUpdateItem,
        onRemoveBooking,
        onUpdateBooking,
    } = props;

    const headerSummary = useMemo(() => {
        const itemText = `${items.length} item`;
        const equipText = `${bookings.length} alat`;
        const qtyText = totalSelectedQty > 0 ? `• total qty ${totalSelectedQty}` : "";
        return `${itemText} • ${equipText} ${qtyText}`.trim();
    }, [items.length, bookings.length, totalSelectedQty]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* overlay */}
            <button
                type="button"
                aria-label="Close modal"
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
            />

            {/* modal (CENTERED) */}
            <div
                className="relative z-10 w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl bg-white shadow-xl border border-black/10"
                onClick={(e) => e.stopPropagation()}
            >
                {/* top bar */}
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b">
                    <div>
                        <div className="text-lg font-semibold text-gray-900">Request</div>
                        <div className="text-xs text-gray-600 mt-1">
                            LOO #{loId}
                            {requestStatus ? (
                                <>
                                    {" "}
                                    • status{" "}
                                    <span className="font-semibold text-gray-800">{requestStatus}</span>
                                </>
                            ) : null}
                            {cycleNo != null ? <span className="text-gray-500"> • cycle {cycleNo}</span> : null}
                            <span className="text-gray-400"> • </span>
                            <span className="text-gray-700">{headerSummary}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
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
                            type="button"
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

                        <button
                            type="button"
                            className="ml-1 rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                            onClick={onClose}
                            aria-label="Close"
                            title="Close"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* content (scroll area) */}
                <div className="max-h-[calc(85vh-120px)] overflow-auto">
                    {/* Request Items */}
                    <div className="px-5 py-4">
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <div className="font-semibold text-gray-900">Request Items</div>
                                <div className="text-xs text-gray-500 mt-1">Nama • Jumlah (±) • Satuan • Note</div>
                            </div>
                        </div>

                        {items.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                Belum ada item. Pilih dari Catalog Items di halaman utama.
                            </div>
                        ) : (
                            <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-semibold">Name</th>
                                            <th className="px-4 py-2 text-left font-semibold w-40">Qty</th>
                                            <th className="px-4 py-2 text-left font-semibold w-40">Unit</th>
                                            <th className="px-4 py-2 text-left font-semibold">Note</th>
                                            <th className="px-4 py-2 text-right font-semibold w-[90px]" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {items.map((it, idx) => {
                                            const qty = Number(it.qty ?? 0);
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
                                                                onClick={() => onUpdateItem(idx, { qty: Math.max(0, qty - 1) })}
                                                                type="button"
                                                                aria-label="Decrease"
                                                            >
                                                                −
                                                            </button>

                                                            <input
                                                                className="h-8 w-16 rounded-lg border text-center"
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                value={qty}
                                                                onChange={(e) => onUpdateItem(idx, { qty: Number(e.target.value) })}
                                                            />

                                                            <button
                                                                className="h-8 w-8 rounded-lg border hover:bg-gray-50"
                                                                onClick={() => onUpdateItem(idx, { qty: qty + 1 })}
                                                                type="button"
                                                                aria-label="Increase"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <select
                                                            className="h-8 w-full rounded-lg border px-2"
                                                            value={it.unit_text ?? ""}
                                                            onChange={(e) => onUpdateItem(idx, { unit_text: e.target.value })}
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
                                                            onChange={(e) => onUpdateItem(idx, { note: e.target.value })}
                                                            placeholder="optional…"
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                            onClick={() => onRemoveItem(idx)}
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

                    {/* Equipment Bookings */}
                    <div className="px-5 pb-5">
                        <div className="font-semibold text-gray-900">Equipment Bookings</div>
                        <div className="text-xs text-gray-500 mt-1">Nama alat • Mulai • Selesai • Note</div>

                        {bookings.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                Belum ada booking. Pilih equipment dari daftar di halaman utama.
                            </div>
                        ) : (
                            <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-semibold">Equipment</th>
                                            <th className="px-4 py-2 text-left font-semibold w-[200px]">Start</th>
                                            <th className="px-4 py-2 text-left font-semibold w-[200px]">End</th>
                                            <th className="px-4 py-2 text-left font-semibold">Note</th>
                                            <th className="px-4 py-2 text-right font-semibold w-[90px]" />
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
                                                        {(b as any)?.booking_id ? (
                                                            <div className="text-xs text-gray-500">
                                                                booking_id: {(b as any).booking_id}
                                                            </div>
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
                                                                onUpdateBooking(idx, { planned_start_at: iso ?? b.planned_start_at });
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
                                                                onUpdateBooking(idx, { planned_end_at: iso ?? b.planned_end_at });
                                                            }}
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            className="h-8 w-full rounded-lg border px-2"
                                                            value={b.note ?? ""}
                                                            onChange={(e) => onUpdateBooking(idx, { note: e.target.value })}
                                                            placeholder="optional…"
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            className="rounded-lg px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
                                                            onClick={() => onRemoveBooking(idx)}
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

                        {/* tips */}
                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <div className="font-semibold">Tips</div>
                            <div className="mt-1">
                                Pilih item/alat dari halaman utama → otomatis masuk ke Request → atur jumlah/unit/waktu → Save Draft →
                                Submit.
                            </div>
                        </div>
                    </div>
                </div>

                {/* footer */}
                <div className="border-t px-5 py-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-600">
                        {items.length} item • {bookings.length} alat
                        {totalSelectedQty ? <span className="text-gray-500"> • total qty {totalSelectedQty}</span> : null}
                    </div>

                    <button
                        type="button"
                        className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
