import { AlertTriangle, Check, X } from "lucide-react";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "approve" | "reject";
    title: string;
    subtitle?: string | null;

    submitting?: boolean;
    error?: string | null;

    rejectReason: string;
    onRejectReasonChange: (v: string) => void;

    approveHint?: string | null;

    onClose: () => void;
    onConfirm: () => void;
};

export function QualityCoverDecisionModal(props: Props) {
    const {
        open,
        mode,
        title,
        subtitle,
        submitting = false,
        error,
        rejectReason,
        onRejectReasonChange,
        approveHint,
        onClose,
        onConfirm,
    } = props;

    if (!open) return null;

    const isReject = mode === "reject";

    return (
        <div className="lims-modal-backdrop p-4">
            <div className="lims-modal-panel">
                <div className="lims-modal-header">
                    <div
                        className={cx(
                            "h-9 w-9 rounded-full flex items-center justify-center",
                            isReject ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                        )}
                    >
                        {isReject ? <AlertTriangle size={18} /> : <Check size={18} />}
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{title}</div>
                        {subtitle ? <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div> : null}
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button"
                        aria-label="Close"
                        title="Close"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="lims-modal-body">
                    {isReject ? (
                        <div>
                            <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase mb-2">
                                Reject reason (required)
                            </div>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => onRejectReasonChange(e.target.value)}
                                className="min-h-[110px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder="Explain why this cover is rejected..."
                                disabled={submitting}
                            />
                        </div>
                    ) : (
                        <div className="text-sm text-gray-700">
                            {approveHint ?? "This will continue the workflow to the next step."}
                        </div>
                    )}

                    {error ? (
                        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                            {error}
                        </div>
                    ) : null}
                </div>

                <div className="lims-modal-footer">
                    <button type="button" onClick={onClose} disabled={submitting} className="btn-outline disabled:opacity-50">
                        Cancel
                    </button>

                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={submitting}
                        className={cx(
                            isReject ? "lims-btn-danger" : "lims-btn-primary",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                        title={isReject ? "Reject" : "Confirm"}
                    >
                        {submitting ? "Submitting..." : isReject ? "Reject" : "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
}
