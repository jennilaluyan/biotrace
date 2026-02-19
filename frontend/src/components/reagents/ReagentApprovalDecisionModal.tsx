import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ClipboardCheck, X } from "lucide-react";
import type { ReagentRequestRow } from "../../services/reagentRequests";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "approve" | "reject";
    busy?: boolean;

    request: ReagentRequestRow | null;
    looNumber?: string | null;
    clientName?: string | null;
    itemsCount?: number;
    bookingsCount?: number;

    onClose: () => void;
    onConfirm: (rejectNote?: string) => void;
};

export default function ReagentApprovalDecisionModal(props: Props) {
    const { t } = useTranslation();

    const { open, mode, busy, request, looNumber, clientName, itemsCount, bookingsCount, onClose, onConfirm } = props;

    const [note, setNote] = useState("");

    const isReject = mode === "reject";

    useEffect(() => {
        if (!open) return;
        setNote("");
    }, [open, mode]);

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

    const title = isReject ? t("reagents.approval.rejectTitle") : t("reagents.approval.approveTitle");
    const subtitle = useMemo(() => {
        const parts: string[] = [];
        if (looNumber) parts.push(looNumber);
        if (clientName) parts.push(clientName);
        return parts.join(" • ");
    }, [looNumber, clientName]);

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!request?.reagent_request_id) return false;
        if (isReject) return note.trim().length >= 3;
        return true;
    }, [open, busy, request, isReject, note]);

    if (!open) return null;

    return (
        <div className="lims-modal-backdrop p-4" role="dialog" aria-modal="true" aria-label={title}>
            <div className="lims-modal-panel max-w-xl">
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
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                            {subtitle || t("reagents.approval.subtitleFallback")}
                        </div>
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
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <ClipboardCheck size={14} />
                            <span className="font-semibold">{t("summary")}</span>
                        </div>

                        <div className="mt-2 text-sm text-gray-900">
                            <span className="text-gray-600">{t("reagents.approval.summaryStatus")}:</span>{" "}
                            <span className="font-semibold">{String(request?.status ?? "-")}</span>

                            {typeof itemsCount === "number" ? (
                                <span className="text-gray-600">
                                    {" "}
                                    • {t("reagents.approval.summaryItems")}: <span className="font-semibold">{itemsCount}</span>
                                </span>
                            ) : null}

                            {typeof bookingsCount === "number" ? (
                                <span className="text-gray-600">
                                    {" "}
                                    • {t("reagents.approval.summaryBookings")}: <span className="font-semibold">{bookingsCount}</span>
                                </span>
                            ) : null}
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                            {t("reagents.approval.summaryRequestId")}: {request?.reagent_request_id ?? "-"} •{" "}
                            {t("reagents.approval.summaryLoId")}: {request?.lo_id ?? "-"} •{" "}
                            {t("reagents.approval.summaryCycle")}: {request?.cycle_no ?? "-"}
                        </div>
                    </div>

                    {isReject ? (
                        <div className="mt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <label className="block text-sm font-semibold text-gray-900">
                                    {t("reagents.approval.rejectNoteRequired")}
                                </label>
                                <div className="text-[11px] text-gray-500 tabular-nums">{note.trim().length}/500</div>
                            </div>

                            <textarea
                                className="mt-2 w-full min-h-[120px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={t("reagents.approval.rejectNotePlaceholder")}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={!!busy}
                                maxLength={500}
                            />

                            <div className="mt-2 text-[11px] text-gray-500">{t("reagents.approval.rejectNoteHelp")}</div>
                        </div>
                    ) : (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            {t("reagents.approval.approveHint")}
                        </div>
                    )}
                </div>

                <div className="lims-modal-footer">
                    <button type="button" onClick={onClose} disabled={!!busy} className="btn-outline disabled:opacity-50">
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={() => onConfirm(isReject ? note.trim() : undefined)}
                        className={cx(
                            isReject ? "lims-btn-danger" : "lims-btn-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        title={isReject ? t("reject") : t("approve")}
                    >
                        {busy ? t("processing") : isReject ? t("reject") : t("approve")}
                    </button>
                </div>
            </div>
        </div>
    );
}
