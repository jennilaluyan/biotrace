// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\UpdateRequestStatusModal.tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ClipboardCheck, X } from "lucide-react";
import { apiPost } from "../../services/api";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    sampleId: number | null; // dipakai sebagai Request ID di UI (sesuai permintaan)
    action: "return" | "approve" | "received";
    currentStatus?: string | null;

    onClose: () => void;
    onUpdated: () => void;
};

type ApiErrorLike = {
    response?: { data?: any };
    data?: any;
    message?: string;
};

function getErrMsg(err: unknown, fallback: string) {
    const e = err as ApiErrorLike;
    const data = e?.response?.data ?? e?.data;

    const details = data?.details ?? data?.errors;
    if (details && typeof details === "object") {
        const k = Object.keys(details)[0];
        const v = k ? details[k] : undefined;
        if (Array.isArray(v) && v[0]) return String(v[0]);
        if (typeof v === "string" && v) return v;
    }

    return (
        data?.message ??
        data?.error ??
        (typeof (e as any)?.message === "string" ? (e as any).message : null) ??
        fallback
    );
}

export const UpdateRequestStatusModal = (props: Props) => {
    const { t } = useTranslation();
    const { open, sampleId, action, currentStatus, onClose, onUpdated } = props;

    const requestId = sampleId;

    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isReturn = action === "return";
    const isApprove = action === "approve";
    const isReceived = action === "received";

    useEffect(() => {
        if (!open) return;
        setNote("");
        setError(null);
        setBusy(false);
    }, [open, action, requestId]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!busy) onClose();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, busy, onClose]);

    const title = useMemo(() => t(`samples.requestStatusModal.title.${action}`), [action, t]);
    const subtitle = useMemo(() => t(`samples.requestStatusModal.subtitle.${action}`), [action, t]);

    const nextLabel = useMemo(() => {
        if (isReturn) return "returned";
        if (isApprove) return "ready_for_delivery";
        return "physically_received";
    }, [isReturn, isApprove]);

    const confirmLabel = useMemo(() => {
        if (isReturn) return t("samples.requestStatusModal.buttons.confirmReturn");
        if (isApprove) return t("samples.requestStatusModal.buttons.confirmApprove");
        return t("samples.requestStatusModal.buttons.confirmReceived");
    }, [isReturn, isApprove, t]);

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!requestId) return false;

        // Return: note wajib
        if (isReturn) return note.trim().length >= 1;

        // Approve: TIDAK butuh note
        if (isApprove) return true;

        // Received: note opsional
        return true;
    }, [open, busy, requestId, isReturn, isApprove, note]);

    const Icon = isReturn ? AlertTriangle : Check;
    const iconTone = isReturn ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700";

    const noteLabel = useMemo(() => {
        if (isReturn) return t("samples.requestStatusModal.note.labelRequired");
        return t("samples.requestStatusModal.note.labelOptional");
    }, [isReturn, t]);

    const notePlaceholder = useMemo(() => {
        if (isReturn) return t("samples.requestStatusModal.note.placeholderReturn");
        if (isApprove) return t("samples.requestStatusModal.note.placeholderApprove");
        return t("samples.requestStatusModal.note.placeholderReceived");
    }, [isReturn, isApprove, t]);

    const submit = async () => {
        if (!canConfirm || !requestId) return;

        try {
            setBusy(true);
            setError(null);

            const payload =
                action === "approve"
                    ? { action: "accept" as const } // approve tanpa note
                    : action === "return"
                        ? { action: "return" as const, note: note.trim() }
                        : { action: "received" as const, note: note.trim() || undefined };

            await apiPost(`/v1/samples/${requestId}/request-status`, payload);

            onClose();
            onUpdated();
        } catch (err) {
            setError(getErrMsg(err, t("samples.requestStatusModal.errors.updateFailed")));
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    return (
        <div className="lims-modal-backdrop p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="lims-modal-panel max-w-xl">
                <div className="lims-modal-header">
                    <div className={cx("h-9 w-9 rounded-full flex items-center justify-center", iconTone)} aria-hidden="true">
                        <Icon size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{title}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</div>
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button"
                        aria-label={t("close")}
                        title={t("close")}
                        onClick={onClose}
                        disabled={!!busy}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="lims-modal-body">
                    {error ? (
                        <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                            {error}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <ClipboardCheck size={14} />
                            <span className="font-semibold">{t("summary")}</span>
                        </div>

                        <div className="mt-2 text-sm text-gray-900">
                            <span className="text-gray-600">{t("samples.requestStatusModal.summary.current")}:</span>{" "}
                            <span className="font-semibold">{String(currentStatus ?? "-")}</span>

                            <span className="text-gray-600">
                                {" "}
                                • {t("samples.requestStatusModal.summary.next")}:{" "}
                                <span className="font-semibold">{nextLabel}</span>
                            </span>
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                            {t("samples.requestStatusModal.summary.requestId", { defaultValue: "Request ID" })}:{" "}
                            {requestId ?? "-"}
                        </div>
                    </div>

                    {/* RETURN: note wajib */}
                    {isReturn ? (
                        <div className="mt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <label className="block text-sm font-semibold text-gray-900">{noteLabel}</label>
                                <div className="text-[11px] text-gray-500 tabular-nums">{note.trim().length}/500</div>
                            </div>

                            <textarea
                                className="mt-2 w-full min-h-[120px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={notePlaceholder}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={!!busy}
                                maxLength={500}
                            />

                            <div className="mt-2 text-[11px] text-gray-500">{t("samples.requestStatusModal.note.helpReturn")}</div>
                        </div>
                    ) : null}

                    {/* RECEIVED: note opsional */}
                    {isReceived ? (
                        <div className="mt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <label className="block text-sm font-semibold text-gray-900">{noteLabel}</label>
                                <div className="text-[11px] text-gray-500 tabular-nums">{note.trim().length}/500</div>
                            </div>

                            <textarea
                                className="mt-2 w-full min-h-[120px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={notePlaceholder}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={!!busy}
                                maxLength={500}
                            />
                        </div>
                    ) : null}
                </div>

                <div className="lims-modal-footer">
                    <button type="button" onClick={onClose} disabled={!!busy} className="btn-outline disabled:opacity-50">
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={submit}
                        className={cx(
                            isReturn ? "lims-btn-danger" : "lims-btn-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        title={confirmLabel}
                    >
                        {busy ? t("processing") : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};