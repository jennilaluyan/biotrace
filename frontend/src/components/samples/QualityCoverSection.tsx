// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\QualityCoverSection.tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Send, Loader2 } from "lucide-react";

import type { Sample } from "../../services/samples";
import { QualityCover, getQualityCover, saveQualityCoverDraft, submitQualityCover } from "../../services/qualityCovers";
import { formatDate } from "../../utils/date";

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

function titleCaseWords(input: string) {
    return String(input ?? "")
        .replace(/_/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

type ValidationKey =
    | "notAllowed"
    | "alreadySubmitted"
    | "methodRequired"
    | "pcr.markerMissing"
    | "pcr.valueRequired"
    | "pcr.valueNumeric"
    | "pcr.resultRequired"
    | "pcr.interpretationRequired"
    | "wgs.lineageRequired"
    | "wgs.variantRequired"
    | "others.notesRequired";

type ValidationResult = { ok: true } | { ok: false; key: ValidationKey; ctx?: Record<string, any> };

export function QualityCoverSection(props: Props) {
    const { t } = useTranslation();
    const { sample, checkedByName, disabled, onAfterSave } = props;

    const sampleId = Number((sample as any)?.sample_id ?? 0);

    const workflowGroup = String((sample as any)?.workflow_group ?? "").toLowerCase();
    const qcGroup = useMemo(() => {
        if (workflowGroup.includes("pcr")) return "pcr";
        if (workflowGroup.includes("wgs")) return "wgs";
        return "others";
    }, [workflowGroup]);

    const requested = useMemo(() => {
        return (((sample as any)?.requested_parameters || (sample as any)?.requestedParameters || []) as any[]) ?? [];
    }, [sample]);

    const parameterId = useMemo(() => {
        return requested.length === 1 && requested?.[0]?.parameter_id ? Number(requested[0].parameter_id) : undefined;
    }, [requested]);

    const paramLabel = useMemo(() => {
        const s =
            requested
                .map((p: any) => p?.name)
                .filter(Boolean)
                .join(", ") || "—";
        return s;
    }, [requested]);

    const sampleCode = String((sample as any)?.lab_sample_code ?? "—");

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
                setQcError(prettyErr(e, t("qualityCover.section.errors.loadFailed")));
                setCover(null);
            } finally {
                if (!alive) return;
                setQcLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [sampleId, t]);

    const statusText = useMemo(() => {
        const v = String(cover?.status ?? "draft").trim().toLowerCase();
        if (v === "submitted") return t("qualityCover.section.status.submitted");
        if (v === "draft") return t("qualityCover.section.status.draft");
        return titleCaseWords(v);
    }, [cover?.status, t]);

    const statusPillClass = useMemo(() => {
        return cover?.status === "submitted"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-white border-gray-200 text-gray-700";
    }, [cover?.status]);

    const validate = useMemo<ValidationResult>(() => {
        if (disabled) return { ok: false, key: "notAllowed" };
        if (cover?.status === "submitted") return { ok: false, key: "alreadySubmitted" };
        if (!methodOfAnalysis.trim()) return { ok: false, key: "methodRequired" };

        if (qcGroup === "pcr") {
            const req = ["ORF1b", "RdRp", "RPP30"] as const;

            for (const k of req) {
                const obj = qcPayload?.[k];

                if (!obj) return { ok: false, key: "pcr.markerMissing", ctx: { marker: k } };

                if (obj.value === null || obj.value === undefined || obj.value === "")
                    return { ok: false, key: "pcr.valueRequired", ctx: { marker: k } };

                if (Number.isNaN(Number(obj.value)))
                    return { ok: false, key: "pcr.valueNumeric", ctx: { marker: k } };

                if (!String(obj.result ?? "").trim())
                    return { ok: false, key: "pcr.resultRequired", ctx: { marker: k } };

                if (!String(obj.interpretation ?? "").trim())
                    return { ok: false, key: "pcr.interpretationRequired", ctx: { marker: k } };
            }
        }

        if (qcGroup === "wgs") {
            if (!String(qcPayload?.lineage ?? "").trim()) return { ok: false, key: "wgs.lineageRequired" };
            if (!String(qcPayload?.variant ?? "").trim()) return { ok: false, key: "wgs.variantRequired" };
        }

        if (qcGroup === "others") {
            if (!String(qcPayload?.notes ?? "").trim()) return { ok: false, key: "others.notesRequired" };
        }

        return { ok: true };
    }, [disabled, cover?.status, methodOfAnalysis, qcPayload, qcGroup]);

    const submitDisabledReason = useMemo<string | null>(() => {
        if (validate.ok) return null;

        const ctx = validate.ctx ?? {};
        const msg = t(`qualityCover.section.validation.${validate.key}`, ctx as any);
        return typeof msg === "string" ? msg : String(msg);
    }, [validate, t]);

    async function onSaveDraft() {
        if (!sampleId) return;
        if (disabled) return;

        setQcSaving(true);
        setQcError(null);

        try {
            const c = await saveQualityCoverDraft(sampleId, {
                parameter_id: parameterId,
                parameter_label: paramLabel !== "—" ? paramLabel : undefined,
                method_of_analysis: methodOfAnalysis || undefined,
                qc_payload: qcPayload,
            });

            setCover(c);
            onAfterSave?.();
        } catch (e: any) {
            setQcError(prettyErr(e, t("qualityCover.section.errors.saveDraftFailed")));
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
            // ensure saved draft first (audit-friendly)
            await saveQualityCoverDraft(sampleId, {
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
            setQcError(prettyErr(e, t("qualityCover.section.errors.submitFailed")));
        } finally {
            setQcSubmitting(false);
        }
    }

    const isLocked = !!disabled || cover?.status === "submitted";
    const isBusy = qcLoading || qcSaving || qcSubmitting;

    // show "today" as analysis date placeholder (until backend provides date_of_analysis field)
    const todayLabel = useMemo(() => {
        try {
            return formatDate(new Date().toISOString());
        } catch {
            return new Date().toLocaleDateString();
        }
    }, []);

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="text-sm font-bold text-gray-900">{t("qualityCover.section.title")}</div>

                        <span className={cx("text-[11px] px-2 py-0.5 rounded-full border", statusPillClass)}>
                            {statusText}
                        </span>

                        {isLocked ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full border bg-white border-gray-200 text-gray-600">
                                {t("qualityCover.section.lockedBadge")}
                            </span>
                        ) : null}
                    </div>

                    <div className="text-xs text-gray-500 mt-1">{t("qualityCover.section.subtitle")}</div>
                </div>

                {/* Icon-only actions */}
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className={cx(
                            "btn-outline inline-flex items-center justify-center h-10 w-10 rounded-xl",
                            (qcLoading || qcSaving || isLocked) && "opacity-60 cursor-not-allowed"
                        )}
                        onClick={onSaveDraft}
                        disabled={qcLoading || qcSaving || isLocked}
                        aria-label={t("saveDraft")}
                        title={isLocked ? t("qualityCover.section.tooltips.locked") : t("saveDraft")}
                    >
                        {qcSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    </button>

                    <button
                        type="button"
                        className={cx(
                            "lims-btn-primary inline-flex items-center justify-center h-10 w-10 rounded-xl",
                            (!!submitDisabledReason || qcLoading || qcSubmitting) && "opacity-60 cursor-not-allowed"
                        )}
                        onClick={onSubmit}
                        disabled={qcLoading || qcSubmitting || !!submitDisabledReason}
                        aria-label={t("submit")}
                        title={submitDisabledReason || t("submit")}
                    >
                        {qcSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                </div>
            </div>

            <div className="px-5 py-4">
                {/* Error */}
                {qcError ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3" role="alert">
                        {qcError}
                    </div>
                ) : null}

                {/* Locked banner */}
                {isLocked ? (
                    <div className="text-sm text-gray-700 bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl mb-3">
                        {t("qualityCover.section.lockedHint")}
                    </div>
                ) : null}

                {/* Loading state */}
                {qcLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("qualityCover.section.states.loading")}
                    </div>
                ) : null}

                {/* Meta */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("qualityCover.section.meta.parameter")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{paramLabel}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("qualityCover.section.meta.date")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{todayLabel}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("qualityCover.section.meta.labCode")}</div>
                        <div className="font-mono text-xs mt-1">{sampleCode}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("qualityCover.section.meta.checkedBy")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{checkedByName || "—"}</div>
                    </div>
                </div>

                {/* Method */}
                <div className="mt-4">
                    <label className="block text-xs text-gray-500">
                        {t("qualityCover.section.fields.methodOfAnalysis")} <span className="text-red-600">*</span>
                    </label>
                    <input
                        value={methodOfAnalysis}
                        onChange={(e) => setMethodOfAnalysis(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        disabled={isLocked}
                        placeholder={t("qualityCover.section.placeholders.methodOfAnalysis")}
                    />
                    <div className="mt-1 text-[11px] text-gray-500">{t("qualityCover.section.hints.methodOfAnalysis")}</div>
                </div>

                {/* Payload */}
                <div className="mt-4">
                    {qcGroup === "pcr" ? (
                        <div className="space-y-3">
                            {["ORF1b", "RdRp", "RPP30"].map((k) => (
                                <div key={k} className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="text-xs font-semibold text-gray-800">{k}</div>
                                        <div className="text-[11px] text-gray-500">{t("qualityCover.section.groups.pcr.markerHint")}</div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500">{t("qualityCover.section.pcr.value")}</label>
                                            <input
                                                value={qcPayload?.[k]?.value ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: { ...(prev?.[k] || {}), value: e.target.value },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                inputMode="decimal"
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                placeholder={t("qualityCover.section.pcr.valuePlaceholder")}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500">{t("qualityCover.section.pcr.result")}</label>
                                            <input
                                                value={qcPayload?.[k]?.result ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: { ...(prev?.[k] || {}), result: e.target.value },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                placeholder={t("qualityCover.section.pcr.resultPlaceholder")}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500">{t("qualityCover.section.pcr.interpretation")}</label>
                                            <input
                                                value={qcPayload?.[k]?.interpretation ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: { ...(prev?.[k] || {}), interpretation: e.target.value },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                placeholder={t("qualityCover.section.pcr.interpretationPlaceholder")}
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
                                <label className="block text-xs text-gray-500">{t("qualityCover.section.wgs.lineage")}</label>
                                <input
                                    value={qcPayload?.lineage ?? ""}
                                    onChange={(e) => setQcPayload((prev: any) => ({ ...prev, lineage: e.target.value }))}
                                    disabled={isLocked}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    placeholder={t("qualityCover.section.wgs.lineagePlaceholder")}
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500">{t("qualityCover.section.wgs.variant")}</label>
                                <input
                                    value={qcPayload?.variant ?? ""}
                                    onChange={(e) => setQcPayload((prev: any) => ({ ...prev, variant: e.target.value }))}
                                    disabled={isLocked}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    placeholder={t("qualityCover.section.wgs.variantPlaceholder")}
                                />
                            </div>
                        </div>
                    ) : null}

                    {qcGroup === "others" ? (
                        <div>
                            <label className="block text-xs text-gray-500">{t("qualityCover.section.others.notes")}</label>
                            <textarea
                                value={qcPayload?.notes ?? ""}
                                onChange={(e) => setQcPayload((prev: any) => ({ ...prev, notes: e.target.value }))}
                                disabled={isLocked}
                                className={cx(
                                    "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-24",
                                    "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                                )}
                                placeholder={t("qualityCover.section.others.notesPlaceholder")}
                            />
                        </div>
                    ) : null}

                    {/* Helper (why submit disabled) */}
                    {submitDisabledReason ? (
                        <div className={cx("mt-3 text-xs", isBusy ? "text-gray-400" : "text-gray-500")}>
                            {submitDisabledReason}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}