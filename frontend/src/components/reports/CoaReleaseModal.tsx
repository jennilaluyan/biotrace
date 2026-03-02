import { useEffect, useMemo, useState } from "react";
import { X, Send, CheckCircle2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type Mode = "check" | "release";

type Props = {
    open: boolean;
    mode: Mode;
    onClose: () => void;
    onSubmit: (note: string) => Promise<void>;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export function CoaReleaseModal({ open, mode, onClose, onSubmit }: Props) {
    const { t } = useTranslation();
    const [note, setNote] = useState("");
    const [saving, setSaving] = useState(false);
    const title = useMemo(() => {
        return mode === "release"
            ? t("reports.releaseCoaTitle", "Release COA to Client")
            : t("reports.checkCoaTitle", "Mark COA as Checked");
    }, [mode, t]);

    useEffect(() => {
        if (open) {
            setNote("");
            setSaving(false);
        }
    }, [open]);

    if (!open) return null;

    const icon = mode === "release" ? <Send size={18} /> : <CheckCircle2 size={18} />;

    return (
        <div className="fixed inset-0 z-[70]">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                        <div className="flex items-center gap-2 font-semibold">
                            {icon}
                            <span>{title}</span>
                        </div>
                        <button type="button" className="lims-icon-button" onClick={onClose}>
                            <X size={18} />
                        </button>
                    </div>

                    <div className="px-5 py-4">
                        {mode === "release" ? (
                            <>
                                <label className="block text-sm font-medium text-gray-700">
                                    {t("reports.releaseNoteLabel", "Optional note for client")}
                                </label>
                                <textarea
                                    className={cx(
                                        "mt-2 w-full min-h-[120px] rounded-xl border border-gray-200 px-3 py-2 text-sm",
                                        "focus:outline-none focus:ring-2 focus:ring-primary-soft/30 focus:border-primary-soft"
                                    )}
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    placeholder={t("reports.releaseNotePlaceholder", "e.g. Please review page 1, note on result X…")}
                                />
                            </>
                        ) : (
                            <div className="text-sm text-gray-700">
                                {t("reports.checkCoaBody", "This will mark the COA as checked by Admin.")}
                            </div>
                        )}
                    </div>

                    <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                        <button type="button" className="btn-outline" onClick={onClose} disabled={saving}>
                            {t(["cancel", "common.cancel"], "Cancel")}
                        </button>
                        <button
                            type="button"
                            className="btn-primary"
                            disabled={saving}
                            onClick={async () => {
                                try {
                                    setSaving(true);
                                    await onSubmit(note.trim());
                                    onClose();
                                } finally {
                                    setSaving(false);
                                }
                            }}
                        >
                            {saving ? <Loader2 className="animate-spin" size={16} /> : null}
                            <span className="ml-2">
                                {mode === "release"
                                    ? t("reports.releaseCoaAction", "Release")
                                    : t("reports.checkCoaAction", "Mark checked")}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}