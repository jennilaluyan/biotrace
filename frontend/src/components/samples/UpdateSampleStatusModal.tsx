// src/components/samples/UpdateSampleStatusModal.tsx
import { useEffect, useMemo, useState } from "react";
import type { Sample, SampleStatus } from "../../services/samples";
import { sampleService } from "../../services/samples";
import {
    getAllowedSampleStatusTargets,
    sampleStatusLabel,
} from "../../utils/sampleTransitions";

type Props = {
    open: boolean;
    onClose: () => void;
    sample: Sample | null;
    roleId: number; // dari getUserRoleId(user)
    onUpdated?: () => void;
};

export const UpdateSampleStatusModal = ({ open, onClose, sample, roleId, onUpdated }: Props) => {
    const [targetStatus, setTargetStatus] = useState<SampleStatus | "">("");
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [uiError, setUiError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setTargetStatus("");
        setNote("");
        setSubmitting(false);
        setUiError(null);
    }, [open, sample?.sample_id]);

    const allowedTargets = useMemo(() => {
        return getAllowedSampleStatusTargets(roleId, sample?.current_status);
    }, [roleId, sample?.current_status]);

    const canSubmit = open && !!sample && allowedTargets.length > 0 && !!targetStatus && !submitting;

    const currentLabel = sample?.current_status ? sampleStatusLabel(sample.current_status) : "-";

    const submit = async () => {
        if (!sample) return;
        if (!targetStatus) return;

        try {
            setSubmitting(true);
            setUiError(null);

            await sampleService.updateStatus(sample.sample_id, {
                target_status: targetStatus,
                note: note?.trim() ? note.trim() : null,
            });

            onUpdated?.();
            onClose();
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Failed to update sample status.";
            setUiError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (!open || !sample) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />

            {/* modal */}
            <div className="relative w-[92vw] max-w-[680px] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
                    <div>
                        <div className="text-lg font-semibold text-gray-900">
                            Update Sample Status
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                            Sample #{sample.sample_id} • Current: <span className="font-medium">{currentLabel}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div className="px-6 py-5">
                    {/* role gating info */}
                    {allowedTargets.length === 0 && (
                        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            No allowed status transitions for your role from <b>{currentLabel}</b>.
                        </div>
                    )}

                    {uiError && (
                        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {uiError}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-2">
                                Target status
                            </label>
                            <select
                                value={targetStatus}
                                onChange={(e) => setTargetStatus(e.target.value as any)}
                                disabled={allowedTargets.length === 0 || submitting}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50"
                            >
                                <option value="">Select target status...</option>
                                {allowedTargets.map((s) => (
                                    <option key={s} value={s}>
                                        {sampleStatusLabel(s)}
                                    </option>
                                ))}
                            </select>

                            {allowedTargets.length > 0 && (
                                <div className="mt-2 text-xs text-gray-500">
                                    Allowed:{" "}
                                    <span className="font-medium">
                                        {allowedTargets.map(sampleStatusLabel).join(", ")}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-2">
                                Note (optional)
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={500}
                                disabled={submitting}
                                className="w-full min-h-[96px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50"
                                placeholder="Reason / note for this change..."
                            />
                            <div className="mt-1 text-xs text-gray-400">{note.length}/500</div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        className="px-5 py-2 rounded-full border text-sm hover:bg-gray-50"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {submitting ? "Updating..." : "Update Status"}
                    </button>
                </div>
            </div>
        </div>
    );
};
