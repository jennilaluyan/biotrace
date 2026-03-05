import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ClipboardCheck, X, Loader2 } from "lucide-react";

import type { PendingStaff } from "../../services/staffs";
import { getRoleLabelById } from "../../utils/roles";
import { formatDate } from "../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "approve" | "reject";
    staff: PendingStaff | null;

    busy?: boolean;
    error?: string | null;

    onClose: () => void;
    onConfirm: (rejectNote?: string) => void | Promise<void>;
};

export default function StaffApprovalDecisionModal(props: Props) {
    const { t, i18n } = useTranslation();
    const { open, mode, staff, busy, error, onClose, onConfirm } = props;

    const [note, setNote] = useState("");

    const isReject = mode === "reject";
    const staffId = staff?.staff_id ?? null;

    useEffect(() => {
        if (!open) return;
        setNote("");
    }, [open, mode, staffId]);

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
            ? t("staffApprovals.modal.rejectTitle", { defaultValue: "Reject Staff Registration" })
            : t("staffApprovals.modal.approveTitle", { defaultValue: "Approve Staff Registration" });
    }, [isReject, t]);

    const subtitle = useMemo(() => {
        return isReject
            ? t("staffApprovals.modal.rejectSubtitle", { defaultValue: "Provide a short reason to help the staff improve their submission." })
            : t("staffApprovals.modal.approveSubtitle", { defaultValue: "Approve this staff account to grant access to the system." });
    }, [isReject, t]);

    const confirmLabel = useMemo(() => {
        return isReject ? t("common.reject", { defaultValue: "Reject" }) : t("common.approve", { defaultValue: "Approve" });
    }, [isReject, t]);

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!staffId) return false;

        // Reject: note wajib (lebih aman untuk audit & komunikasi)
        if (isReject) return note.trim().length >= 1;

        // Approve: tanpa note
        return true;
    }, [open, busy, staffId, isReject, note]);

    const Icon = isReject ? AlertTriangle : Check;
    const iconTone = isReject ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700";

    const roleName = useMemo(() => {
        const name = staff?.role?.name || (staff?.role_id ? getRoleLabelById(staff.role_id) : null);
        return name || "—";
    }, [staff]);

    const requestedAt = useMemo(() => {
        const iso = staff?.created_at ?? null;
        if (!iso) return "—";
        return formatDate(iso);
    }, [staff]);

    const noteLabel = useMemo(() => {
        return t("staffApprovals.modal.note.labelRequired", { defaultValue: "Reject note (required)" });
    }, [t]);

    const notePlaceholder = useMemo(() => {
        return t("staffApprovals.modal.note.placeholder", {
            defaultValue: "Explain briefly what needs to be fixed (e.g., missing data, wrong role, invalid email).",
        });
    }, [t]);

    const submit = async () => {
        if (!canConfirm) return;

        if (isReject) {
            await onConfirm(note.trim());
            return;
        }

        await onConfirm();
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

                        <div className="mt-2">
                            <div className="text-sm font-semibold text-gray-900 truncate">{staff?.name ?? "—"}</div>
                            <div className="text-xs text-gray-600 truncate">{staff?.email ?? "—"}</div>

                            <div className="mt-2 text-xs text-gray-600">
                                <span className="text-gray-500">{t("staffApprovals.table.role", { defaultValue: "Role" })}:</span>{" "}
                                <span className="font-semibold text-gray-900">{roleName}</span>

                                <span className="text-gray-500"> • </span>

                                <span className="text-gray-500">
                                    {t("staffApprovals.table.requestedAt", { defaultValue: "Requested at" })}:
                                </span>{" "}
                                <span className="font-semibold text-gray-900">{requestedAt}</span>
                            </div>

                            <div className="mt-1 text-[11px] text-gray-500">
                                {t("staffApprovals.modal.staffId", { defaultValue: "Staff ID" })}: {staffId ?? "—"}
                            </div>
                        </div>
                    </div>

                    {isReject ? (
                        <div className="mt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <label className="block text-sm font-semibold text-gray-900">{noteLabel}</label>
                                <div className="text-[11px] text-gray-500 tabular-nums">{note.trim().length}/300</div>
                            </div>

                            <textarea
                                className="mt-2 w-full min-h-[120px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={notePlaceholder}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={!!busy}
                                maxLength={300}
                            />

                            <div className="mt-2 text-[11px] text-gray-500">
                                {t("staffApprovals.modal.note.help", { defaultValue: "This note will be saved and can be shown to the staff." })}
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="lims-modal-footer">
                    <button type="button" onClick={onClose} disabled={!!busy} className="btn-outline disabled:opacity-50">
                        {t("cancel", { defaultValue: "Cancel" })}
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={submit}
                        className={cx(
                            isReject ? "lims-btn-danger" : "lims-btn-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                        )}
                        title={confirmLabel}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {busy ? t("common.processing", { defaultValue: "Processing..." }) : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}