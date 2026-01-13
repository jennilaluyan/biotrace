import React from "react";

type Props = {
    reportId: number | null;
    open: boolean;
    onClose: () => void;
};

export const ReportPreviewModal: React.FC<Props> = ({
    reportId,
    open,
    onClose,
}) => {
    if (!open || !reportId) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white w-[90vw] h-[90vh] rounded-xl shadow-lg flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="text-sm font-semibold text-gray-800">
                        Report Preview
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 bg-gray-100">
                    <iframe
                        title="Report PDF Preview"
                        src={`/api/v1/reports/${reportId}/pdf`}
                        className="w-full h-full border-0"
                    />
                </div>
            </div>
        </div>
    );
};
