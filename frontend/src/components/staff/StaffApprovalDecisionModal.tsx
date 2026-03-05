import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ClipboardCheck, Loader2, X } from "lucide-react";

import type { PendingStaff } from "../../services/staffApprovals";
import { getRoleLabelById } from "../../utils/roles";
import { formatDate } from "../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

const NOTE_MAX = 300;

type Props = {
    open: boolean;
    mode: "approve" | "reject";
    staff: PendingStaff | null;

    submitting?: boolean;
    error?: string | null;

    onClose: () => void;
    onConfirm: (note?: string) => void | Promise<void>;
};

export default function StaffApprovalDecisionModal(props: Props) {
    const { t } = useTranslation();
    const { open, mode, staff, submitting, error, onClose, onConfirm } = props;

    const busy = !!submitting;
    const isReject = mode === "reject";
    const staffId = staff?.staff_id ?? null;

    const [note, setNote] = useState("");
    const noteRef = useRef<HTMLTextAreaElement | null>(null);

    // reset note setiap modal dibuka / ganti mode / ganti staff
    useEffect(() => {
        if (!open) return;
        setNote("");
    }, [open, mode, staffId]);

    // focus ke textarea saat reject
    useEffect(() => {
        if (!open) return;
        if (!isReject) return;
        // next tick biar elemen sudah render
        const id = window.setTimeout(() => noteRef.current?.focus(), 0);
        return () => window.clearTimeout(id);
    }, [open, isReject]);

    // ESC to close (kalau tidak sedang submit)
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) onClose();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, busy, onClose]);

    const title = useMemo(() => {
        return isReject
            ? t("staffApprovals.modal.rejectTitle", { defaultValue: "Tolak pendaftaran staf" })
            : t("staffApprovals.modal.approveTitle", { defaultValue: "Setujui pendaftaran staf" });
    }, [isReject, t]);

    const subtitle = useMemo(() => {
        return isReject
            ? t("staffApprovals.modal.rejectSubtitle", {
                defaultValue: "Tulis alasan singkat agar staf paham apa yang perlu diperbaiki.",
            })
            : t("staffApprovals.modal.approveSubtitle", {
                defaultValue: "Setujui akun staf ini untuk memberi akses ke sistem.",
            });
    }, [isReject, t]);

    const confirmLabel = useMemo(() => {
        return isReject
            ? t("common.reject", { defaultValue: "Tolak" })
            : t("common.approve", { defaultValue: "Setujui" });
    }, [isReject, t]);

    const roleName = useMemo(() => {
        const rid = staff?.role_id;
        if (rid === null || rid === undefined) return "—";
        const label = getRoleLabelById(Number(rid));
        return label || String(rid);
    }, [staff?.role_id]);

    const requestedAt = useMemo(() => {
        const iso = staff?.created_at ?? null;
        if (!iso) return "—";
        return formatDate(iso);
    }, [staff?.created_at]);

    const noteLabel = useMemo(() => {
        return t("staffApprovals.modal.note.labelRequired", {
            defaultValue: "Catatan penolakan (wajib)",
        });
    }, [t]);

    const notePlaceholder = useMemo(() => {
        return t("staffApprovals.modal.note.placeholder", {
            defaultValue:
                "Contoh: data belum lengkap, peran tidak sesuai, email tidak valid, dsb.",
        });
    }, [t]);

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!staffId) return false;

        if (isReject) return note.trim().length >= 1;
        return true;
    }, [open, busy, staffId, isReject, note]);

    const Icon = isReject ? AlertTriangle : Check;
    const iconTone = isReject
        ? "bg-rose-50 text-rose-700"
        : "bg-emerald-50 text-emerald-700";

    const submit = async () => {
        if (!canConfirm) return;

        if (isReject) return onConfirm(note.trim());
        return onConfirm();
    };

    if (!open) return null;

    return (
        <div
            className="lims-modal-backdrop p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={(e) => {
                // klik backdrop untuk close (tapi jangan pas submit)
                if (e.target === e.currentTarget && !busy) onClose();
            }}
        >
            <div className="lims-modal-panel max-w-xl" onMouseDown={(e) => e.stopPropagation()}>
                <div className="lims-modal-header">
                    <div
                        className={cx("h-9 w-9 rounded-full flex items-center justify-center", iconTone)}
                        aria-hidden="true"
                    >
                        <Icon size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{title}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</div>
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button"
                        aria-label={t("close", { defaultValue: "Tutup" })}
                        title={t("close", { defaultValue: "Tutup" })}
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
                            <span className="font-semibold">
                                {t("summary", { defaultValue: "Ringkasan" })}
                            </span>
                        </div>

                        <div className="mt-2">
                            <div className="text-sm font-semibold text-gray-900 truncate">
                                {staff?.name ?? "—"}
                            </div>
                            <div className="text-xs text-gray-600 truncate">
                                {staff?.email ?? "—"}
                            </div>

                            <div className="mt-2 text-xs text-gray-600">
                                <span className="text-gray-500">
                                    {t("staffApprovals.table.role", { defaultValue: "Peran" })}:
                                </span>{" "}
                                <span className="font-semibold text-gray-900">{roleName}</span>

                                <span className="text-gray-500"> • </span>

                                <span className="text-gray-500">
                                    {t("staffApprovals.table.requestedAt", { defaultValue: "Diajukan" })}:
                                </span>{" "}
                                <span className="font-semibold text-gray-900">{requestedAt}</span>
                            </div>

                            <div className="mt-1 text-[11px] text-gray-500">
                                {t("staffApprovals.modal.staffId", { defaultValue: "ID Staf" })}:{" "}
                                {staffId ?? "—"}
                            </div>
                        </div>
                    </div>

                    {isReject ? (
                        <div className="mt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <label className="block text-sm font-semibold text-gray-900">
                                    {noteLabel}
                                </label>
                                <div className="text-[11px] text-gray-500 tabular-nums">
                                    {note.trim().length}/{NOTE_MAX}
                                </div>
                            </div>

                            <textarea
                                ref={noteRef}
                                className="mt-2 w-full min-h-[120px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={notePlaceholder}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={busy}
                                maxLength={NOTE_MAX}
                            />

                            <div className="mt-2 text-[11px] text-gray-500">
                                {t("staffApprovals.modal.note.help", {
                                    defaultValue:
                                        "Catatan ini akan tersimpan dan bisa ditampilkan ke staf yang mengajukan.",
                                })}
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="lims-modal-footer">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="btn-outline disabled:opacity-50"
                    >
                        {t("cancel", { defaultValue: "Batal" })}
                    </button>

                    <button
                        type="button"
                        disabled={!canConfirm}
                        onClick={submit}
                        className={cx(
                            isReject ? "lims-btn-danger" : "lims-btn-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2",
                        )}
                        title={confirmLabel}
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {busy
                            ? t("common.processing", { defaultValue: "Memproses…" })
                            : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}