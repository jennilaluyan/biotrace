import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";

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

function getFocusable(container: HTMLElement | null) {
    if (!container) return [];
    const nodes = Array.from(
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

    return nodes;
}

export function DeleteKanbanColumnModal(props: Props) {
    const { open, columnName, loading, error, onClose, onConfirm } = props;

    const [typed, setTyped] = useState("");

    const dialogRef = useRef<HTMLDivElement | null>(null);
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const lastActiveRef = useRef<HTMLElement | null>(null);

    const titleId = "delete-kanban-column-title";
    const descId = "delete-kanban-column-desc";

    const confirmText = "DELETE";

    const canConfirm = useMemo(() => {
        if (loading) return false;
        return typed.trim().toUpperCase() === confirmText;
    }, [typed, loading]);

    // init/reset when opened
    useEffect(() => {
        if (!open) return;
        setTyped("");
    }, [open]);

    // focus management (focus least destructive action), restore on close
    useEffect(() => {
        if (!open) return;

        lastActiveRef.current = (document.activeElement as HTMLElement) ?? null;

        const t = window.setTimeout(() => {
            // safest default focus: Cancel
            cancelRef.current?.focus();
        }, 0);

        return () => {
            window.clearTimeout(t);
            lastActiveRef.current?.focus?.();
        };
    }, [open]);

    // keyboard: ESC + focus trap
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!loading) onClose();
                return;
            }

            if (e.key !== "Tab") return;

            const focusables = getFocusable(dialogRef.current);
            if (focusables.length === 0) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;

            // if focus somehow escapes, pull it back in
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
    }, [open, loading, onClose]);

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
            <div
                className="absolute inset-0 bg-black/40"
                onClick={() => {
                    if (!loading) onClose();
                }}
                aria-hidden="true"
            />

            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                className="relative w-[92vw] max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
            >
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 id={titleId} className="text-base font-semibold text-gray-900">
                            Delete workflow column
                        </h2>
                        <p id={descId} className="text-xs text-gray-500 mt-1">
                            You are about to delete{" "}
                            <span className="font-semibold text-gray-900">“{columnName || "Untitled"}”</span>. This action
                            cannot be undone.
                        </p>
                    </div>

                    <button
                        type="button"
                        className={cx("lims-icon-button", loading && "opacity-60 cursor-not-allowed")}
                        onClick={onClose}
                        aria-label="Close"
                        disabled={!!loading}
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="px-6 py-5">
                    {error ? (
                        <div
                            className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4"
                            role="alert"
                        >
                            {error}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        Tip: Deleting is safest when the column is empty.
                    </div>

                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="delete-confirm-input">
                            Type <span className="font-semibold">{confirmText}</span> to confirm
                        </label>
                        <input
                            id="delete-confirm-input"
                            value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                            disabled={!!loading}
                            placeholder={confirmText}
                            autoComplete="off"
                            inputMode="text"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && canConfirm) onConfirm();
                            }}
                        />
                    </div>

                    <div className="mt-2 text-[11px] text-gray-500">
                        This confirmation helps prevent accidental deletions.
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button
                        ref={cancelRef}
                        type="button"
                        className="lims-btn"
                        onClick={onClose}
                        disabled={!!loading}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className={cx(
                            "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white",
                            "bg-rose-600 hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-200",
                            !canConfirm && "opacity-60 cursor-not-allowed"
                        )}
                        onClick={() => canConfirm && onConfirm()}
                        disabled={!canConfirm}
                        title={canConfirm ? "Delete column" : `Type ${confirmText} to enable delete`}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        Delete column
                    </button>
                </div>
            </div>
        </div>
    );
}
