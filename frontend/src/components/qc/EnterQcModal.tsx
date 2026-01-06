// frontend/src/components/qc/EnterQcModal.tsx
import { useEffect, useMemo, useState } from "react";
import { createQcRun, listQcControls, type QcControl } from "../../services/qc";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    sampleId: number;
    onClose: () => void;
    /** dipanggil setelah submit sukses (biasanya untuk refresh qc summary di parent) */
    onSubmitted?: () => void | Promise<void>;
};

export function EnterQcModal({ open, sampleId, onClose, onSubmitted }: Props) {
    const [qcControls, setQcControls] = useState<QcControl[]>([]);
    const [qcControlsLoading, setQcControlsLoading] = useState(false);
    const [qcControlsError, setQcControlsError] = useState<string | null>(null);

    const [qcControlId, setQcControlId] = useState<number | "">("");
    const [qcValue, setQcValue] = useState<string>("");
    const [qcNote, setQcNote] = useState<string>("");

    const [qcSubmitting, setQcSubmitting] = useState(false);
    const [qcSubmitError, setQcSubmitError] = useState<string | null>(null);

    const isValidSampleId = useMemo(() => {
        return !!sampleId && Number.isFinite(sampleId) && !Number.isNaN(sampleId);
    }, [sampleId]);

    const resetForm = () => {
        setQcControlId("");
        setQcValue("");
        setQcNote("");
        setQcSubmitError(null);
    };

    const close = () => {
        resetForm();
        onClose();
    };

    const loadControls = async () => {
        if (!isValidSampleId) return;

        try {
            setQcControlsLoading(true);
            setQcControlsError(null);

            // ✅ fixed: listQcControls memang menerima optional sampleId
            const items = await listQcControls(sampleId);
            setQcControls(items);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to load QC controls.";
            setQcControlsError(msg);
            setQcControls([]);
        } finally {
            setQcControlsLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;

        // saat modal dibuka: bersihkan error submit, lalu pastikan controls ter-load
        setQcSubmitError(null);

        // load sekali per open kalau controls belum ada
        if (qcControls.length === 0 && !qcControlsLoading) {
            loadControls();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sampleId]);

    // kalau sampleId berubah (navigasi ke sample lain), reset controls & form
    useEffect(() => {
        setQcControls([]);
        setQcControlsError(null);
        resetForm();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId]);

    const submitQc = async () => {
        if (!isValidSampleId) {
            setQcSubmitError("Invalid sample.");
            return;
        }

        if (!qcControlId) {
            setQcSubmitError("Please select QC control.");
            return;
        }

        const v = Number(String(qcValue).trim());
        if (!Number.isFinite(v)) {
            setQcSubmitError("Please input numeric value.");
            return;
        }

        try {
            setQcSubmitting(true);
            setQcSubmitError(null);

            await createQcRun(sampleId, {
                qc_control_id: Number(qcControlId),
                value: v,
                // ✅ fixed: jangan kirim null (lebih aman undefined)
                ...(qcNote?.trim() ? { note: qcNote.trim() } : {}),
            });

            await onSubmitted?.();
            close();
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to submit QC.";
            setQcSubmitError(msg);
        } finally {
            setQcSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-80 bg-black/40 flex items-center justify-center px-3">
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div>
                        <div className="text-base font-bold text-gray-900">Enter QC</div>
                        <div className="text-xs text-gray-500 mt-1">
                            Select QC control, input numeric value, then submit.
                        </div>
                    </div>
                    <button className="lims-btn" onClick={close} type="button">
                        Close
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {!isValidSampleId && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                            Invalid sample. Please refresh the page.
                        </div>
                    )}

                    {qcControlsError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                            {qcControlsError}
                        </div>
                    )}

                    {qcSubmitError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                            {qcSubmitError}
                        </div>
                    )}

                    <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1">
                            QC Control
                        </div>
                        <select
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            value={qcControlId}
                            onChange={(e) => {
                                const v = e.target.value;
                                setQcControlId(v ? Number(v) : "");
                            }}
                            disabled={!isValidSampleId || qcControlsLoading}
                        >
                            <option value="">
                                {qcControlsLoading ? "Loading..." : "Select QC control..."}
                            </option>
                            {qcControls.map((c) => (
                                <option key={c.qc_control_id} value={c.qc_control_id}>
                                    {c.name ?? c.code ?? `QC #${c.qc_control_id}`}
                                </option>
                            ))}
                        </select>

                        <div className="mt-1 flex items-center justify-between gap-3">
                            {qcControlsLoading ? (
                                <div className="text-xs text-gray-500">Loading QC controls...</div>
                            ) : (
                                <div className="text-xs text-gray-400">
                                    {qcControls.length > 0
                                        ? `${qcControls.length} control(s) available`
                                        : "No controls available."}
                                </div>
                            )}

                            <button
                                type="button"
                                className={cx(
                                    "lims-btn",
                                    "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap",
                                    qcControlsLoading ? "opacity-60 cursor-not-allowed" : ""
                                )}
                                disabled={!isValidSampleId || qcControlsLoading}
                                onClick={loadControls}
                                title="Reload QC controls"
                            >
                                Reload
                            </button>
                        </div>
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1">
                            Value (numeric)
                        </div>
                        <input
                            type="number"
                            step="any"
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            value={qcValue}
                            onChange={(e) => setQcValue(e.target.value)}
                            placeholder="e.g. 15.0"
                            disabled={!isValidSampleId}
                        />
                    </div>

                    <div>
                        <div className="text-xs font-semibold text-gray-600 mb-1">
                            Note (optional)
                        </div>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                            value={qcNote}
                            onChange={(e) => setQcNote(e.target.value)}
                            placeholder="e.g. rerun recommended"
                            disabled={!isValidSampleId}
                        />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button
                        className="lims-btn"
                        type="button"
                        onClick={close}
                        disabled={qcSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        className={cx(
                            "lims-btn-primary px-4 py-2 text-sm rounded-xl",
                            (qcSubmitting ||
                                !qcControlId ||
                                String(qcValue).trim() === "" ||
                                !isValidSampleId) &&
                            "opacity-60 cursor-not-allowed"
                        )}
                        type="button"
                        onClick={submitQc}
                        disabled={
                            qcSubmitting ||
                            !qcControlId ||
                            String(qcValue).trim() === "" ||
                            !isValidSampleId
                        }
                    >
                        {qcSubmitting ? "Submitting..." : "Submit QC"}
                    </button>
                </div>
            </div>
        </div>
    );
}
