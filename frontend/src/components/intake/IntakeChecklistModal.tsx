import { useEffect, useMemo, useState } from "react";
import { submitIntakeChecklist, type IntakeChecklistPayload } from "../../services/intake";

type Props = {
    open: boolean;
    onClose: () => void;
    sampleId: number;
    onSubmitted?: () => void;
};

type ChecklistRow = {
    key: string;
    label: string;
    hint?: string;
};

const CHECKLIST: ChecklistRow[] = [
    { key: "label_match", label: "Label matches request", hint: "Nama/kode sampel sesuai permintaan." },
    { key: "container_intact", label: "Container is intact", hint: "Tidak bocor/retak, segel aman." },
    { key: "volume_sufficient", label: "Volume/amount is sufficient", hint: "Cukup untuk pengujian." },
    { key: "temperature_ok", label: "Storage/transport condition OK", hint: "Suhu/penyimpanan sesuai." },
    { key: "documentation_complete", label: "Documentation complete", hint: "Form/keterangan lengkap." },
];

export const IntakeChecklistModal = ({ open, onClose, sampleId, onSubmitted }: Props) => {
    const [passed, setPassed] = useState<Record<string, boolean>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [generalNote, setGeneralNote] = useState<string>("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const allKeys = useMemo(() => CHECKLIST.map((c) => c.key), []);
    const isComplete = useMemo(() => {
        // default kalau belum dipilih -> anggap PASS (biar praktis)
        // tapi biar jelas, kita treat missing sebagai PASS
        return allKeys.length > 0;
    }, [allKeys]);

    useEffect(() => {
        if (!open) return;

        // default semua PASS
        const initPassed: Record<string, boolean> = {};
        const initNotes: Record<string, string> = {};
        for (const c of CHECKLIST) {
            initPassed[c.key] = true;
            initNotes[c.key] = "";
        }
        setPassed(initPassed);
        setNotes(initNotes);
        setGeneralNote("");
        setError(null);
        setSubmitting(false);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    if (!open) return null;

    const toggle = (key: string, val: boolean) => {
        setPassed((p) => ({ ...p, [key]: val }));
        // kalau set PASS, kosongkan note biar rapi
        if (val) setNotes((n) => ({ ...n, [key]: "" }));
    };

    const setNote = (key: string, val: string) => {
        setNotes((n) => ({ ...n, [key]: val }));
    };

    const submit = async () => {
        if (!isComplete || submitting) return;

        try {
            setSubmitting(true);
            setError(null);

            const payload: IntakeChecklistPayload = {
                checks: { ...passed },
                notes: Object.fromEntries(
                    Object.entries(notes).map(([k, v]) => [k, v?.trim() ? v.trim() : null])
                ),
                items: CHECKLIST.map((c) => ({
                    key: c.key,
                    passed: !!passed[c.key],
                    note: notes[c.key]?.trim() ? notes[c.key].trim() : null,
                })),
                note: generalNote?.trim() ? generalNote.trim() : null,
            };

            await submitIntakeChecklist(sampleId, payload);

            onClose();
            onSubmitted?.();
        } catch (err: any) {
            const msg = err?.data?.message ?? err?.data?.error ?? err?.message ?? "Failed to submit checklist.";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const anyFail = CHECKLIST.some((c) => passed[c.key] === false);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            <div className="relative w-[92vw] max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
                <div className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Intake Checklist</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Sample Collector fills checklist. Backend will decide pass/fail workflow.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
                        disabled={submitting}
                    >
                        ×
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    )}

                    <div className="space-y-3">
                        {CHECKLIST.map((c) => {
                            const ok = passed[c.key] !== false;
                            return (
                                <div key={c.key} className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <div className="text-sm font-semibold text-gray-900">{c.label}</div>
                                            {c.hint && <div className="text-xs text-gray-500 mt-1">{c.hint}</div>}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${ok ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-white border-gray-200 text-gray-600"
                                                    }`}
                                                onClick={() => toggle(c.key, true)}
                                                disabled={submitting}
                                            >
                                                PASS
                                            </button>
                                            <button
                                                type="button"
                                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${!ok ? "bg-red-50 border-red-200 text-red-700" : "bg-white border-gray-200 text-gray-600"
                                                    }`}
                                                onClick={() => toggle(c.key, false)}
                                                disabled={submitting}
                                            >
                                                FAIL
                                            </button>
                                        </div>
                                    </div>

                                    {!ok && (
                                        <div className="mt-3">
                                            <label className="block text-xs font-medium text-gray-600 mb-1">Note (required when FAIL)</label>
                                            <input
                                                value={notes[c.key] ?? ""}
                                                onChange={(e) => setNote(c.key, e.target.value)}
                                                placeholder="Explain what failed..."
                                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                disabled={submitting}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-600 mb-1">General note (optional)</label>
                        <textarea
                            value={generalNote}
                            onChange={(e) => setGeneralNote(e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            placeholder="Any additional context..."
                            disabled={submitting}
                        />
                    </div>

                    {anyFail && (
                        <div className="mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                            Some items are FAIL. Backend may return the request / change request_status accordingly.
                        </div>
                    )}
                </div>

                <div className="shrink-0 px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button type="button" className="lims-btn-primary" onClick={submit} disabled={submitting || !isComplete}>
                        {submitting ? "Submitting..." : "Submit Checklist"}
                    </button>
                </div>
            </div>
        </div>
    );
};
