import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import type { SampleIdChangeRow } from "../../services/sampleIdChanges";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "approve" | "reject";
    busy?: boolean;
    row: SampleIdChangeRow | null;

    onClose: () => void;
    onConfirm: (rejectReason?: string) => void;
};

export default function SampleIdChangeDecisionModal({ open, mode, busy, row, onClose, onConfirm }: Props) {
    const [reason, setReason] = useState("");

    useEffect(() => {
        if (!open) return;
        setReason("");
    }, [open, mode]);

    const title = mode === "approve" ? "Approve Sample ID Change" : "Reject Sample ID Change";

    const suggested =
        row?.suggested_lab_sample_code ?? row?.suggested_sample_id ?? (row as any)?.suggested ?? null;

    const proposed =
        row?.proposed_lab_sample_code ?? row?.proposed_sample_id ?? (row as any)?.proposed ?? null;

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!row) return false;
        if (mode === "reject") return reason.trim().length >= 3;
        return true;
    }, [open, busy, row, mode, reason]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => (busy ? null : onClose())} />

            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border">
                <div className="px-5 py-4 border-b">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-lg font-semibold text-gray-900">{title}</div>
                            <div className="text-xs text-gray-500 mt-1">
                                request #{row?.sample_id ?? row?.request_id ?? "-"} • change #{row?.id ?? row?.sample_id_change_id ?? "-"}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={!!busy}
                            className={cx("lims-icon-button", busy && "opacity-60 cursor-not-allowed")}
                            aria-label="Close"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-5 py-4 space-y-4">
                    <div className="rounded-xl border bg-gray-50 px-4 py-3">
                        <div className="text-xs text-gray-500">Comparison</div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl border bg-white px-3 py-2">
                                <div className="text-xs text-gray-500">Suggested</div>
                                <div className="mt-1 font-mono font-semibold text-gray-900">{suggested ?? "—"}</div>
                            </div>
                            <div className="rounded-xl border bg-white px-3 py-2">
                                <div className="text-xs text-gray-500">Proposed</div>
                                <div className="mt-1 font-mono font-semibold text-gray-900">{proposed ?? "—"}</div>
                            </div>
                        </div>
                    </div>

                    {mode === "reject" ? (
                        <div>
                            <label className="block text-sm font-semibold text-gray-900">Reject reason (required)</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                disabled={!!busy}
                                className="mt-2 w-full min-h-[110px] rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft"
                                placeholder="Tuliskan alasan reject… (min 3 karakter)"
                            />
                        </div>
                    ) : (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            Approval will unlock the request for Admin final assignment.
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={!!busy}
                        className={cx("btn-outline", busy && "opacity-60 cursor-not-allowed")}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={() => onConfirm(mode === "reject" ? reason.trim() : undefined)}
                        className={cx(
                            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white",
                            mode === "approve" ? "bg-primary hover:opacity-95" : "bg-red-600 hover:opacity-95",
                            !canConfirm && "opacity-60 cursor-not-allowed"
                        )}
                    >
                        {mode === "approve" ? <Check size={16} /> : <X size={16} />}
                        {busy ? "Processing…" : mode === "approve" ? "Approve" : "Reject"}
                    </button>
                </div>
            </div>
        </div>
    );
}
