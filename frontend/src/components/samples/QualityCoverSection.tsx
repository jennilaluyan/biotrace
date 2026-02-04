// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\QualityCoverSection.tsx
import { useEffect, useMemo, useState } from "react";
import type { Sample } from "../../services/samples";
import {
    QualityCover,
    getQualityCover,
    saveQualityCoverDraft,
    submitQualityCover,
} from "../../services/qualityCovers";
import { cx, SmallButton, SmallPrimaryButton } from "./SampleDetailAtoms";

type Props = {
    sample: Sample;
    checkedByName: string;
    disabled?: boolean; // e.g. only analyst can edit
    onAfterSave?: () => void; // refresh sample/documents if needed
};

export function QualityCoverSection(props: Props) {
    const { sample, checkedByName, disabled, onAfterSave } = props;

    const sampleId = Number((sample as any)?.sample_id ?? 0);

    const workflowGroup = String((sample as any)?.workflow_group ?? "").toLowerCase();
    const qcGroup = useMemo(() => {
        if (workflowGroup.includes("pcr")) return "pcr";
        if (workflowGroup.includes("wgs")) return "wgs";
        return "others";
    }, [workflowGroup]);

    const [qcLoading, setQcLoading] = useState(false);
    const [qcSaving, setQcSaving] = useState(false);
    const [qcSubmitting, setQcSubmitting] = useState(false);
    const [qcError, setQcError] = useState<string | null>(null);

    const [cover, setCover] = useState<QualityCover | null>(null);

    const [methodOfAnalysis, setMethodOfAnalysis] = useState("");
    const [qcPayload, setQcPayload] = useState<any>({});

    useEffect(() => {
        if (!sampleId) return;

        let alive = true;

        (async () => {
            try {
                setQcLoading(true);
                setQcError(null);

                const c = await getQualityCover(sampleId);
                if (!alive) return;

                setCover(c);

                if (c?.method_of_analysis) setMethodOfAnalysis(String(c.method_of_analysis));
                if (c?.qc_payload) setQcPayload(c.qc_payload);
            } catch (e: any) {
                if (!alive) return;
                setQcError(e?.message || "Failed to load quality cover.");
                setCover(null);
            } finally {
                if (!alive) return;
                setQcLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [sampleId]);

    const submitDisabledReason = useMemo(() => {
        if (disabled) return "Not allowed.";
        if (cover?.status === "submitted") return "Already submitted.";
        if (!methodOfAnalysis.trim()) return "Method of analysis is required.";

        if (qcGroup === "pcr") {
            const req = ["ORF1b", "RdRp", "RPP30"];
            for (const k of req) {
                const obj = qcPayload?.[k];
                if (!obj) return `${k} is required.`;
                if (obj.value === null || obj.value === undefined || obj.value === "") return `${k} value is required.`;
                if (Number.isNaN(Number(obj.value))) return `${k} value must be numeric.`;
                if (!String(obj.result ?? "").trim()) return `${k} result is required.`;
                if (!String(obj.interpretation ?? "").trim()) return `${k} interpretation is required.`;
            }
        }

        if (qcGroup === "wgs") {
            if (!String(qcPayload?.lineage ?? "").trim()) return "Lineage is required.";
            if (!String(qcPayload?.variant ?? "").trim()) return "Variant is required.";
        }

        if (qcGroup === "others") {
            if (!String(qcPayload?.notes ?? "").trim()) return "Notes is required.";
        }

        return null;
    }, [disabled, cover?.status, methodOfAnalysis, qcPayload, qcGroup]);

    async function onSaveDraft() {
        if (!sampleId) return;
        if (disabled) return;

        setQcSaving(true);
        setQcError(null);

        try {
            const c = await saveQualityCoverDraft(sampleId, {
                method_of_analysis: methodOfAnalysis || undefined,
                qc_payload: qcPayload,
            });

            setCover(c);
            onAfterSave?.();
        } catch (e: any) {
            setQcError(e?.message || "Failed to save draft.");
        } finally {
            setQcSaving(false);
        }
    }

    async function onSubmit() {
        if (!sampleId) return;
        if (disabled) return;
        if (submitDisabledReason) return;

        setQcSubmitting(true);
        setQcError(null);

        try {
            const c = await submitQualityCover(sampleId, {
                method_of_analysis: methodOfAnalysis.trim(),
                qc_payload: qcPayload,
            });

            setCover(c);
            onAfterSave?.();
        } catch (e: any) {
            setQcError(e?.message || "Failed to submit quality cover.");
        } finally {
            setQcSubmitting(false);
        }
    }

    const paramLabel =
        // backend sometimes uses requested_parameters or requestedParameters; handle both
        ((sample as any)?.requested_parameters || (sample as any)?.requestedParameters || [])
            .map((p: any) => p?.name)
            .filter(Boolean)
            .join(", ") || "-";

    const sampleCode = String((sample as any)?.lab_sample_code ?? (sample as any)?.sample_id ?? "-");

    const isLocked = disabled || cover?.status === "submitted";

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-bold text-gray-900">Quality Cover</div>
                    <div className="text-xs text-gray-500 mt-1">
                        Status: <span className="font-semibold capitalize">{cover?.status ?? "draft"}</span>
                        {cover?.submitted_at ? ` • submitted at ${new Date(cover.submitted_at).toLocaleString()}` : ""}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <SmallButton
                        type="button"
                        onClick={onSaveDraft}
                        disabled={qcLoading || qcSaving || isLocked}
                        title={isLocked ? "Locked" : "Save draft"}
                    >
                        {qcSaving ? "Saving..." : "Save Draft"}
                    </SmallButton>

                    <SmallPrimaryButton
                        type="button"
                        onClick={onSubmit}
                        disabled={qcLoading || qcSubmitting || !!submitDisabledReason}
                        title={submitDisabledReason || "Submit quality cover"}
                    >
                        {qcSubmitting ? "Submitting..." : "Submit"}
                    </SmallPrimaryButton>
                </div>
            </div>

            <div className="px-5 py-4">
                {qcError ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                        {qcError}
                    </div>
                ) : null}

                {qcLoading ? <div className="text-sm text-gray-600">Loading quality cover…</div> : null}

                {/* Auto fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">Parameter</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{paramLabel}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">Date of analysis</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{new Date().toLocaleDateString()}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">Sample ID</div>
                        <div className="font-mono text-xs mt-1">{sampleCode}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">Checked by</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{checkedByName || "-"}</div>
                    </div>
                </div>

                {/* Manual field */}
                <div className="mt-4">
                    <label className="block text-xs text-gray-500">Method of analysis</label>
                    <input
                        value={methodOfAnalysis}
                        onChange={(e) => setMethodOfAnalysis(e.target.value)}
                        placeholder="Type method of analysis…"
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        disabled={isLocked}
                    />
                </div>

                {/* QC section */}
                <div className="mt-4">
                    <div className="text-sm font-bold text-gray-900 mb-2">Quality Control</div>

                    {qcGroup === "pcr" ? (
                        <div className="space-y-3">
                            {["ORF1b", "RdRp", "RPP30"].map((k) => (
                                <div key={k} className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                                    <div className="text-xs font-semibold text-gray-800 mb-2">{k}</div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500">Value (numeric)</label>
                                            <input
                                                value={qcPayload?.[k]?.value ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: { ...(prev?.[k] || {}), value: e.target.value },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                                                placeholder="e.g. 12.3"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500">Result</label>
                                            <input
                                                value={qcPayload?.[k]?.result ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: { ...(prev?.[k] || {}), result: e.target.value },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                                                placeholder="Positive/Negative"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500">Interpretation</label>
                                            <input
                                                value={qcPayload?.[k]?.interpretation ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: { ...(prev?.[k] || {}), interpretation: e.target.value },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                                                placeholder="OK/Repeat/Invalid"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {qcGroup === "wgs" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-500">Lineage</label>
                                <input
                                    value={qcPayload?.lineage ?? ""}
                                    onChange={(e) => setQcPayload((prev: any) => ({ ...prev, lineage: e.target.value }))}
                                    disabled={isLocked}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                                    placeholder="e.g. BA.2"
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500">Variant</label>
                                <input
                                    value={qcPayload?.variant ?? ""}
                                    onChange={(e) => setQcPayload((prev: any) => ({ ...prev, variant: e.target.value }))}
                                    disabled={isLocked}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
                                    placeholder="e.g. Omicron"
                                />
                            </div>
                        </div>
                    ) : null}

                    {qcGroup === "others" ? (
                        <div>
                            <label className="block text-xs text-gray-500">Notes</label>
                            <textarea
                                value={qcPayload?.notes ?? ""}
                                onChange={(e) => setQcPayload((prev: any) => ({ ...prev, notes: e.target.value }))}
                                disabled={isLocked}
                                className={cx(
                                    "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-24",
                                    "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                                )}
                                placeholder="Write QC notes…"
                            />
                        </div>
                    ) : null}

                    {submitDisabledReason ? (
                        <div className="mt-3 text-xs text-gray-500 italic">Submit blocked: {submitDisabledReason}</div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
