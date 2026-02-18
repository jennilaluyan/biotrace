import { AlertTriangle, RefreshCw, X } from "lucide-react";

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
                        <AlertTriangle className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                        <h2 className="text-base font-semibold text-gray-900">Remove client?</h2>
                        <p className="text-xs text-gray-500">
                            This hides the client from the active list. Linked records stay intact.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button text-gray-600"
                        onClick={onCancel}
                        aria-label="Close modal"
                        disabled={loading}
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="lims-modal-body">
                    <p className="text-sm text-gray-800">
                        You are about to remove <span className="font-semibold text-gray-900">{clientName}</span> from the
                        active client registry.
                    </p>

                    <div className="mt-3 text-xs text-gray-600 leading-relaxed bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <span className="font-semibold text-gray-900">Note:</span> this is a <span className="font-semibold">soft delete</span>.
                        Historical samples, reports, and audit logs linked to this client will remain stored to preserve
                        ISO/IEC 17025 traceability.
                    </div>
                </div>

                {/* Footer */}
                <div className="lims-modal-footer">
                    <button type="button" className="btn-outline" onClick={onCancel} disabled={loading}>
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="lims-btn-danger inline-flex items-center gap-2"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Removing…
                            </>
                        ) : (
                            "Remove client"
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
