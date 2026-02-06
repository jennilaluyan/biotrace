// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\AddKanbanColumnModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    side: "left" | "right";
    relativeToName: string;

    loading?: boolean;
    error?: string | null;

    onClose: () => void;
    onSubmit: (name: string) => void;
};

export function AddKanbanColumnModal(props: Props) {
    const { open, side, relativeToName, loading, error, onClose, onSubmit } = props;

    const [name, setName] = useState("");
    const inputRef = useRef<HTMLInputElement | null>(null);

    const title = useMemo(() => {
        const pos = side === "left" ? "before" : "after";
        const rel = relativeToName ? `“${relativeToName}”` : "this column";
        return `Add column ${pos} ${rel}`;
    }, [side, relativeToName]);

    const canSubmit = useMemo(() => {
        return !!name.trim() && !loading;
    }, [name, loading]);

    // init on open
    useEffect(() => {
        if (!open) return;
        setName("");
        window.setTimeout(() => inputRef.current?.focus(), 0);
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
                        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Give the new column a clear name. You can rename it later.
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

                    <label className="block text-xs font-medium text-gray-600 mb-1">
                        Column name <span className="text-red-600">*</span>
                    </label>
                    <input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Extraction, QC, Review…"
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        disabled={!!loading}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canSubmit) onSubmit(name.trim());
                        }}
                    />

                    <div className="mt-2 text-[11px] text-gray-500">
                        Side: <span className="font-semibold text-gray-800">{side}</span>
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={!!loading}>
                        Cancel
                    </button>

                    <button
                        type="button"
                        className={cx("lims-btn-primary inline-flex items-center gap-2", !canSubmit && "opacity-60")}
                        onClick={() => canSubmit && onSubmit(name.trim())}
                        disabled={!canSubmit}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        Add column
                    </button>
                </div>
            </div>
        </div>
    );
}
