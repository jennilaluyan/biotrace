import { useEffect, useMemo, useState } from "react";
import type { ReagentRequestRow } from "../../services/reagentRequests";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "approve" | "reject";
    busy?: boolean;

    request: ReagentRequestRow | null;
    looNumber?: string | null;
    clientName?: string | null;
    itemsCount?: number;
    bookingsCount?: number;

    onClose: () => void;
    onConfirm: (rejectNote?: string) => void;
};

export default function ReagentApprovalDecisionModal(props: Props) {
    const { open, mode, busy, request, looNumber, clientName, itemsCount, bookingsCount, onClose, onConfirm } = props;

    const [note, setNote] = useState("");

    useEffect(() => {
        if (!open) return;
        setNote("");
    }, [open, mode]);

    const title = mode === "approve" ? "Approve Reagent Request" : "Reject Reagent Request";
    const subtitle = useMemo(() => {
        const parts = [];
        if (looNumber) parts.push(looNumber);
        if (clientName) parts.push(clientName);
        return parts.join(" • ");
    }, [looNumber, clientName]);

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!request?.reagent_request_id) return false;
        if (mode === "reject") return note.trim().length >= 3;
        return true;
    }, [open, busy, request, mode, note]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            {/* backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={() => (busy ? null : onClose())} />

            {/* modal */}
            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border">
                <div className="px-5 py-4 border-b">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-lg font-semibold text-gray-900">{title}</div>
                            <div className="text-xs text-gray-500 mt-1">{subtitle || "—"}</div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={!!busy}
                            className={cx("rounded-xl border px-3 py-2 text-xs font-semibold hover:bg-gray-50", busy && "opacity-60 cursor-not-allowed")}
                        >
                            Close
                        </button>
                    </div>
                </div>

                <div className="px-5 py-4">
                    <div className="rounded-xl border bg-gray-50 px-4 py-3">
                        <div className="text-xs text-gray-500">Summary</div>
                        <div className="mt-1 text-sm text-gray-900">
                            status: <span className="font-semibold">{String(request?.status ?? "-")}</span>
                            {typeof itemsCount === "number" ? (
                                <span className="text-gray-600"> • items: <span className="font-semibold">{itemsCount}</span></span>
                            ) : null}
                            {typeof bookingsCount === "number" ? (
                                <span className="text-gray-600"> • bookings: <span className="font-semibold">{bookingsCount}</span></span>
                            ) : null}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                            request_id: {request?.reagent_request_id ?? "-"} • lo_id: {request?.lo_id ?? "-"} • cycle: {request?.cycle_no ?? "-"}
                        </div>
                    </div>

                    {mode === "reject" ? (
                        <div className="mt-4">
                            <label className="block text-sm font-semibold text-gray-900">Reject note (required)</label>
                            <textarea
                                className="mt-2 w-full min-h-[110px] rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft"
                                placeholder="Tuliskan alasan reject… (min 3 karakter)"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={!!busy}
                            />
                            <div className="mt-1 text-xs text-gray-500">
                                Note ini akan dikirim balik ke Analyst supaya bisa revisi draft.
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            Setelah approve, akan generate dokumen Reagent Request
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={!!busy}
                        className={cx("rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50", busy && "opacity-60 cursor-not-allowed")}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={() => onConfirm(mode === "reject" ? note.trim() : undefined)}
                        className={cx(
                            "rounded-xl px-4 py-2 text-sm font-semibold text-white",
                            mode === "approve" ? "bg-primary hover:opacity-95" : "bg-red-600 hover:opacity-95",
                            !canConfirm && "opacity-60 cursor-not-allowed"
                        )}
                    >
                        {busy ? "Processing…" : mode === "approve" ? "Approve" : "Reject"}
                    </button>
                </div>
            </div>
        </div>
    );
}
