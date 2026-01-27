import { useEffect, useMemo, useState } from "react";
import { submitIntakeChecklist, type IntakeChecklistPayload } from "../../services/intake";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    onClose: () => void;
    sampleId: number;
    requestLabel?: string;
    onSubmitted?: () => void;
};

type ChecklistRow = {
    key: string;
    label: string;
    hint?: string;
};

type Decision = "pass" | "fail" | null;

const CHECKLIST: ChecklistRow[] = [
    {
        key: "sample_physical_condition",
        label: "Sample Physical Condition",
        hint: "No leakage, no damage, container sealed and clean.",
    },
    {
        key: "volume",
        label: "Volume",
        hint: "Sufficient volume/amount for requested tests.",
    },
    {
        key: "identity",
        label: "Identity",
        hint: "Label/identity matches the request and is readable.",
    },
    {
        key: "packing",
        label: "Packing",
        hint: "Packaging is appropriate and protects sample integrity.",
    },
    {
        key: "supporting_documents",
        label: "Supporting Documents",
        hint: "Required documents are present and complete.",
    },
];

export const IntakeChecklistModal = ({ open, onClose, sampleId, requestLabel, onSubmitted }: Props) => {
    const keys = useMemo(() => CHECKLIST.map((c) => c.key), []);

    const [decision, setDecision] = useState<Record<string, Decision>>({});
    const [reason, setReason] = useState<Record<string, string>>({});
    const [generalNote, setGeneralNote] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;

        const initDecision: Record<string, Decision> = {};
        const initReason: Record<string, string> = {};
        for (const k of keys) {
            initDecision[k] = null;
            initReason[k] = "";
        }

        setDecision(initDecision);
        setReason(initReason);
        setGeneralNote("");
        setFieldErrors({});
        setError(null);
        setSubmitting(false);
    }, [open, keys]);

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    const validate = (): boolean => {
        const errs: Record<string, string> = {};

        for (const row of CHECKLIST) {
            const d = decision[row.key] ?? null;
            if (!d) {
                errs[row.key] = "Please choose PASS or FAIL.";
                continue;
            }
            if (d === "fail") {
                const r = (reason[row.key] ?? "").trim();
                if (!r) errs[row.key] = "Reason is required when FAIL.";
            }
        }

        setFieldErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const anyFail = useMemo(() => CHECKLIST.some((c) => decision[c.key] === "fail"), [decision]);

    const submit = async () => {
        if (submitting) return;
        if (!validate()) return;

        try {
            setSubmitting(true);
            setError(null);

            const checks: Record<string, boolean> = {};
            const notesMap: Record<string, string | null> = {};

            for (const row of CHECKLIST) {
                const d = decision[row.key];
                checks[row.key] = d === "pass";
                const note = (reason[row.key] ?? "").trim();
                notesMap[row.key] = note ? note : null;
            }

            const payload: IntakeChecklistPayload = {
                checks,
                notes: notesMap,
                items: CHECKLIST.map((c) => ({
                    key: c.key,
                    passed: decision[c.key] === "pass",
                    note: (reason[c.key] ?? "").trim() ? (reason[c.key] ?? "").trim() : null,
                })),
                note: generalNote.trim() ? generalNote.trim() : null,
            };

            await submitIntakeChecklist(sampleId, payload);

            onClose();
            onSubmitted?.();
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to submit checklist.";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onClose} aria-hidden="true" />

            <div className="relative w-[92vw] max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
                <div className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Intake Checklist</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            {requestLabel ? <span className="font-semibold">{requestLabel}</span> : null}
                            {requestLabel ? " · " : null}
                            All categories must PASS. Any FAIL returns the request to admin.
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

                <div className="px-6 py-5 overflow-auto">
                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    )}

                    <div className="space-y-3">
                        {CHECKLIST.map((c) => {
                            const d = decision[c.key] ?? null;
                            const isFail = d === "fail";
                            const err = fieldErrors[c.key];

                            return (
                                <div key={c.key} className={cx("rounded-2xl border p-4", err ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white")}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-gray-900">{c.label}</div>
                                            {c.hint ? <div className="text-xs text-gray-500 mt-0.5">{c.hint}</div> : null}
                                            {err ? <div className="text-xs text-red-700 mt-2">{err}</div> : null}
                                        </div>

                                        <div className="shrink-0 flex items-center gap-2">
                                            <button
                                                type="button"
                                                className={cx(
                                                    "px-3 py-1.5 rounded-xl text-xs font-semibold border",
                                                    d === "pass"
                                                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                        : "bg-white border-gray-200 text-gray-600"
                                                )}
                                                onClick={() => {
                                                    setDecision((s) => ({ ...s, [c.key]: "pass" }));
                                                    setReason((s) => ({ ...s, [c.key]: "" }));
                                                    setFieldErrors((e) => {
                                                        const copy = { ...e };
                                                        delete copy[c.key];
                                                        return copy;
                                                    });
                                                }}
                                                disabled={submitting}
                                            >
                                                PASS
                                            </button>

                                            <button
                                                type="button"
                                                className={cx(
                                                    "px-3 py-1.5 rounded-xl text-xs font-semibold border",
                                                    d === "fail"
                                                        ? "bg-red-50 border-red-200 text-red-700"
                                                        : "bg-white border-gray-200 text-gray-600"
                                                )}
                                                onClick={() => {
                                                    setDecision((s) => ({ ...s, [c.key]: "fail" }));
                                                    setFieldErrors((e) => {
                                                        const copy = { ...e };
                                                        delete copy[c.key];
                                                        return copy;
                                                    });
                                                }}
                                                disabled={submitting}
                                            >
                                                FAIL
                                            </button>
                                        </div>
                                    </div>

                                    {isFail ? (
                                        <div className="mt-3">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                                Reason (required)
                                            </label>
                                            <input
                                                value={reason[c.key] ?? ""}
                                                onChange={(e) => setReason((s) => ({ ...s, [c.key]: e.target.value }))}
                                                placeholder="Explain what failed..."
                                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                disabled={submitting}
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4">
                        <label className="block text-xs font-medium text-gray-700 mb-1">General note (optional)</label>
                        <textarea
                            value={generalNote}
                            onChange={(e) => setGeneralNote(e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            placeholder="Any additional context..."
                            disabled={submitting}
                        />
                    </div>

                    {anyFail ? (
                        <div className="mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl">
                            At least one category is FAIL. This request should be returned to admin as <span className="font-semibold">Not eligible</span>.
                        </div>
                    ) : null}
                </div>

                <div className="shrink-0 px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button type="button" className="lims-btn-primary" onClick={submit} disabled={submitting}>
                        {submitting ? "Submitting..." : "Submit Checklist"}
                    </button>
                </div>
            </div>
        </div>
    );
};
