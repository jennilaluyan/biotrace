import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ClipboardCheck, X } from "lucide-react";

import { updateRequestStatus } from "../../services/sampleRequestStatus";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Action = "accept" | "reject" | "received";

type Props = {
    open: boolean;
    sampleId: number | null; // dipakai sebagai Request ID di UI (sesuai permintaan)
    action: Action;
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

function getModalCopy(t: any, action: Action) {
    if (action === "accept") {
        return {
            title: t("samples.requestStatusModal.title.accept", {
                defaultValue: "Accept Request",
            }),
            subtitle: t("samples.requestStatusModal.subtitle.accept", {
                defaultValue: "Accept this request so the client can proceed with delivery.",
            }),
            confirm: t("samples.requestStatusModal.buttons.confirmAccept", {
                defaultValue: "Accept",
            }),
            nextLabel: "ready_for_delivery",
        };
    }

    if (action === "reject") {
        return {
            title: t("samples.requestStatusModal.title.reject", {
                defaultValue: "Reject Request",
            }),
            subtitle: t("samples.requestStatusModal.subtitle.reject", {
                defaultValue: "Reject this request. A reason is required.",
            }),
            confirm: t("samples.requestStatusModal.buttons.confirmReject", {
                defaultValue: "Reject",
            }),
            nextLabel: "rejected",
        };
    }

    return {
        title: t("samples.requestStatusModal.title.received", {
            defaultValue: "Mark Physically Received",
        }),
        subtitle: t("samples.requestStatusModal.subtitle.received", {
            defaultValue: "Confirm the sample has been physically received at the lab.",
        }),
        confirm: t("samples.requestStatusModal.buttons.confirmReceived", {
            defaultValue: "Mark received",
        }),
        nextLabel: "physically_received",
    };
}

export const UpdateRequestStatusModal = (props: Props) => {
    const { t } = useTranslation();
    const { open, sampleId, action, currentStatus, onClose, onUpdated } = props;

    const requestId = sampleId;

    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isAccept = action === "accept";
    const isReject = action === "reject";
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

    const copy = useMemo(() => getModalCopy(t, action), [t, action]);

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!requestId) return false;

        // Reject: note wajib
        if (isReject) return note.trim().length >= 1;

        // Accept/Received: note tidak wajib
        return true;
    }, [open, busy, requestId, isReject, note]);

    const Icon = isReject ? AlertTriangle : (isReceived ? ClipboardCheck : Check);
    const iconTone = isReject ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700";

    const noteLabel = useMemo(() => {
        if (isReject) {
            return t("samples.requestStatusModal.note.labelRequired", {
                defaultValue: "Rejection reason (required)",
            });
        }
        return t("samples.requestStatusModal.note.labelOptional", {
            defaultValue: "Note (optional)",
        });
    }, [isReject, t]);

    const notePlaceholder = useMemo(() => {
        if (isReject) {
            return t("samples.requestStatusModal.note.placeholderReject", {
                defaultValue: "Write the reason for rejection…",
            });
        }
        if (isReceived) {
            return t("samples.requestStatusModal.note.placeholderReceived", {
                defaultValue: "Optional note…",
            });
        }
        return t("samples.requestStatusModal.note.placeholderAccept", {
            defaultValue: "Optional note…",
        });
    }, [isReject, isReceived, t]);

    const submit = async () => {
        if (!canConfirm || !requestId) return;

        try {
            setBusy(true);
            setError(null);

            // Only send note when it is meaningful.
            const trimmedNote = note.trim();
            const noteToSend =
                isReject ? trimmedNote : (trimmedNote.length ? trimmedNote : null);

            await updateRequestStatus(requestId, action, noteToSend);

            onClose();
            onUpdated();
        } catch (err) {
            setError(getErrMsg(err, t("samples.requestStatusModal.errors.updateFailed", { defaultValue: "Failed to update request status." })));
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    return (
        <div className="lims-modal-backdrop p-4" role="dialog" aria-modal="true" aria-label={copy.title}>
            <div className="lims-modal-panel max-w-xl">
                <div className="lims-modal-header">
                    <div className={cx("h-9 w-9 rounded-full flex items-center justify-center", iconTone)} aria-hidden="true">
                        <Icon size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{copy.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{copy.subtitle}</div>
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button"
                        aria-label={t("close", { defaultValue: "Close" })}
                        title={t("close", { defaultValue: "Close" })}
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
                            <span className="font-semibold">{t("summary", { defaultValue: "Summary" })}</span>
                        </div>

                        <div className="mt-2 text-sm text-gray-900">
                            <span className="text-gray-600">
                                {t("samples.requestStatusModal.summary.current", { defaultValue: "Current" })}:
                            </span>{" "}
                            <span className="font-semibold">{String(currentStatus ?? "-")}</span>

                            <span className="text-gray-600">
                                {" "}
                                • {t("samples.requestStatusModal.summary.next", { defaultValue: "Next" })}:{" "}
                                <span className="font-semibold">{copy.nextLabel}</span>
                            </span>
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                            {t("samples.requestStatusModal.summary.requestId", { defaultValue: "Request ID" })}:{" "}
                            {requestId ?? "-"}
                        </div>
                    </div>

                    {/* Reject note (required) */}
                    {isReject ? (
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

                            <div className="mt-2 text-[11px] text-gray-500">
                                {t("samples.requestStatusModal.note.helpReject", {
                                    defaultValue: "This reason will be saved for audit and shown to relevant staff.",
                                })}
                            </div>
                        </div>
                    ) : null}

                    {/* Received note (optional) */}
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
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={!!busy}
                        className="btn-outline disabled:opacity-50"
                    >
                        {t("cancel", { defaultValue: "Cancel" })}
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={submit}
                        className={cx(
                            isReject ? "lims-btn-danger" : "lims-btn-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        title={copy.confirm}
                    >
                        {busy ? t("processing", { defaultValue: "Processing…" }) : copy.confirm}
                    </button>
                </div>
            </div>
        </div>
    );
};