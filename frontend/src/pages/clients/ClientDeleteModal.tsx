// src/components/clients/ClientDeleteModal.tsx
interface ClientDeleteModalProps {
    open: boolean;
    loading?: boolean;
    clientName?: string;
    onCancel: () => void;
    onConfirm: () => void;
}

export const ClientDeleteModal = ({
    open,
    loading = false,
    clientName = "",
    onCancel,
    onConfirm,
}: ClientDeleteModalProps) => {
    if (!open) return null;

    return (
        <div className="lims-modal-backdrop">
            <div className="lims-modal-panel">
                {/* Header */}
                <div className="lims-modal-header">
                    <div className="h-9 w-9 flex items-center justify-center rounded-full bg-red-50 text-red-600">
                        <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M12 9v4" />
                            <path d="M12 17h.01" />
                            <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">
                            Delete client?
                        </h2>
                        <p className="text-xs text-gray-500">
                            This action will remove the client from the active list.
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="lims-modal-body">
                    <p>
                        You are about to remove{" "}
                        <span className="font-semibold">{clientName}</span> from
                        the active client registry.
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                        This is a <span className="font-semibold">soft delete</span>.
                        Historical samples, reports, and audit logs linked to this
                        client will remain stored to preserve ISO/IEC 17025 traceability.
                    </p>
                </div>

                {/* Footer */}
                <div className="lims-modal-footer">
                    <button
                        type="button"
                        className="btn-outline"
                        onClick={onCancel}
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="lims-btn-danger"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? "Deleting..." : "Delete client"}
                    </button>
                </div>
            </div>
        </div>
    );
};
