import { useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ClipboardCheck, X } from "lucide-react";

import type { ClientApplication } from "../../services/clientApprovals";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "approve" | "reject";
    item: ClientApplication | null;

    busy?: boolean;
    error?: string | null;

    onClose: () => void;
    onConfirm: () => void | Promise<void>;
};

function typeLabel(t: ClientApplication["type"] | null | undefined) {
    return t === "institution" ? "Institution" : "Individual";
}

export default function ClientApprovalDecisionModal(props: Props) {
    const { t } = useTranslation();
    const { open, mode, item, busy, error, onClose, onConfirm } = props;

    const isReject = mode === "reject";
    const Icon = isReject ? AlertTriangle : Check;
    const iconTone = isReject ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700";

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

    const title = useMemo(() => {
        return isReject
            ? t("clients.approvals.modal.rejectTitle", "Reject client application?")
            : t("clients.approvals.modal.approveTitle", "Approve client application?");
    }, [isReject, t]);

    const subtitle = useMemo(() => {
        return isReject
            ? t("clients.approvals.modal.rejectSubtitle", "This will reject the application. No rejection note will be saved.")
            : t("clients.approvals.modal.approveSubtitle", "This will create an active client account and enable log in.");
    }, [isReject, t]);

    const confirmLabel = useMemo(() => {
        return isReject ? t("common.reject", "Reject") : t("common.approve", "Approve");
    }, [isReject, t]);

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!item?.client_application_id) return false;
        return true;
    }, [open, busy, item]);

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
                        aria-label={t("close", "Close")}
                        title={t("close", "Close")}
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
                            <span className="font-semibold">{t("summary", "Summary")}</span>
                        </div>

                        <div className="mt-2">
                            <div className="text-sm font-semibold text-gray-900 truncate">{item?.name ?? "—"}</div>
                            <div className="text-xs text-gray-600 break-all">{item?.email ?? "—"}</div>

                            <div className="mt-2 text-xs text-gray-600">
                                <span className="text-gray-500">{t("clients.approvals.table.type", "Type")}:</span>{" "}
                                <span className="font-semibold text-gray-900">{typeLabel(item?.type)}</span>

                                <span className="text-gray-500"> • </span>

                                <span className="text-gray-500">{t("clients.approvals.modal.applicationId", "Application ID")}:</span>{" "}
                                <span className="font-semibold text-gray-900">#{item?.client_application_id ?? "—"}</span>
                            </div>

                            {item?.type === "institution" ? (
                                <div className="mt-1 text-[11px] text-gray-500 truncate">
                                    {t("clients.approvals.modal.institution", "Institution")}: {item?.institution_name || "—"}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                <div className="lims-modal-footer">
                    <button type="button" onClick={onClose} disabled={!!busy} className="btn-outline disabled:opacity-50">
                        {t("cancel", "Cancel")}
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={onConfirm}
                        className={cx(
                            isReject ? "lims-btn-danger" : "lims-btn-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        title={confirmLabel}
                    >
                        {busy ? t("common.processing", "Processing...") : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}