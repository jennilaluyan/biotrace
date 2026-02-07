// frontend/src/components/samples/RenameKanbanColumnModal.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type Props = {
    open: boolean;
    currentName: string;
    title?: string;
    loading?: boolean;
    error?: string | null;
    onClose: () => void;
    onSubmit: (nextName: string) => void | Promise<void>;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export function RenameKanbanColumnModal(props: Props) {
    const { open, currentName, title, loading, error, onClose, onSubmit } = props;

    const [name, setName] = useState(currentName || "");
    const [touched, setTouched] = useState(false);

    const inputRef = useRef<HTMLInputElement | null>(null);

    // init/reset when opened
    useEffect(() => {
        if (!open) return;
        setName(currentName || "");
        setTouched(false);

        // focus after paint
        const t = window.setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 0);

        return () => window.clearTimeout(t);
    }, [open, currentName]);

    // ESC close
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    // lock body scroll (match existing modal pattern)
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

    const validation = useMemo(() => {
        const v = name.trim();
        if (!v) return "Name is required.";
        if (v.length < 2) return "Name is too short.";
        if (v.length > 60) return "Max 60 characters.";
        return null;
    }, [name]);

    const canSubmit = open && !loading && !validation && name.trim() !== (currentName || "").trim();

    const submit = async () => {
        setTouched(true);
        if (!canSubmit) return;
        await onSubmit(name.trim());
    };

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

            <div className="relative w-[92vw] max-w-md rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">
                            {title || "Rename column"}
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Update the column name. This affects the workflow board for this group.
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
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
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
                        onBlur={() => setTouched(true)}
                        disabled={!!loading}
                        placeholder="e.g. Ekstraksi"
                        className={cx(
                            "w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                            touched && validation ? "border-red-300" : "border-gray-300",
                            loading && "bg-gray-100"
                        )}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") submit();
                        }}
                    />

                    {touched && validation ? (
                        <div className="mt-2 text-xs text-red-600">{validation}</div>
                    ) : (
                        <div className="mt-2 text-[11px] text-gray-500">
                            Tip: keep it short and consistent across stages.
                        </div>
                    )}
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button
                        type="button"
                        className="lims-btn"
                        onClick={onClose}
                        disabled={!!loading}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className={cx("lims-btn-primary", !canSubmit && "opacity-60 cursor-not-allowed")}
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {loading ? (
                            <span className="inline-flex items-center gap-2">
                                <Loader2 size={16} className="animate-spin" />
                                Saving...
                            </span>
                        ) : (
                            "Save"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
