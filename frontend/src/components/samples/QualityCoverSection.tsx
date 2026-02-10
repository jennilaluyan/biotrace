// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\QualityCoverSection.tsx
import { useEffect, useMemo, useState } from "react";
import { Save, Send, Loader2 } from "lucide-react";
import type { Sample } from "../../services/samples";
import {
    QualityCover,
    getQualityCover,
    saveQualityCoverDraft,
    submitQualityCover,
} from "../../services/qualityCovers";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    sample: Sample;
    checkedByName: string;
    disabled?: boolean;
    onAfterSave?: () => void;
};

function prettyErr(e: any, fallback: string) {
    return (
        e?.message ||
        e?.data?.message ||
        e?.data?.error ||
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        fallback
    );
}

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
                setQcError(prettyErr(e, "Failed to load quality cover."));
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
            const requested = ((sample as any)?.requested_parameters || (sample as any)?.requestedParameters || []) as any[];
            const parameterId =
                requested.length === 1 && requested?.[0]?.parameter_id ? Number(requested[0].parameter_id) : undefined;

            const c = await saveQualityCoverDraft(sampleId, {
                parameter_id: parameterId,
                parameter_label: paramLabel !== "—" ? paramLabel : undefined,
                method_of_analysis: methodOfAnalysis || undefined,
                qc_payload: qcPayload,
            });

            setCover(c);
            onAfterSave?.();
        } catch (e: any) {
            setQcError(prettyErr(e, "Failed to save draft."));
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
            const requested = ((sample as any)?.requested_parameters || (sample as any)?.requestedParameters || []) as any[];
            const parameterId =
                requested.length === 1 && requested?.[0]?.parameter_id ? Number(requested[0].parameter_id) : undefined;

            const ensuredDraft = await saveQualityCoverDraft(sampleId, {
                parameter_id: parameterId,
                parameter_label: paramLabel !== "—" ? paramLabel : undefined,
                method_of_analysis: methodOfAnalysis.trim(),
                qc_payload: qcPayload,
            });

            const submitted = await submitQualityCover(sampleId, {
                parameter_id: parameterId,
                parameter_label: paramLabel !== "—" ? paramLabel : undefined,
                method_of_analysis: methodOfAnalysis.trim(),
                qc_payload: qcPayload,
            });

            setCover(submitted);
            onAfterSave?.();
        } catch (e: any) {
            setQcError(prettyErr(e, "Failed to submit quality cover."));
        } finally {
            setQcSubmitting(false);
        }
    }

    const paramLabel =
        ((sample as any)?.requested_parameters || (sample as any)?.requestedParameters || [])
            .map((p: any) => p?.name)
            .filter(Boolean)
            .join(", ") || "—";

    const sampleCode = String((sample as any)?.lab_sample_code ?? "—");

    const isLocked = disabled || cover?.status === "submitted";

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-bold text-gray-900">Quality cover</div>
                    <div className="text-xs text-gray-500 mt-1">
                        {String(cover?.status ?? "draft").toLowerCase().replace(/_/g, " ")}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={onSaveDraft}
                        disabled={qcLoading || qcSaving || isLocked}
                        aria-label="Save draft"
                        title={isLocked ? "Locked" : "Save draft"}
                    >
                        {qcSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    </button>

                    <button
                        type="button"
                        className={cx("lims-icon-button", (!!submitDisabledReason || qcLoading || qcSubmitting) && "opacity-50 cursor-not-allowed")}
                        onClick={onSubmit}
                        disabled={qcLoading || qcSubmitting || !!submitDisabledReason}
                        aria-label="Submit"
                        title={submitDisabledReason || "Submit"}
                    >
                        {qcSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
            </div>

            <div className="px-5 py-4">
                {qcError ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                        {qcError}
                    </div>
                ) : null}

                {qcLoading ? <div className="text-sm text-gray-600">Loading…</div> : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">Parameter</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{paramLabel}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">Date</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{new Date().toLocaleDateString()}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">Lab code</div>
                        <div className="font-mono text-xs mt-1">{sampleCode}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">Checked by</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{checkedByName || "—"}</div>
                    </div>
                </div>

                <div className="mt-4">
                    <label className="block text-xs text-gray-500">Method of analysis</label>
                    <input
                        value={methodOfAnalysis}
                        onChange={(e) => setMethodOfAnalysis(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        disabled={isLocked}
                    />
                </div>

                <div className="mt-4">
                    {qcGroup === "pcr" ? (
                        <div className="space-y-3">
                            {["ORF1b", "RdRp", "RPP30"].map((k) => (
                                <div key={k} className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                                    <div className="text-xs font-semibold text-gray-800 mb-2">{k}</div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500">Value</label>
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
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500">Variant</label>
                                <input
                                    value={qcPayload?.variant ?? ""}
                                    onChange={(e) => setQcPayload((prev: any) => ({ ...prev, variant: e.target.value }))}
                                    disabled={isLocked}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
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
                            />
                        </div>
                    ) : null}

                    {submitDisabledReason ? (
                        <div className="mt-3 text-xs text-gray-500 italic">{submitDisabledReason}</div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
