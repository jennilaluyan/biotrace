import { AlertTriangle, Trash2, X } from "lucide-react";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    loading?: boolean;
    onClose: () => void;
    onConfirm: () => void;
};

export const DeleteConfirmModal = ({
    open,
    title = "Hapus item",
    message = "Aksi ini tidak bisa dibatalkan. Yakin mau lanjut?",
    confirmText = "Hapus",
    loading,
    onClose,
    onConfirm,
}: Props) => {
    if (!open) return null;

    const busy = !!loading;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} aria-hidden="true" />

            <div
                className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex items-start gap-3">
                        <div className="h-9 w-9 rounded-full flex items-center justify-center bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertTriangle size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-gray-900">{title}</div>
                            <div className="text-sm text-gray-600 mt-1">{message}</div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className={cx("lims-icon-button", busy && "opacity-60 cursor-not-allowed")}
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Tutup"
                        title="Tutup"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="px-6 py-5 flex items-center justify-end gap-2 bg-white">
                    <button
                        className={cx("btn-outline", busy && "opacity-60 cursor-not-allowed")}
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Batal
                    </button>

                    <button
                        className={cx("lims-btn-danger inline-flex items-center gap-2", busy && "opacity-60 cursor-not-allowed")}
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        title="Hapus permanen"
                    >
                        <Trash2 size={16} />
                        {busy ? "Menghapus..." : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
