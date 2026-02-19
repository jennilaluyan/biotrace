import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();

    if (!open) return null;

    return (
        <div className="lims-modal-backdrop">
            <div className="lims-modal-panel max-w-md">
                {/* Header */}
                <div className="lims-modal-header bg-red-50/50">
                    <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-100 text-red-600 shrink-0">
                        <AlertTriangle className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-bold text-gray-900">{t("clients.deleteModal.title", "Delete client?")}</h2>
                        <p className="text-xs text-gray-500">
                            {t("clients.deleteModal.subtitle", "This removes the client from the active list.")}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="lims-icon-button text-gray-500 hover:bg-gray-100"
                        onClick={onCancel}
                        aria-label={t("close", "Close")}
                        disabled={loading}
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="lims-modal-body">
                    <p className="text-sm text-gray-700 leading-relaxed">
                        {t("clients.deleteModal.body", "You are about to remove {{name}} from the active client registry.", { name: clientName })}
                    </p>

                    <div className="mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 leading-relaxed">
                        <span className="font-bold block mb-1">Notice:</span>
                        {t("clients.deleteModal.softDeleteNote", "This is a soft delete. Historical records linked to this client will remain stored.")}
                    </div>
                </div>

                {/* Footer */}
                <div className="lims-modal-footer bg-gray-50">
                    <button type="button" className="btn-outline border-gray-300 text-gray-700" onClick={onCancel} disabled={loading}>
                        {t("cancel", "Cancel")}
                    </button>

                    <button
                        type="button"
                        className="lims-btn-danger inline-flex items-center gap-2 shadow-sm"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                        {loading ? t("clients.deleteModal.deleting", "Deleting…") : t("clients.deleteModal.confirm", "Delete client")}
                    </button>
                </div>
            </div>
        </div>
    );
};