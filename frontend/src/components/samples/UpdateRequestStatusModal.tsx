import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ClipboardCheck, X } from "lucide-react";

import { updateRequestStatus } from "../../services/sampleRequestStatus";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Action = "accept" | "reject" | "return" | "received";

type Props = {
    open: boolean;
    sampleId: number | null;
    action: Action;
    currentStatus?: string | null;
    batchId?: string | null;
    batchTotal?: number;
    batchActiveTotal?: number;
    defaultApplyToBatch?: boolean;
    onClose: () => void;
    onUpdated: () => void;
};

type ApiErrorLike = {
    response?: { data?: any };
    data?: any;
    message?: string;
};

type ModalCopy = {
    title: string;
    subtitle: string;
    confirm: string;
    nextLabel: string;
};

function getErrMsg(err: unknown, fallback: string) {
    const e = err as ApiErrorLike;
    const data = e?.response?.data ?? e?.data;

    const details = data?.details ?? data?.errors;
    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstValue = firstKey ? (details as any)[firstKey] : undefined;

        if (Array.isArray(firstValue) && firstValue[0]) return String(firstValue[0]);
        if (typeof firstValue === "string" && firstValue) return firstValue;
    }

    if (typeof data?.message === "string" && data.message) return data.message;
    if (typeof data?.error === "string" && data.error) return data.error;
    if (typeof e?.message === "string" && e.message) return e.message;

    return fallback;
}

function normalizeStatusWords(input?: string | null) {
    return String(input ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ");
}

function compactRequestStatusToken(token: string, locale: string) {
    const isIndonesian = String(locale || "").toLowerCase().startsWith("id");

    const labelMap: Record<string, { en: string; id: string }> = {
        submitted: { en: "submitted", id: "terkirim" },
        ready_for_delivery: { en: "ready", id: "siap" },
        physically_received: { en: "received", id: "diterima" },
        rejected: { en: "rejected", id: "ditolak" },
        needs_revision: { en: "revision", id: "revisi" },
        returned: { en: "revision", id: "revisi" },
        awaiting_verification: { en: "verify", id: "verifikasi" },
        waiting_sample_id_assignment: { en: "waiting", id: "menunggu" },
        sample_id_pending_verification: { en: "verify", id: "verifikasi" },
        sample_id_approved_for_assignment: { en: "approved", id: "disetujui" },
        in_transit_to_collector: { en: "transit", id: "transit" },
        under_inspection: { en: "inspect", id: "inspeksi" },
        returned_to_admin: { en: "returned", id: "kembali" },
        intake_checklist_passed: { en: "intake", id: "intake" },
        intake_validated: { en: "validated", id: "validasi" },
    };

    const label = labelMap[token]?.[isIndonesian ? "id" : "en"];
    return normalizeStatusWords(label ?? token);
}

function formatStatusLabel(raw?: string | null, locale = "en") {
    const token = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!token) return "-";
    return compactRequestStatusToken(token, locale);
}

function getModalCopy(t: (key: string, options?: any) => string, action: Action): ModalCopy {
    switch (action) {
        case "accept":
            return {
                title: t("samples.requestStatusModal.title.approve", {
                    defaultValue: "Approve request",
                }),
                subtitle: t("samples.requestStatusModal.subtitle.approve", {
                    defaultValue: "Approve this request and move it to the next step.",
                }),
                confirm: t("samples.requestStatusModal.buttons.confirmApprove", {
                    defaultValue: "Approve request",
                }),
                nextLabel: "ready_for_delivery",
            };

        case "reject":
            return {
                title: t("samples.requestStatusModal.title.reject", {
                    defaultValue: "Reject request",
                }),
                subtitle: t("samples.requestStatusModal.subtitle.reject", {
                    defaultValue: "Reject this request. A reason is required.",
                }),
                confirm: t("samples.requestStatusModal.buttons.confirmReject", {
                    defaultValue: "Reject request",
                }),
                nextLabel: "rejected",
            };

        case "return":
            return {
                title: t("samples.requestStatusModal.title.return", {
                    defaultValue: "Return request",
                }),
                subtitle: t("samples.requestStatusModal.subtitle.return", {
                    defaultValue: "Send this request back to the client for revision. A note is required.",
                }),
                confirm: t("samples.requestStatusModal.buttons.confirmReturn", {
                    defaultValue: "Return request",
                }),
                nextLabel: "returned",
            };

        default:
            return {
                title: t("samples.requestStatusModal.title.received", {
                    defaultValue: "Mark physically received",
                }),
                subtitle: t("samples.requestStatusModal.subtitle.received", {
                    defaultValue: "Confirm the sample has been physically received by the lab (admin desk).",
                }),
                confirm: t("samples.requestStatusModal.buttons.confirmReceived", {
                    defaultValue: "Mark received",
                }),
                nextLabel: "physically_received",
            };
    }
}

export const UpdateRequestStatusModal = ({
    open,
    sampleId,
    action,
    currentStatus,
    batchId,
    batchTotal,
    batchActiveTotal,
    defaultApplyToBatch,
    onClose,
    onUpdated,
}: Props) => {
    const { t, i18n } = useTranslation();
    const locale = i18n.language || "en";
    const requestId = sampleId;

    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testMethodName, setTestMethodName] = useState("");
    const [applyToBatch, setApplyToBatch] = useState(Boolean(defaultApplyToBatch));

    const isAccept = action === "accept";
    const isReject = action === "reject";
    const isReturn = action === "return";
    const isReceived = action === "received";
    const requiresMethod = isAccept;
    const requiresNote = isReject || isReturn;

    const copy = useMemo(() => getModalCopy(t, action), [t, action]);

    const activeBatchCount = Number(batchActiveTotal ?? batchTotal ?? 0);
    const hasBatch = Boolean(batchId) && activeBatchCount > 1;

    useEffect(() => {
        if (!open) return;

        setNote("");
        setError(null);
        setBusy(false);
        setTestMethodName("");
        setApplyToBatch(Boolean(defaultApplyToBatch));
    }, [open, action, requestId, defaultApplyToBatch]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) onClose();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, busy, onClose]);

    const canConfirm = useMemo(() => {
        if (!open || busy || !requestId) return false;
        if (requiresMethod) return testMethodName.trim().length > 0;
        if (requiresNote) return note.trim().length > 0;
        return true;
    }, [open, busy, requestId, requiresMethod, requiresNote, testMethodName, note]);

    const Icon = isReject || isReturn ? AlertTriangle : isReceived ? ClipboardCheck : Check;

    const iconTone = isReject
        ? "bg-rose-50 text-rose-700"
        : isReturn
            ? "bg-amber-50 text-amber-800"
            : "bg-emerald-50 text-emerald-700";

    const noteLabel = useMemo(() => {
        if (isReject) {
            return t("samples.requestStatusModal.note.labelRequiredReject", {
                defaultValue: "Rejection reason",
            });
        }

        if (isReturn) {
            return t("samples.requestStatusModal.note.labelRequiredReturn", {
                defaultValue: "Return note",
            });
        }

        return t("samples.requestStatusModal.note.labelOptional", {
            defaultValue: "Note",
        });
    }, [isReject, isReturn, t]);

    const notePlaceholder = useMemo(() => {
        if (isReject) {
            return t("samples.requestStatusModal.note.placeholderReject", {
                defaultValue: "Write the reason for rejection…",
            });
        }

        if (isReturn) {
            return t("samples.requestStatusModal.note.placeholderReturn", {
                defaultValue: "Explain what the client should revise…",
            });
        }

        return t("samples.requestStatusModal.note.placeholderReceived", {
            defaultValue: "Optional note…",
        });
    }, [isReject, isReturn, t]);

    const submit = async () => {
        if (!canConfirm || !requestId) return;

        try {
            setBusy(true);
            setError(null);

            const trimmedNote = note.trim();
            const noteToSend = requiresNote ? trimmedNote : trimmedNote || null;
            const methodToSend = requiresMethod ? testMethodName.trim() : null;

            await updateRequestStatus(requestId, action, noteToSend, methodToSend, applyToBatch);

            onClose();
            onUpdated();
        } catch (err) {
            setError(
                getErrMsg(
                    err,
                    t("samples.requestStatusModal.errors.updateFailed", {
                        defaultValue: "Failed to update request status.",
                    })
                )
            );
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    return (
        <div className="lims-modal-backdrop p-4" role="dialog" aria-modal="true" aria-label={copy.title}>
            <div className="lims-modal-panel max-w-xl">
                <div className="lims-modal-header">
                    <div
                        className={cx("flex h-9 w-9 items-center justify-center rounded-full", iconTone)}
                        aria-hidden="true"
                    >
                        <Icon size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{copy.title}</div>
                        <div className="mt-0.5 truncate text-xs text-gray-500">{copy.subtitle}</div>
                    </div>

                    <button
                        type="button"
                        className="lims-icon-button ml-auto"
                        aria-label={t("close", { defaultValue: "Close" })}
                        title={t("close", { defaultValue: "Close" })}
                        onClick={onClose}
                        disabled={busy}
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
                                {t("samples.requestStatusModal.summary.current", {
                                    defaultValue: "Current",
                                })}
                                :
                            </span>{" "}
                            <span className="font-semibold">{formatStatusLabel(currentStatus, locale)}</span>
                            <span className="text-gray-600">
                                {" "}
                                •{" "}
                                {t("samples.requestStatusModal.summary.next", {
                                    defaultValue: "Next",
                                })}
                                :
                            </span>{" "}
                            <span className="font-semibold">{formatStatusLabel(copy.nextLabel, locale)}</span>
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                            {t("samples.requestStatusModal.summary.requestId", {
                                defaultValue: "Request ID",
                            })}
                            : {requestId ?? "-"}
                        </div>
                    </div>

                    {hasBatch ? (
                        <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                            <label className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    className="mt-1"
                                    checked={applyToBatch}
                                    onChange={(e) => setApplyToBatch(e.target.checked)}
                                    disabled={busy}
                                />
                                <div>
                                    <div className="text-sm font-semibold text-sky-900">
                                        {t("samples.requestStatusModal.applyToBatch.title", {
                                            defaultValue: "Apply to institutional batch",
                                        })}
                                    </div>
                                    <div className="mt-1 text-xs text-sky-700">
                                        {t("samples.requestStatusModal.applyToBatch.subtitle", {
                                            defaultValue: "Apply this action to all active samples in the same request batch.",
                                        })}{" "}
                                        ({activeBatchCount})
                                    </div>
                                </div>
                            </label>
                        </div>
                    ) : null}

                    {isAccept ? (
                        <div className="mt-4">
                            <label className="block text-sm font-semibold text-gray-900">
                                {t("samples.requestStatusModal.method.labelRequired", {
                                    defaultValue: "Test method",
                                })}{" "}
                                <span className="text-rose-500">*</span>
                            </label>

                            <input
                                className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft"
                                value={testMethodName}
                                onChange={(e) => setTestMethodName(e.target.value)}
                                placeholder={t("samples.requestStatusModal.method.placeholderInput", {
                                    defaultValue: "Type test method…",
                                })}
                                disabled={busy}
                                maxLength={255}
                            />
                        </div>
                    ) : null}

                    {(isReject || isReturn || isReceived) ? (
                        <div className="mt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <label className="block text-sm font-semibold text-gray-900">
                                    {noteLabel}
                                    {requiresNote ? <span className="ml-1 text-rose-500">*</span> : null}
                                </label>
                                <div className="tabular-nums text-[11px] text-gray-500">{note.trim().length}/500</div>
                            </div>

                            <textarea
                                className="mt-2 min-h-[120px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft"
                                placeholder={notePlaceholder}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={busy}
                                maxLength={500}
                            />

                            {requiresNote ? (
                                <div className="mt-2 text-[11px] text-gray-500">
                                    {t("samples.requestStatusModal.note.helpRequired", {
                                        defaultValue: "This note will be saved for audit and shown to relevant users.",
                                    })}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="mt-5 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className="btn-outline disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {t("cancel", { defaultValue: "Cancel" })}
                        </button>

                        <button
                            type="button"
                            disabled={!canConfirm}
                            onClick={submit}
                            className={cx(
                                isReject || isReturn ? "lims-btn-danger" : "lims-btn-primary",
                                "disabled:cursor-not-allowed disabled:opacity-50"
                            )}
                            title={copy.confirm}
                        >
                            {busy ? t("processing", { defaultValue: "Processing…" }) : copy.confirm}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};