import { useEffect, useMemo, useState } from "react";
import { submitIntakeChecklist, type IntakeChecklistPayload } from "../../services/intake";

type Props = {
    open: boolean;
    sampleId: number;
    requestStatus?: string | null;
    onClose: () => void;
    onSubmitted?: () => void;
};

type ApiError = {
    data?: {
        message?: string;
        error?: string;
        details?: Record<string, string[] | string>;
        errors?: Record<string, string[]>;
    };
    message?: string;
};

const getErrorMessage = (err: unknown, fallback: string) => {
    const e = err as ApiError;

    const details = e?.data?.details;
    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstVal = firstKey ? details[firstKey] : undefined;
        if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
        if (typeof firstVal === "string" && firstVal) return firstVal;
    }

    const errors = e?.data?.errors;
    if (errors && typeof errors === "object") {
        const firstKey = Object.keys(errors)[0];
        const firstArr = firstKey ? errors[firstKey] : undefined;
        if (Array.isArray(firstArr) && firstArr[0]) return String(firstArr[0]);
    }

    return e?.data?.message ?? e?.data?.error ?? e?.message ?? fallback;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type ChecklistRow = {
    key: string;
    label: string;
    helper?: string;
    passed: boolean | null; // null = not selected
    note: string;
};

const DEFAULT_CHECKS: Array<Omit<ChecklistRow, "passed" | "note">> = [
    { key: "sample_label_match", label: "Sample label matches request", helper: "Label/ID on container must match request." },
    { key: "container_intact", label: "Container is intact / sealed", helper: "No leakage, seal not broken." },
    { key: "volume_sufficient", label: "Volume/amount is sufficient", helper: "Minimum quantity for requested tests." },
    { key: "condition_ok", label: "Condition is acceptable", helper: "No obvious contamination/damage." },
    { key: "transport_ok", label: "Transport & packaging are acceptable", helper: "Delivered in correct packaging/conditions." },
    { key: "documentation_ok", label: "Request documentation is complete", helper: "Info needed for intake is present." },
];

export const IntakeChecklistModal = ({ open, sampleId, requestStatus, onClose, onSubmitted }: Props) => {
    const [rows, setRows] = useState<ChecklistRow[]>([]);
    const [generalNote, setGeneralNote] = useState<string>("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = useMemo(() => {
        if (submitting) return false;
        if (!rows || rows.length === 0) return false;
        // require ALL items to be decided (pass/fail)
        return rows.every((r) => r.passed !== null);
    }, [rows, submitting]);

    useEffect(() => {
        if (!open) return;
        setRows(DEFAULT_CHECKS.map((c) => ({ ...c, passed: null, note: "" })));
        setGeneralNote("");
        setError(null);
        setSubmitting(false);
    }, [open]);

    // lock body scroll while modal open
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    const markAll = (passed: boolean) => {
        setRows((prev) => prev.map((r) => ({ ...r, passed })));
    };

    const updateRow = (key: string, patch: Partial<ChecklistRow>) => {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    };

    const submit = async () => {
        if (!canSubmit) return;

        try {
            setSubmitting(true);
            setError(null);

            // Build both shapes: object-map + array-list (backend can ignore extras)
            const checks: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            const items = rows.map((r) => {
                const passed = !!r.passed;
                checks[r.key] = passed;
                if (r.note.trim()) notes[r.key] = r.note.trim();
                return { key: r.key, passed, note: r.note.trim() || null };
            });

            const payload: IntakeChecklistPayload = {
                checks,
                notes,
                items,
                note: generalNote.trim() || null,
            };

            await submitIntakeChecklist(sampleId, payload);

            onClose();
            onSubmitted?.();
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to submit intake checklist."));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            {/* modal shell */}
            <div
                className={cx(
                    "relative w-[92vw] max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden",
                    "max-h-[86vh] flex flex-col"
                )}
            >
                {/* header */}
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Intake Checklist</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Sample Collector checklist before intake validation.
                            {requestStatus ? (
                                <span className="ml-2 font-mono text-[11px] text-gray-400">request_status={String(requestStatus)}</span>
                            ) : null}
                        </p>
                    </div>

                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
                        disabled={submitting}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M18 6L6 18" />
                            <path d="M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* body (scrollable) */}
                <div className="px-6 py-5 overflow-y-auto flex-1">
                    {error && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}

                    <div className="flex flex-wrap gap-2 mb-4">
                        <button
                            type="button"
                            className="lims-btn"
                            onClick={() => markAll(true)}
                            disabled={submitting}
                        >
                            Mark all PASS
                        </button>
                        <button
                            type="button"
                            className="lims-btn"
                            onClick={() => markAll(false)}
                            disabled={submitting}
                        >
                            Mark all FAIL
                        </button>
                    </div>

                    <div className="space-y-3">
                        {rows.map((r) => (
                            <div key={r.key} className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                    <div className="min-w-[240px]">
                                        <div className="text-sm font-semibold text-gray-900">{r.label}</div>
                                        {r.helper ? <div className="text-[11px] text-gray-600 mt-1">{r.helper}</div> : null}
                                        <div className="mt-2 text-[10px] text-gray-400 font-mono">{r.key}</div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => updateRow(r.key, { passed: true })}
                                            disabled={submitting}
                                            className={cx(
                                                "px-3 py-2 rounded-xl text-xs font-semibold border transition",
                                                r.passed === true
                                                    ? "bg-emerald-600 text-white border-emerald-600"
                                                    : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                                            )}
                                        >
                                            PASS
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateRow(r.key, { passed: false })}
                                            disabled={submitting}
                                            className={cx(
                                                "px-3 py-2 rounded-xl text-xs font-semibold border transition",
                                                r.passed === false
                                                    ? "bg-red-600 text-white border-red-600"
                                                    : "bg-white text-gray-700 border-gray-200 hover:border-red-300"
                                            )}
                                        >
                                            FAIL
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                                    <input
                                        value={r.note}
                                        onChange={(e) => updateRow(r.key, { note: e.target.value })}
                                        placeholder="Add note for this item (optional)"
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        disabled={submitting}
                                    />
                                </div>

                                {r.passed === null && (
                                    <div className="mt-2 text-xs text-amber-700">
                                        Please choose PASS or FAIL.
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-5">
                        <label className="block text-xs font-medium text-gray-600 mb-1">General note (optional)</label>
                        <textarea
                            value={generalNote}
                            onChange={(e) => setGeneralNote(e.target.value)}
                            rows={3}
                            placeholder="Any additional context for intake..."
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            disabled={submitting}
                        />
                    </div>
                </div>

                {/* footer */}
                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary"
                        onClick={submit}
                        disabled={!canSubmit}
                        title={!canSubmit ? "Complete all checklist items first." : "Submit checklist"}
                    >
                        {submitting ? "Submitting..." : "Submit checklist"}
                    </button>
                </div>
            </div>
        </div>
    );
};
