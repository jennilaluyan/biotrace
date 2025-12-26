// src/pages/portal/CreateSampleRequestModal.tsx
import React, { useMemo, useState } from "react";
import { sampleRequestService, type CreateSampleRequestPayload } from "../../services/sampleRequests";

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
};

export const CreateSampleRequestModal = ({ open, onClose, onCreated }: Props) => {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [intendedSampleType, setIntendedSampleType] = useState("");
    const [examPurpose, setExamPurpose] = useState("");
    const [contactHistory, setContactHistory] = useState("");
    const [priority, setPriority] = useState<number>(2);
    const [notes, setNotes] = useState("");

    // items minimal: parameter_id + notes
    const [items, setItems] = useState<Array<{ parameter_id: number; notes?: string }>>([
        { parameter_id: 1, notes: "" },
    ]);

    const canSubmit = useMemo(() => items.length > 0 && items.every((x) => !!x.parameter_id), [items]);

    if (!open) return null;

    const submit = async () => {
        setErr(null);
        if (!canSubmit) {
            setErr("Items must include at least 1 parameter_id.");
            return;
        }

        const payload: CreateSampleRequestPayload = {
            intended_sample_type: intendedSampleType || null,
            examination_purpose: examPurpose || null,
            contact_history: contactHistory || null,
            priority: priority ?? null,
            additional_notes: notes || null,
            items: items.map((it) => ({
                parameter_id: Number(it.parameter_id),
                notes: it.notes?.trim() ? it.notes.trim() : null,
            })),
        };

        try {
            setLoading(true);
            await sampleRequestService.create(payload);
            onCreated();
            onClose();
        } catch (e: any) {
            const msg = e?.data?.message ?? e?.data?.error ?? "Failed to create request";
            setErr(msg);
        } finally {
            setLoading(false);
        }
    };

    const updateItem = (idx: number, patch: Partial<{ parameter_id: number; notes?: string }>) => {
        setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    };

    const addItem = () => setItems((p) => [...p, { parameter_id: 1, notes: "" }]);
    const removeItem = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="text-lg font-semibold text-primary">Create Sample Request</h2>
                    <button onClick={onClose} className="text-gray-600 hover:text-gray-800">
                        ✕
                    </button>
                </div>

                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                    {err && (
                        <div className="text-xs text-red-700 bg-red-100 px-3 py-2 rounded">{err}</div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Intended sample type</label>
                            <input
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                value={intendedSampleType}
                                onChange={(e) => setIntendedSampleType(e.target.value)}
                                placeholder="e.g., Swab / Blood / Tissue"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Examination purpose</label>
                            <input
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                value={examPurpose}
                                onChange={(e) => setExamPurpose(e.target.value)}
                                placeholder="e.g., Diagnostic / Research"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Contact history</label>
                            <input
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                value={contactHistory}
                                onChange={(e) => setContactHistory(e.target.value)}
                                placeholder="(optional) free text dulu"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-600 mb-1">Priority</label>
                            <input
                                type="number"
                                className="w-full rounded-xl border px-3 py-2 text-sm"
                                value={priority}
                                onChange={(e) => setPriority(Number(e.target.value))}
                                min={1}
                                max={5}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Additional notes</label>
                        <textarea
                            className="w-full rounded-xl border px-3 py-2 text-sm min-h-20"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="(optional)"
                        />
                    </div>

                    <div className="border rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-800">Requested parameters</h3>
                            <button
                                type="button"
                                onClick={addItem}
                                className="text-xs font-semibold text-primary hover:underline"
                            >
                                + Add item
                            </button>
                        </div>

                        <div className="space-y-2">
                            {items.map((it, idx) => (
                                <div key={idx} className="flex gap-2 items-start">
                                    <div className="flex-1">
                                        <label className="block text-[11px] text-gray-600 mb-1">parameter_id</label>
                                        <input
                                            type="number"
                                            className="w-full rounded-xl border px-3 py-2 text-sm"
                                            value={it.parameter_id}
                                            onChange={(e) => updateItem(idx, { parameter_id: Number(e.target.value) })}
                                            min={1}
                                        />
                                    </div>

                                    <div className="flex-2">
                                        <label className="block text-[11px] text-gray-600 mb-1">notes</label>
                                        <input
                                            className="w-full rounded-xl border px-3 py-2 text-sm"
                                            value={it.notes ?? ""}
                                            onChange={(e) => updateItem(idx, { notes: e.target.value })}
                                            placeholder="optional"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => removeItem(idx)}
                                        className="mt-6 text-xs text-red-600 hover:underline"
                                        disabled={items.length === 1}
                                        title={items.length === 1 ? "At least 1 item required" : "Remove"}
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>

                        <p className="mt-3 text-[11px] text-gray-500">
                            Note: untuk sekarang item pakai input <b>parameter_id</b> manual. Nanti bisa kita upgrade ke dropdown parameter.
                        </p>
                    </div>
                </div>

                <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm">
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        disabled={loading}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60"
                    >
                        {loading ? "Creating..." : "Create request"}
                    </button>
                </div>
            </div>
        </div>
    );
};
