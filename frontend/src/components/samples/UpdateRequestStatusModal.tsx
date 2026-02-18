import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ShieldCheck, Undo2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiPost } from "../../services/api";

type Props = {
    open: boolean;
    sampleId: number | null;
    action: "return" | "approve" | "received";
    currentStatus?: string | null;

    onClose: () => void;
    onUpdated: () => void;
};

type ApiError = {
    response?: { data?: any };
    data?: any;
    message?: string;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

const getErrorMessage = (err: unknown, fallback: string) => {
    const e = err as ApiError;
    const data = e?.response?.data ?? e?.data ?? undefined;

    const details = data?.details ?? data?.errors;
    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstVal = firstKey ? details[firstKey] : undefined;
        if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
        if (typeof firstVal === "string" && firstVal) return String(firstVal);
    }

    return (
        data?.message ??
        data?.error ??
        (typeof (e as any)?.message === "string" ? (e as any).message : null) ??
        fallback
    );
};

export const UpdateRequestStatusModal = ({ open, sampleId, action, currentStatus, onClose, onUpdated }: Props) => {
    const { t, i18n } = useTranslation();
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const lastActiveElRef = useRef<HTMLElement | null>(null);

    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const nextLabel = useMemo(() => {
        if (action === "return") return "returned";
        if (action === "approve") return "ready_for_delivery";
        return "physically_received";
    }, [action]);

    const title = useMemo(() => t(`samples.requestStatusModal.title.${action}`), [action, i18n.resolvedLanguage, i18n.language, t]);
    const subtitle = useMemo(
        () => t(`samples.requestStatusModal.subtitle.${action}`),
        [action, i18n.resolvedLanguage, i18n.language, t]
    );

    const noteLabel = useMemo(() => {
        if (action === "return") return t("samples.requestStatusModal.note.labelRequired");
        return t("samples.requestStatusModal.note.labelOptional");
    }, [action, i18n.resolvedLanguage, i18n.language, t]);

    const notePlaceholder = useMemo(() => {
        if (action === "return") return t("samples.requestStatusModal.note.placeholderReturn");
        if (action === "approve") return t("samples.requestStatusModal.note.placeholderApprove");
        return t("samples.requestStatusModal.note.placeholderReceived");
    }, [action, i18n.resolvedLanguage, i18n.language, t]);

    const confirmLabel = useMemo(() => {
        if (action === "return") return t("samples.requestStatusModal.buttons.confirmReturn");
        if (action === "approve") return t("samples.requestStatusModal.buttons.confirmApprove");
        return t("samples.requestStatusModal.buttons.confirmReceived");
    }, [action, i18n.resolvedLanguage, i18n.language, t]);

    const Icon = action === "return" ? Undo2 : action === "approve" ? ShieldCheck : CheckCircle2;

    const canSubmit = useMemo(() => {
        if (!sampleId) return false;
        if (submitting) return false;
        if (action === "return") return note.trim().length > 0;
        return true;
    }, [sampleId, submitting, action, note]);

    useEffect(() => {
        if (!open) return;

        lastActiveElRef.current = (document.activeElement as HTMLElement) ?? null;

        setNote("");
        setError(null);
        setSubmitting(false);

        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const focusTimer = window.setTimeout(() => textareaRef.current?.focus(), 0);

        return () => {
            window.clearTimeout(focusTimer);
            document.body.style.overflow = prevOverflow;

            // restore focus for keyboard users
            window.setTimeout(() => lastActiveElRef.current?.focus?.(), 0);
        };
    }, [open, action, sampleId]);

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    const submit = async () => {
        if (!canSubmit || !sampleId) return;

        try {
            setSubmitting(true);
            setError(null);

            // backend expects { action: "accept" | "return" | "received", note? }
            const payload =
                action === "approve"
                    ? { action: "accept", note: note.trim() || undefined }
                    : action === "return"
                        ? { action: "return", note: note.trim() }
                        : { action: "received", note: note.trim() || undefined };

            await apiPost<any>(`/v1/samples/${sampleId}/request-status`, payload);

            onClose();
            onUpdated();
        } catch (err: unknown) {
            setError(getErrorMessage(err, t("samples.requestStatusModal.errors.updateFailed")));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* overlay */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={() => (submitting ? null : onClose())}
                aria-hidden="true"
            />

            {/* modal */}
            <div
                role="dialog"
                aria-modal="true"
                className="relative w-[92vw] max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
            >
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50">
                            <Icon size={18} className="text-gray-700" />
                        </div>

                        <div>
                            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>

                            <div className="text-[11px] text-gray-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                <span>
                                    <span className="font-semibold">{t("samples.requestStatusModal.summary.sampleId")}:</span>{" "}
                                    <span className="font-mono">{sampleId ?? "-"}</span>
                                </span>

                                <span>
                                    <span className="font-semibold">{t("samples.requestStatusModal.summary.current")}:</span>{" "}
                                    <span className="font-mono">{currentStatus ?? "-"}</span>
                                </span>

                                <span>
                                    <span className="font-semibold">{t("samples.requestStatusModal.summary.next")}:</span>{" "}
                                    <span className="font-mono">{nextLabel}</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className={cx("text-gray-500 hover:text-gray-700", submitting && "opacity-60 cursor-not-allowed")}
                        onClick={onClose}
                        aria-label={t("close")}
                        disabled={submitting}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-6 py-5">
                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    )}

                    <label className="block text-xs font-medium text-gray-600 mb-1">{noteLabel}</label>
                    <textarea
                        ref={textareaRef}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={4}
                        placeholder={notePlaceholder}
                        className={cx(
                            "w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                            action === "return" && note.trim().length === 0 ? "border-red-200" : ""
                        )}
                    />

                    {action === "return" && (
                        <div className="mt-2 text-[11px] text-gray-500">{t("samples.requestStatusModal.note.helpReturn")}</div>
                    )}
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={submitting}>
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        className={cx("lims-btn-primary inline-flex items-center gap-2", action === "return" ? "bg-red-600 hover:bg-red-700" : "")}
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {submitting ? t("saving") : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
