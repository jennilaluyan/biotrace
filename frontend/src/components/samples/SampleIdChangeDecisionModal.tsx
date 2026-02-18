import { useEffect, useMemo, useRef, useState } from "react";
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

function getFocusable(container: HTMLElement | null) {
    if (!container) return [];
    return Array.from(
        container.querySelectorAll<HTMLElement>(
            'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
    ).filter((el) => {
        const isDisabled =
            (el as any).disabled === true ||
            el.getAttribute("aria-disabled") === "true" ||
            el.getAttribute("disabled") !== null;
        const isHidden = el.getAttribute("aria-hidden") === "true";
        return !isDisabled && !isHidden && el.tabIndex >= 0;
    });
}

export default function SampleIdChangeDecisionModal({ open, mode, busy, row, onClose, onConfirm }: Props) {
    const [reason, setReason] = useState("");

    const dialogRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const lastActiveRef = useRef<HTMLElement | null>(null);

    const titleId = "sampleid-change-decision-title";

    useEffect(() => {
        if (!open) return;
        setReason("");

        lastActiveRef.current = (document.activeElement as HTMLElement) ?? null;

        const t = window.setTimeout(() => {
            if (mode === "reject") textareaRef.current?.focus();
        }, 0);

        return () => {
            window.clearTimeout(t);
            lastActiveRef.current?.focus?.();
        };
    }, [open, mode]);

    // keyboard: ESC + focus trap
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!busy) onClose();
                return;
            }
            if (e.key !== "Tab") return;

            const focusables = getFocusable(dialogRef.current);
            if (!focusables.length) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (!active || !dialogRef.current?.contains(active)) {
                e.preventDefault();
                first.focus();
                return;
            }

            if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
                return;
            }

            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, busy, onClose]);

    const title = mode === "approve" ? "Approve Sample ID change" : "Reject Sample ID change";

    function prettySampleId(raw?: any) {
        const s = String(raw ?? "").trim().toUpperCase();
        if (!s) return "—";
        const m = s.match(/^([A-Z]{1,5})\s*[- ]?\s*(\d{1,6})$/);
        if (!m) return s;
        const prefix = m[1];
        const num = Number(m[2]);
        if (!Number.isFinite(num) || num <= 0) return s;
        return `${prefix} ${String(num).padStart(3, "0")}`;
    }

    const suggested = row?.suggested_lab_sample_code ?? row?.suggested_sample_id ?? (row as any)?.suggested ?? null;

    const proposed = row?.proposed_lab_sample_code ?? row?.proposed_sample_id ?? (row as any)?.proposed ?? null;

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
            <div className="absolute inset-0 bg-black/40" onClick={() => (busy ? null : onClose())} aria-hidden="true" />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
            >
                <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div id={titleId} className="text-lg font-semibold text-gray-900">
                                {title}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                Request #{row?.sample_id ?? (row as any)?.request_id ?? "—"} • Change #
                                {row?.change_request_id ?? row?.id ?? (row as any)?.sample_id_change_id ?? "—"}
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
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="text-xs text-gray-500">Comparison</div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                                <div className="text-xs text-gray-500">Suggested</div>
                                <div className="mt-1 font-mono font-semibold text-gray-900">{prettySampleId(suggested)}</div>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
                                <div className="text-xs text-gray-500">Proposed</div>
                                <div className="mt-1 font-mono font-semibold text-gray-900">{prettySampleId(proposed)}</div>
                            </div>
                        </div>
                    </div>

                    {mode === "reject" ? (
                        <div>
                            <label className="block text-sm font-semibold text-gray-900">
                                Rejection reason <span className="text-red-600">*</span>
                            </label>
                            <div className="text-xs text-gray-500 mt-1">
                                Keep it specific so Admin knows what to fix.
                            </div>
                            <textarea
                                ref={textareaRef}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                disabled={!!busy}
                                className="mt-2 w-full min-h-[110px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                                placeholder="Explain why this change is rejected… (min 3 characters)"
                            />
                        </div>
                    ) : (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            Approval will unlock the request for Admin final assignment.
                        </div>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-white">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={!!busy}
                        className={cx("lims-btn", busy && "opacity-60 cursor-not-allowed")}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={() => onConfirm(mode === "reject" ? reason.trim() : undefined)}
                        className={cx(
                            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white",
                            mode === "approve" ? "bg-primary hover:opacity-95" : "bg-rose-600 hover:bg-rose-700",
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
