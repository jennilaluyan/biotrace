// frontend/src/components/qa/DeleteConfirmModal.tsx
import React from "react";

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
    title = "Delete item",
    message = "Are you sure? This action cannot be undone.",
    confirmText = "Delete",
    loading,
    onClose,
    onConfirm,
}: Props) => {
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-80 bg-black/30 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100">
                <div className="px-6 py-5 border-b border-gray-100">
                    <div className="text-lg font-bold text-gray-900">{title}</div>
                    <div className="text-sm text-gray-600 mt-1">{message}</div>
                </div>

                <div className="px-6 py-5 flex items-center justify-end gap-2">
                    <button className="lims-btn" type="button" onClick={onClose} disabled={loading}>
                        Cancel
                    </button>
                    <button
                        className={cx("lims-btn-primary", loading ? "opacity-60 cursor-not-allowed" : "")}
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? "Deleting..." : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};
