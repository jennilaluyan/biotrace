import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

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

export function RenameKanbanColumnModal(props: Props) {
    const { open, currentName, title, loading, error, onClose, onSubmit } = props;

    const [name, setName] = useState(currentName || "");
    const [touched, setTouched] = useState(false);

    const dialogRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const lastActiveRef = useRef<HTMLElement | null>(null);

    const titleId = "rename-kanban-column-title";
    const descId = "rename-kanban-column-desc";

    // init/reset when opened
    useEffect(() => {
        if (!open) return;
        setName(currentName || "");
        setTouched(false);

        lastActiveRef.current = (document.activeElement as HTMLElement) ?? null;

        // focus after paint
        const t = window.setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 0);

        return () => {
            window.clearTimeout(t);
            lastActiveRef.current?.focus?.();
        };
    }, [open, currentName]);

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
    }, [open, onClose, loading]);

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

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={descId}
                className="relative w-[92vw] max-w-md rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
            >
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 id={titleId} className="text-base font-semibold text-gray-900">
                            {title || "Rename column"}
                        </h2>
                        <p id={descId} className="text-xs text-gray-500 mt-1">
                            Keep names short and consistent across workflow stages.
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
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3" role="alert">
                            {error}
                        </div>
                    ) : null}

                    <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="rename-column-input">
                        Column name <span className="text-red-600">*</span>
                    </label>
                    <input
                        id="rename-column-input"
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
                        <div className="mt-2 text-[11px] text-gray-500">Tip: avoid punctuation; use clear verbs/nouns.</div>
                    )}
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={!!loading}>
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
                                Saving…
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
