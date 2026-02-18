import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
    const { t } = useTranslation();

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

    const statusLower = String(requestStatus ?? "draft").toLowerCase();
    const isLocked = statusLower === "submitted" || statusLower === "approved";
    const canEdit = !isLocked;

    const busy = saving || submitting;

    const lockedHint = isLocked
        ? t("reagents.cart.lockedHint", { status: statusLower })
        : "";

    const headerSummary = useMemo(() => {
        const itemText = t("reagents.cart.itemsCount", { count: items.length });
        const equipText = t("reagents.cart.bookingsCount", { count: bookings.length });
        const qtyText =
            totalSelectedQty > 0 ? t("reagents.cart.totalQty", { qty: totalSelectedQty }) : "";
        return [itemText, equipText, qtyText].filter(Boolean).join(" • ");
    }, [t, items.length, bookings.length, totalSelectedQty]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!busy) onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, busy, onClose]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            {/* overlay */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={() => (busy ? null : onClose())}
                role="button"
                aria-label={t("close")}
                tabIndex={0}
            />

            {/* modal */}
            <div
                className="relative z-10 w-full max-w-6xl h-[85vh] rounded-2xl bg-white shadow-xl border border-black/10 overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
                aria-label={t("reagents.cart.ariaLabel")}
            >
                {/* header */}
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white border border-gray-200">
                                <ClipboardList size={18} />
                            </div>

                            <div className="min-w-0">
                                <div className="text-sm font-bold text-gray-900">{t("reagents.cart.title")}</div>
                                <div className="text-xs text-gray-600 mt-0.5 truncate">
                                    {t("reagents.cart.looNumber", { id: loId })}
                                    <span className="text-gray-400"> • </span>
                                    {t("reagents.cart.statusLabel", { status: String(requestStatus ?? "draft") })}
                                    {cycleNo != null ? (
                                        <>
                                            <span className="text-gray-400"> • </span>
                                            {t("reagents.cart.cycleLabel", { cycle: cycleNo })}
                                        </>
                                    ) : null}
                                    <span className="text-gray-400"> • </span>
                                    <span className="text-gray-700">{headerSummary}</span>
                                </div>
                            </div>
                        </div>

                        {isLocked ? (
                            <div className="mt-2 inline-flex items-center gap-2 text-xs font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-900 px-3 py-2">
                                <Lock size={16} />
                                {t("reagents.cart.lockedBanner")}
                            </div>
                        ) : null}
                    </div>

                    <button
                        type="button"
                        className={cx(
                            "inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50",
                            busy && "opacity-60 cursor-not-allowed"
                        )}
                        onClick={onClose}
                        disabled={busy}
                        aria-label={t("close")}
                        title={t("close")}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* content */}
                <div className="flex-1 overflow-auto">
                    {/* Items */}
                    <div className="px-5 py-5">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                                    <Package size={18} />
                                    {t("reagents.cart.itemsTitle")}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">{t("reagents.cart.itemsSubtitle")}</div>
                            </div>
                        </div>

                        {items.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 inline-flex items-start gap-2">
                                <AlertTriangle size={18} className="mt-0.5" />
                                <div>
                                    <div className="font-semibold">{t("reagents.cart.emptyItemsTitle")}</div>
                                    <div className="mt-0.5 text-xs text-slate-600">{t("reagents.cart.emptyItemsBody")}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">{t("reagents.cart.table.name")}</th>
                                            <th className="px-4 py-3 text-left font-semibold w-44">{t("reagents.cart.table.qty")}</th>
                                            <th className="px-4 py-3 text-left font-semibold w-44">{t("reagents.cart.table.unit")}</th>
                                            <th className="px-4 py-3 text-left font-semibold">{t("reagents.cart.table.note")}</th>
                                            <th className="px-4 py-3 text-right font-semibold w-[110px]" />
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {items.map((it, idx) => {
                                            const qty = Number(it.qty ?? 0);
                                            const safeQty = Number.isFinite(qty) ? qty : 0;

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
                                                                onClick={() => onUpdateItem(idx, { qty: Math.max(0, safeQty - 1) })}
                                                                type="button"
                                                                aria-label={t("reagents.cart.decrease")}
                                                                disabled={disabledRow}
                                                                title={disabledRow ? lockedHint : t("reagents.cart.decrease")}
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
                                                                value={safeQty}
                                                                onChange={(e) => onUpdateItem(idx, { qty: Number(e.target.value) })}
                                                                disabled={disabledRow}
                                                                title={disabledRow ? lockedHint : t("reagents.cart.table.qty")}
                                                            />

                                                            <button
                                                                className={cx(
                                                                    "h-9 w-9 inline-flex items-center justify-center rounded-xl border text-gray-700",
                                                                    "border-gray-200 bg-white hover:bg-gray-50",
                                                                    disabledRow && "cursor-not-allowed"
                                                                )}
                                                                onClick={() => onUpdateItem(idx, { qty: safeQty + 1 })}
                                                                type="button"
                                                                aria-label={t("reagents.cart.increase")}
                                                                disabled={disabledRow}
                                                                title={disabledRow ? lockedHint : t("reagents.cart.increase")}
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
                                                            title={disabledRow ? lockedHint : t("reagents.cart.table.unit")}
                                                        >
                                                            <option value="">{t("reagents.cart.unitPlaceholder")}</option>
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
                                                            placeholder={t("reagents.cart.notePlaceholder")}
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : t("reagents.cart.table.note")}
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
                                                            title={disabledRow ? lockedHint : t("remove")}
                                                        >
                                                            <Trash2 size={14} />
                                                            {t("remove")}
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

                    {/* Equipment */}
                    <div className="px-5 pb-5">
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                            <Wrench size={18} />
                            {t("reagents.cart.equipmentTitle")}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{t("reagents.cart.equipmentSubtitle")}</div>

                        {bookings.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 inline-flex items-start gap-2">
                                <AlertTriangle size={18} className="mt-0.5" />
                                <div>
                                    <div className="font-semibold">{t("reagents.cart.emptyBookingsTitle")}</div>
                                    <div className="mt-0.5 text-xs text-slate-600">{t("reagents.cart.emptyBookingsBody")}</div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-semibold">{t("reagents.cart.table.equipment")}</th>
                                            <th className="px-4 py-3 text-left font-semibold w-[220px]">{t("reagents.cart.table.start")}</th>
                                            <th className="px-4 py-3 text-left font-semibold w-[220px]">{t("reagents.cart.table.end")}</th>
                                            <th className="px-4 py-3 text-left font-semibold">{t("reagents.cart.table.note")}</th>
                                            <th className="px-4 py-3 text-right font-semibold w-[110px]" />
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {bookings.map((b, idx) => {
                                            const displayName =
                                                (b as any)?.equipment_name ||
                                                (b as any)?.equipment_code ||
                                                `${t("reagents.cart.equipmentId")}: ${b.equipment_id}`;

                                            const disabledRow = !canEdit;

                                            return (
                                                <tr key={idx} className={cx(disabledRow && "opacity-60")}>
                                                    <td className="px-4 py-3">
                                                        <div className="font-semibold text-gray-900">{displayName}</div>
                                                        {(b as any)?.booking_id ? (
                                                            <div className="text-xs text-gray-500">
                                                                {t("reagents.cart.bookingId")}: {(b as any).booking_id}
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs text-gray-500">{t("reagents.cart.newBooking")}</div>
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
                                                                onUpdateBooking(idx, { planned_start_at: iso ?? b.planned_start_at });
                                                            }}
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : t("reagents.cart.table.start")}
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
                                                            title={disabledRow ? lockedHint : t("reagents.cart.table.end")}
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
                                                            placeholder={t("reagents.cart.notePlaceholder")}
                                                            disabled={disabledRow}
                                                            title={disabledRow ? lockedHint : t("reagents.cart.table.note")}
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
                                                            title={disabledRow ? lockedHint : t("remove")}
                                                        >
                                                            <Trash2 size={14} />
                                                            {t("remove")}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <div className="font-semibold">{t("tips")}</div>
                            <div className="mt-1">{t("reagents.cart.tipsBody")}</div>
                        </div>
                    </div>
                </div>

                {/* footer actions */}
                <div className="border-t border-gray-100 bg-white px-5 py-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-600">{headerSummary}</div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                "border-gray-200 bg-white",
                                (saving || !canEdit) ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                            )}
                            disabled={saving || !canEdit}
                            onClick={onSaveDraft}
                            title={!canEdit ? lockedHint : t("saveDraft")}
                        >
                            <Save size={16} />
                            {saving ? t("saving") : t("saveDraft")}
                        </button>

                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                                (!canSubmit || submitting || !canEdit)
                                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                                    : "bg-primary text-white hover:opacity-95"
                            )}
                            disabled={!canSubmit || submitting || !canEdit}
                            onClick={onSubmit}
                            title={
                                !canEdit ? lockedHint : !canSubmit ? t("reagents.cart.minSubmitHint") : t("submit")
                            }
                        >
                            <Send size={16} />
                            {submitting ? t("submitting") : t("submit")}
                        </button>

                        <button
                            type="button"
                            className={cx(
                                "inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50",
                                busy && "opacity-60 cursor-not-allowed"
                            )}
                            onClick={onClose}
                            disabled={busy}
                            title={t("close")}
                        >
                            <X size={16} />
                            {t("close")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
