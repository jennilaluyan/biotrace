import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, X } from "lucide-react";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "approve" | "reject";

    title: string;
    subtitle?: string | null;

    submitting?: boolean;
    error?: string | null;

    rejectNote: string;
    onRejectNoteChange: (v: string) => void;

    approveHint?: string | null;

    onClose: () => void;
    onConfirm: () => void;
};

export default function ParameterRequestDecisionModal(props: Props) {
    const { t } = useTranslation();

    const {
        open,
        mode,
        title,
        subtitle,
        submitting = false,
        error,
        rejectNote,
        onRejectNoteChange,
        approveHint,
        onClose,
        onConfirm,
    } = props;

    const isReject = mode === "reject";
    const noteLen = useMemo(() => String(rejectNote ?? "").trim().length, [rejectNote]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!submitting) onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose, submitting]);

    if (!open) return null;

    return (
        <div className="lims-modal-backdrop p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="lims-modal-panel max-w-lg">
                <div className="lims-modal-header">
                    <div
                        className={cx(
                            "h-9 w-9 rounded-full flex items-center justify-center",
                            isReject ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                        )}
                        aria-hidden="true"
                    >
                        {isReject ? <AlertTriangle size={18} /> : <Check size={18} />}
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{title}</div>
                        {subtitle ? <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div> : null}
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button"
                        aria-label={t("close")}
                        title={t("close")}
                        onClick={onClose}
                        disabled={submitting}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="lims-modal-body">
                    {isReject ? (
                        <div>
                            <div className="flex items-baseline justify-between gap-3 mb-2">
                                <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                    {t("parametersPage.decisionModal.rejectNoteRequired")}
                                </div>
                                <div className="text-[11px] text-gray-500 tabular-nums">{noteLen}/1000</div>
                            </div>

                            <textarea
                                value={rejectNote}
                                onChange={(e) => onRejectNoteChange(e.target.value)}
                                className="min-h-[120px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={t("parametersPage.decisionModal.rejectNotePlaceholder")}
                                disabled={submitting}
                                maxLength={1000}
                            />

                            <div className="mt-2 text-[11px] text-gray-500">
                                {t("parametersPage.decisionModal.rejectNoteHelp")}
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-gray-700">
                            {approveHint ?? t("parametersPage.decisionModal.approveDefaultHint")}
                        </div>
                    )}

                    {error ? (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                            {error}
                        </div>
                    ) : null}
                </div>

                <div className="lims-modal-footer">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="btn-outline disabled:opacity-50"
                    >
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={submitting}
                        className={cx(
                            isReject ? "lims-btn-danger" : "lims-btn-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        title={isReject ? t("reject") : t("confirm")}
                    >
                        {submitting ? t("submitting") : isReject ? t("reject") : t("confirm")}
                    </button>
                </div>
            </div>
        </div>
    );
}