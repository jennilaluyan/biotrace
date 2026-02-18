import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
    const { open, side, relativeToName, loading, error, onClose, onSubmit } = props;

    const [name, setName] = useState("");
    const inputRef = useRef<HTMLInputElement | null>(null);

    const title = useMemo(() => {
        const position =
            side === "left"
                ? t("samples.kanban.addColumn.position.before")
                : t("samples.kanban.addColumn.position.after");

        const reference = relativeToName
            ? t("samples.kanban.addColumn.reference.named", { name: relativeToName })
            : t("samples.kanban.addColumn.reference.thisColumn");

        return t("samples.kanban.addColumn.title", { position, reference });
    }, [side, relativeToName, t]);

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            <div className="relative w-[92vw] max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                        <p className="text-xs text-gray-500 mt-1">{t("samples.kanban.addColumn.helper")}</p>
                    </div>

                    <button
                        type="button"
                        className={cx("text-gray-500 hover:text-gray-700", loading && "opacity-60 cursor-not-allowed")}
                        onClick={onClose}
                        aria-label={t("close")}
                        disabled={!!loading}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="px-6 py-5">
                    {error ? (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    ) : null}

                    <label className="block text-xs font-medium text-gray-600 mb-1">
                        {t("samples.kanban.addColumn.nameLabel")} <span className="text-red-600">*</span>
                    </label>
                    <input
                        ref={inputRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("samples.kanban.addColumn.namePlaceholder")}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        disabled={!!loading}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canSubmit) onSubmit(name.trim());
                        }}
                    />

                    <div className="mt-2 text-[11px] text-gray-500">
                        {t("samples.kanban.addColumn.sideLabel")}{" "}
                        <span className="font-semibold text-gray-800">
                            {side === "left" ? t("samples.kanban.addColumn.side.left") : t("samples.kanban.addColumn.side.right")}
                        </span>
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={!!loading}>
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        className={cx("lims-btn-primary inline-flex items-center gap-2", !canSubmit && "opacity-60")}
                        onClick={() => canSubmit && onSubmit(name.trim())}
                        disabled={!canSubmit}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                        {t("samples.kanban.addColumn.addButton")}
                    </button>
                </div>
            </div>
        </div>
    );
}
