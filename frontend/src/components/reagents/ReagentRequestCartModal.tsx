import { useMemo } from "react";
import {
    ClipboardList,
    X,
    Save,
    Send,
    Package,
    Wrench,
    Minus,
    Plus,
    Trash2,
    AlertTriangle,
    Lock,
} from "lucide-react";
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
        const s = String(u ?? "").trim();
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

    const statusLower = String(requestStatus ?? "draft").toLowerCase();
    const isLocked = statusLower === "submitted" || statusLower === "approved";
    const canEdit = !isLocked;

    const lockedHint = isLocked ? `Request sudah ${statusLower}. Edit dikunci.` : "";

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* overlay */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
                role="button"
                aria-label="Close modal"
                tabIndex={0}
            />

            {/* modal */}
            <div
                className="relative z-10 w-full max-w-5xl h-[85vh] rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Reagent Request Cart"
            >
                {/* top bar */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white border border-gray-200">
                                <ClipboardList size={18} />
                            </div>
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-gray-900">Request</div>
                                <div className="text-xs text-gray-600 mt-0.5 truncate">
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
                        </div>

                        {isLocked ? (
                            <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
                                <Lock size={16} />
                                Editing locked (submitted/approved)
                            </div>
                        ) : null}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                "border-gray-200 bg-white",
                                saving || !canEdit ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                            )}
                            disabled={saving || !canEdit}
                            onClick={onSaveDraft}
                            title={!canEdit ? lockedHint : "Save draft"}
                        >
                            {saving ? (
                                <>
                                    <span className="inline-flex items-center">
                                        <Save size={16} />
                                    </span>
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <Save size={16} />
                                    Save
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                                !canSubmit || submitting || !canEdit
                                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                    : "bg-primary text-white hover:opacity-95"
                            )}
                            disabled={!canSubmit || submitting || !canEdit}
                            onClick={onSubmit}
                            title={
                                !canEdit
                                    ? lockedHint
                                    : !canSubmit
                                        ? "Add at least 1 item or 1 booking"
                                        : "Submit"
                            }
                        >
                            <Send size={16} />
                            {submitting ? "Submitting…" : "Submit"}
                        </button>

                        <button
                            type="button"
                            className="ml-1 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                            onClick={onClose}
                            aria-label="Close"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* content (scroll area) */}
                <div className="flex-1 overflow-auto">
                    {/* Request Items */}
                    <div className="px-5 py-5">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                                    <Package size={18} />
                                    Request Items
                                </div>
                                <div className="text-xs text-gray-500 mt-1">Nama • Qty • Unit • Note</div>
                            </div>
                        </div>

                        {items.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 inline-flex items-start gap-2">
                                <AlertTriangle size={18} className="mt-0.5" />
                                <div>
                                    <div className="font-semibold">Belum ada item</div>
                                    <div className="mt-0.5 text-xs text-slate-600">
                                        Pilih dari Catalog Items di halaman utama.
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">Name</th>
                                            <th className="px-4 py-3 text-left font-semibold w-44">Qty</th>
                                            <th className="px-4 py-3 text-left font-semibold w-44">Unit</th>
                                            <th className="px-4 py-3 text-left font-semibold">Note</th>
                                            <th className="px-4 py-3 text-right font-semibold w-[90px]" />
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((it, idx) => {
                                            const qty = Number(it.qty ?? 0);

                                            // ✅ unit options: remove backend defaults, keep current + common list only
                                            const unitOptions = uniqUnits(
                                                it.unit_text ?? null,
                                                "pcs",
                                                "box",
                                                "bottle",
                                                "mL",
                                                "L",
                                                "g",
                                                "kg"
                                            );

                                            const disabledRow = !canEdit;

                                            return (
                                                <tr key={idx} className={cx(disabledRow && "opacity-60")}>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-gray-900">{it.item_name}</div>
                                                        <div className="text-xs text-gray-500">
                                                            #{it.catalog_item_id} • {String(it.item_type ?? "-").toUpperCase()}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="inline-flex items-center gap-2">
                                                            <button
                                                                className={cx(
                                                                    "h-9 w-9 inline-flex items-center justify-center rounded-xl border text-gray-700",
                                                                    "border-gray-200 bg-white hover:bg-gray-50",
                                                                    disabledRow && "cursor-not-allowed"
                                                                )}
                                                                onClick={() => onUpdateItem(idx, { qty: Math.max(0, qty - 1) })}
                                                                type="button"
                                                                aria-label="Decrease"
                                                                disabled={disabledRow}
                                                                title={disabledRow ? lockedHint : "Decrease"}
                                                            >
                                                                <Minus size={16} />
                                                            </button>

                                                            <input
                                                                className={cx(
                                                                    "h-9 w-20 rounded-xl border border-gray-300 px-2 text-center text-sm",
                                                                    "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                                                                    disabledRow && "cursor-not-allowed bg-gray-50"
                                                                )}
                                                                type="number"
                                                                min="0"
                                                                step="1"
                                                                value={qty}
                                                                onChange={(e) => onUpdateItem(idx, { qty: Number(e.target.value) })}
                                                                disabled={disabledRow}
                                                                title={disabledRow ? lockedHint : "Qty"}
                                                            />

                                                            <button
                                                                className={cx(
                                                                    "h-9 w-9 inline-flex items-center justify-center rounded-xl border text-gray-700",
                                                                    "border-gray-200 bg-white hover:bg-gray-50",
                                                                    disabledRow && "cursor-not-allowed"
                                                                )}
                                                                onClick={() => onUpdateItem(idx, { qty: qty + 1 })}
                                                                type="button"
                                                                aria-label="Increase"
                                                                disabled={disabledRow}
                                                                title={disabledRow ? lockedHint : "Increase"}
                                                            >
                                                                <Plus size={16} />
                                                            </button>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <select
                                                            className={cx(
                                                                "h-9 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm",
                                                                "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                                                                disabledRow && "cursor-not-allowed bg-gray-50"
                                                            )}
                                                            value={it.unit_text ?? ""}
                                                            onChange={(e) => onUpdateItem(idx, { unit_text: e.target.value })}
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : "Unit"}
                                                        >
                                                            <option value="">(choose unit)</option>
                                                            {unitOptions.map((u) => (
                                                                <option key={u} value={u}>
                                                                    {u}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            className={cx(
                                                                "h-9 w-full rounded-xl border border-gray-300 px-3 text-sm",
                                                                "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                                                                disabledRow && "cursor-not-allowed bg-gray-50"
                                                            )}
                                                            value={it.note ?? ""}
                                                            onChange={(e) => onUpdateItem(idx, { note: e.target.value })}
                                                            placeholder="optional…"
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : "Note"}
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            className={cx(
                                                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold",
                                                                "text-red-700 hover:bg-red-50",
                                                                disabledRow && "cursor-not-allowed"
                                                            )}
                                                            onClick={() => onRemoveItem(idx)}
                                                            type="button"
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : "Remove"}
                                                        >
                                                            <Trash2 size={14} />
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
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                            <Wrench size={18} />
                            Equipment Bookings
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Nama alat • Mulai • Selesai • Note</div>

                        {bookings.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 inline-flex items-start gap-2">
                                <AlertTriangle size={18} className="mt-0.5" />
                                <div>
                                    <div className="font-semibold">Belum ada booking</div>
                                    <div className="mt-0.5 text-xs text-slate-600">
                                        Pilih equipment dari daftar di halaman utama.
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">Equipment</th>
                                            <th className="px-4 py-3 text-left font-semibold w-[220px]">Start</th>
                                            <th className="px-4 py-3 text-left font-semibold w-[220px]">End</th>
                                            <th className="px-4 py-3 text-left font-semibold">Note</th>
                                            <th className="px-4 py-3 text-right font-semibold w-[90px]" />
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {bookings.map((b, idx) => {
                                            const displayName =
                                                (b as any)?.equipment_name ||
                                                (b as any)?.equipment_code ||
                                                `equipment_id: ${b.equipment_id}`;

                                            const disabledRow = !canEdit;

                                            return (
                                                <tr key={idx} className={cx(disabledRow && "opacity-60")}>
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
                                                            className={cx(
                                                                "h-9 w-full rounded-xl border border-gray-300 px-3 text-sm",
                                                                "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                                                                disabledRow && "cursor-not-allowed bg-gray-50"
                                                            )}
                                                            type="datetime-local"
                                                            value={isoToLocalInput(b.planned_start_at)}
                                                            onChange={(e) => {
                                                                const iso = localInputToIso(e.target.value);
                                                                onUpdateBooking(idx, {
                                                                    planned_start_at: iso ?? b.planned_start_at,
                                                                });
                                                            }}
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : "Start time"}
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            className={cx(
                                                                "h-9 w-full rounded-xl border border-gray-300 px-3 text-sm",
                                                                "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                                                                disabledRow && "cursor-not-allowed bg-gray-50"
                                                            )}
                                                            type="datetime-local"
                                                            value={isoToLocalInput(b.planned_end_at)}
                                                            onChange={(e) => {
                                                                const iso = localInputToIso(e.target.value);
                                                                onUpdateBooking(idx, { planned_end_at: iso ?? b.planned_end_at });
                                                            }}
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : "End time"}
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <input
                                                            className={cx(
                                                                "h-9 w-full rounded-xl border border-gray-300 px-3 text-sm",
                                                                "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                                                                disabledRow && "cursor-not-allowed bg-gray-50"
                                                            )}
                                                            value={b.note ?? ""}
                                                            onChange={(e) => onUpdateBooking(idx, { note: e.target.value })}
                                                            placeholder="optional…"
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : "Note"}
                                                        />
                                                    </td>

                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            className={cx(
                                                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold",
                                                                "text-red-700 hover:bg-red-50",
                                                                disabledRow && "cursor-not-allowed"
                                                            )}
                                                            onClick={() => onRemoveBooking(idx)}
                                                            type="button"
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : "Remove"}
                                                        >
                                                            <Trash2 size={14} />
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
                                Pilih item/alat dari halaman utama → otomatis masuk ke Request → atur jumlah/unit/waktu → Save Draft → Submit.
                            </div>
                        </div>
                    </div>
                </div>

                {/* footer (always visible, not cut) */}
                <div className="border-t border-gray-100 bg-white px-5 py-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-600">
                        {items.length} item • {bookings.length} alat
                        {totalSelectedQty ? <span className="text-gray-500"> • total qty {totalSelectedQty}</span> : null}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                "border-gray-200 bg-white",
                                saving || !canEdit ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                            )}
                            disabled={saving || !canEdit}
                            onClick={onSaveDraft}
                            title={!canEdit ? lockedHint : "Save draft"}
                        >
                            <Save size={16} />
                            Save
                        </button>

                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                                !canSubmit || submitting || !canEdit
                                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                    : "bg-primary text-white hover:opacity-95"
                            )}
                            disabled={!canSubmit || submitting || !canEdit}
                            onClick={onSubmit}
                            title={
                                !canEdit
                                    ? lockedHint
                                    : !canSubmit
                                        ? "Add at least 1 item or 1 booking"
                                        : "Submit"
                            }
                        >
                            <Send size={16} />
                            Submit
                        </button>

                        <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50"
                            onClick={onClose}
                        >
                            <X size={16} />
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
