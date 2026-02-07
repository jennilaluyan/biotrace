// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\DeleteKanbanColumnModal.tsx
import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    columnName: string;

    loading?: boolean;
    error?: string | null;

    onClose: () => void;
    onConfirm: () => void;
};

export function DeleteKanbanColumnModal(props: Props) {
    const { open, columnName, loading, error, onClose, onConfirm } = props;

    const [typed, setTyped] = useState("");

    const confirmText = useMemo(() => {
        // keep it simple + strong guard
        return "DELETE";
    }, []);

    const canConfirm = useMemo(() => {
        if (loading) return false;
        return typed.trim().toUpperCase() === confirmText;
    }, [typed, confirmText, loading]);

    useEffect(() => {
        if (!open) return;
        setTyped("");
    }, [open]);

    // ESC close
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    // lock body scroll
    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;
        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            <div className="relative w-[92vw] max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Delete column</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            You are about to delete{" "}
                            <span className="font-semibold text-gray-900">“{columnName || "Untitled"}”</span>.
                            This action cannot be undone.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
                        disabled={!!loading}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M18 6L6 18" />
                            <path d="M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-6 py-5">
                    {error ? (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        Tip: delete is safest when the column has no cards.
                    </div>

                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Type <span className="font-semibold">{confirmText}</span> to confirm
                        </label>
                        <input
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                            disabled={!!loading}
                            placeholder={confirmText}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && canConfirm) onConfirm();
                            }}
                        />
                    </div>

                    <div className="mt-2 text-[11px] text-gray-500">
                        This confirmation prevents accidental deletes.
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={!!loading}>
                        Cancel
                    </button>

                    <button
                        type="button"
                        className={cx(
                            "lims-btn-primary inline-flex items-center gap-2",
                            !canConfirm && "opacity-60 cursor-not-allowed"
                        )}
                        onClick={() => canConfirm && onConfirm()}
                        disabled={!canConfirm}
                        title={canConfirm ? "Delete column" : `Type ${confirmText} to enable delete`}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
