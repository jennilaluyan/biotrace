import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, X, XCircle } from "lucide-react";
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

type Decision = "pass" | "fail" | null;

type ChecklistRow = {
    key: string;
    sectionKey: string;
    labelKey: string;
    hintKey?: string;
    defaultLabel: string;
    defaultHint?: string;
};

type ChecklistSection = { sectionKey: string; rows: ChecklistRow[] };

const CHECKLIST: ChecklistRow[] = [
    // Physical condition / container
    {
        key: "container_intact",
        sectionKey: "physicalCondition",
        labelKey: "intakeChecklist.items.container_intact.label",
        hintKey: "intakeChecklist.items.container_intact.hint",
        defaultLabel: "Container in good condition",
        defaultHint: "Sample container is intact (no cracks/breaks/leaks).",
    },
    {
        key: "cap_sealed",
        sectionKey: "physicalCondition",
        labelKey: "intakeChecklist.items.cap_sealed.label",
        hintKey: "intakeChecklist.items.cap_sealed.hint",
        defaultLabel: "Cap/closure sealed tightly",
        defaultHint: "Container is properly closed and securely sealed.",
    },
    {
        key: "no_leakage",
        sectionKey: "physicalCondition",
        labelKey: "intakeChecklist.items.no_leakage.label",
        hintKey: "intakeChecklist.items.no_leakage.hint",
        defaultLabel: "No leakage/spillage",
        defaultHint: "No leakage, spillage, or contamination observed.",
    },

    // Identity / labeling
    {
        key: "label_attached",
        sectionKey: "identity",
        labelKey: "intakeChecklist.items.label_attached.label",
        hintKey: "intakeChecklist.items.label_attached.hint",
        defaultLabel: "Label attached",
        defaultHint: "A label is present on the container.",
    },
    {
        key: "label_clear",
        sectionKey: "identity",
        labelKey: "intakeChecklist.items.label_clear.label",
        hintKey: "intakeChecklist.items.label_clear.hint",
        defaultLabel: "Label clear & readable",
        defaultHint: "Label text is legible (not faded, smudged, or unclear).",
    },
    {
        key: "label_matches_form",
        sectionKey: "identity",
        labelKey: "intakeChecklist.items.label_matches_form.label",
        hintKey: "intakeChecklist.items.label_matches_form.hint",
        defaultLabel: "Label matches request/form",
        defaultHint: "Label details match the request form (name/ID/date/time where applicable).",
    },
    {
        key: "identity_complete",
        sectionKey: "identity",
        labelKey: "intakeChecklist.items.identity_complete.label",
        hintKey: "intakeChecklist.items.identity_complete.hint",
        defaultLabel: "Identity information complete",
        defaultHint: "Identity information is complete according to the lab requirement.",
    },
    {
        key: "sample_type_matches",
        sectionKey: "identity",
        labelKey: "intakeChecklist.items.sample_type_matches.label",
        hintKey: "intakeChecklist.items.sample_type_matches.hint",
        defaultLabel: "Sample type matches request",
        defaultHint: "Sample type/container matches what was requested.",
    },

    // Volume / media
    {
        key: "volume_sufficient",
        sectionKey: "volume",
        labelKey: "intakeChecklist.items.volume_sufficient.label",
        hintKey: "intakeChecklist.items.volume_sufficient.hint",
        defaultLabel: "Volume sufficient",
        defaultHint: "Volume/amount is sufficient for the requested tests.",
    },
    {
        key: "vtm_present",
        sectionKey: "volume",
        labelKey: "intakeChecklist.items.vtm_present.label",
        hintKey: "intakeChecklist.items.vtm_present.hint",
        defaultLabel: "VTM/transport media present (if required)",
        defaultHint: "Transport media (e.g., VTM) is present when required by SOP.",
    },

    // Packing / transport
    {
        key: "packaging_intact",
        sectionKey: "packing",
        labelKey: "intakeChecklist.items.packaging_intact.label",
        hintKey: "intakeChecklist.items.packaging_intact.hint",
        defaultLabel: "Packaging intact & safe",
        defaultHint: "Secondary packaging is intact and protects sample integrity.",
    },
    {
        key: "triple_packaging",
        sectionKey: "packing",
        labelKey: "intakeChecklist.items.triple_packaging.label",
        hintKey: "intakeChecklist.items.triple_packaging.hint",
        defaultLabel: "Triple packaging applied (if required)",
        defaultHint: "Triple packaging is applied when required by SOP.",
    },
    {
        key: "temperature_condition_ok",
        sectionKey: "packing",
        labelKey: "intakeChecklist.items.temperature_condition_ok.label",
        hintKey: "intakeChecklist.items.temperature_condition_ok.hint",
        defaultLabel: "Temperature/transport condition OK",
        defaultHint: "Cooling/temperature control (ice pack/dry ice) meets storage requirements.",
    },

    // Supporting documents
    {
        key: "request_form_attached",
        sectionKey: "supportingDocs",
        labelKey: "intakeChecklist.items.request_form_attached.label",
        hintKey: "intakeChecklist.items.request_form_attached.hint",
        defaultLabel: "Request form attached",
        defaultHint: "Sample request form / sample list is attached and complete.",
    },
    {
        key: "chain_of_custody_attached",
        sectionKey: "supportingDocs",
        labelKey: "intakeChecklist.items.chain_of_custody_attached.label",
        hintKey: "intakeChecklist.items.chain_of_custody_attached.hint",
        defaultLabel: "Chain of custody attached (if used)",
        defaultHint: "Chain-of-custody form is attached if applicable.",
    },
    {
        key: "other_docs_complete",
        sectionKey: "supportingDocs",
        labelKey: "intakeChecklist.items.other_docs_complete.label",
        hintKey: "intakeChecklist.items.other_docs_complete.hint",
        defaultLabel: "Other supporting docs complete",
        defaultHint: "Any other required supporting documents are complete (if applicable).",
    },
];

function buildInitialState() {
    const decision: Record<string, Decision> = {};
    const reason: Record<string, string> = {};
    for (const row of CHECKLIST) {
        decision[row.key] = null;
        reason[row.key] = "";
    }
    return { decision, reason };
}

function buildSections(): ChecklistSection[] {
    const map = new Map<string, ChecklistRow[]>();
    for (const row of CHECKLIST) {
        if (!map.has(row.sectionKey)) map.set(row.sectionKey, []);
        map.get(row.sectionKey)!.push(row);
    }
    return Array.from(map.entries()).map(([sectionKey, rows]) => ({ sectionKey, rows }));
}

function computeProgress(decision: Record<string, Decision>) {
    const total = CHECKLIST.length;
    let decided = 0;
    let passed = 0;
    let failed = 0;

    for (const row of CHECKLIST) {
        const d = decision[row.key] ?? null;
        if (!d) continue;
        decided += 1;
        if (d === "pass") passed += 1;
        if (d === "fail") failed += 1;
    }

    return { total, decided, passed, failed };
}

function buildPayload(decision: Record<string, Decision>, reason: Record<string, string>, generalNote: string): IntakeChecklistPayload {
    const checks: Record<string, boolean> = {};
    const notesMap: Record<string, string | null> = {};

    for (const row of CHECKLIST) {
        const d = decision[row.key];
        checks[row.key] = d === "pass";
        const note = (reason[row.key] ?? "").trim();
        notesMap[row.key] = note ? note : null;
    }

    return {
        checks,
        notes: notesMap,
        items: CHECKLIST.map((c) => ({
            key: c.key,
            passed: decision[c.key] === "pass",
            note: (reason[c.key] ?? "").trim() ? (reason[c.key] ?? "").trim() : null,
        })),
        note: generalNote.trim() ? generalNote.trim() : null,
    };
}

export const IntakeChecklistModal = ({ open, onClose, sampleId, requestLabel, onSubmitted }: Props) => {
    const { t } = useTranslation();
    const sections = useMemo(() => buildSections(), []);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    const [{ decision, reason }, setState] = useState(() => buildInitialState());
    const [generalNote, setGeneralNote] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [formError, setFormError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const progress = useMemo(() => computeProgress(decision), [decision]);
    const anyFail = useMemo(() => CHECKLIST.some((c) => decision[c.key] === "fail"), [decision]);

    const progressRatio = progress.total > 0 ? Math.min(1, Math.max(0, progress.decided / progress.total)) : 0;

    const requestClose = () => {
        if (submitting) return;
        onClose();
    };

    useEffect(() => {
        if (!open) return;

        const init = buildInitialState();
        setState(init);
        setGeneralNote("");
        setFieldErrors({});
        setFormError(null);
        setSubmitError(null);
        setSubmitting(false);
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") requestClose();
        };

        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, submitting]);

    const validate = () => {
        const errs: Record<string, string> = {};

        for (const row of CHECKLIST) {
            const d = decision[row.key] ?? null;
            if (!d) {
                errs[row.key] = t("intakeChecklist.validation.pickDecision");
                continue;
            }
            if (d === "fail") {
                const r = (reason[row.key] ?? "").trim();
                if (!r) errs[row.key] = t("intakeChecklist.validation.failReasonRequired");
            }
        }

        setFieldErrors(errs);

        const ok = Object.keys(errs).length === 0;
        setFormError(ok ? null : t("intakeChecklist.validation.fixHighlighted"));

        if (!ok) {
            const firstKey = Object.keys(errs)[0];
            requestAnimationFrame(() => {
                const el = scrollRef.current?.querySelector(`[data-row="${firstKey}"]`) as HTMLElement | null;
                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        }

        return ok;
    };

    const setDecisionForKey = (key: string, d: Decision) => {
        setState((prev) => {
            const next = { ...prev, decision: { ...prev.decision, [key]: d } };
            if (d === "pass") {
                next.reason = { ...prev.reason, [key]: "" };
            }
            return next;
        });

        setFieldErrors((prev) => {
            const copy = { ...prev };
            delete copy[key];
            return copy;
        });
        setFormError(null);
    };

    const setReasonForKey = (key: string, value: string) => {
        setState((prev) => ({ ...prev, reason: { ...prev.reason, [key]: value } }));

        if (value.trim()) {
            setFieldErrors((prev) => {
                const copy = { ...prev };
                delete copy[key];
                return copy;
            });
            setFormError(null);
        }
    };

    const submit = async () => {
        if (submitting) return;

        setSubmitError(null);

        if (!validate()) return;

        try {
            setSubmitting(true);

            const payload = buildPayload(decision, reason, generalNote);
            await submitIntakeChecklist(sampleId, payload);

            requestClose();
            onSubmitted?.();
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                t("intakeChecklist.errors.submitFailed");
            setSubmitError(String(msg));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={requestClose} aria-hidden="true" />

            <div
                className="relative w-[92vw] max-w-3xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-gray-50">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white">
                                <ClipboardCheck size={18} />
                            </span>

                            <div className="min-w-0">
                                <h2 className="text-sm font-bold text-gray-900">{t("intakeChecklist.title")}</h2>

                                <p className="text-xs text-gray-600 mt-0.5">
                                    {requestLabel ? <span className="font-semibold">{requestLabel}</span> : null}
                                    {requestLabel ? <span className="text-gray-400"> • </span> : null}
                                    {t("intakeChecklist.subtitle")}
                                </p>

                                <div className="mt-2">
                                    <div className="flex items-center justify-between text-[11px] text-gray-500">
                                        <span>
                                            {t("intakeChecklist.progress", {
                                                decided: progress.decided,
                                                total: progress.total,
                                                passed: progress.passed,
                                                failed: progress.failed,
                                            })}
                                        </span>
                                        <span className="tabular-nums">{Math.round(progressRatio * 100)}%</span>
                                    </div>

                                    <div className="mt-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                                        <div className="h-full bg-primary" style={{ width: `${progressRatio * 100}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className={cx("lims-icon-button", submitting && "opacity-60 cursor-not-allowed")}
                        onClick={requestClose}
                        aria-label={t("close")}
                        disabled={submitting}
                        title={t("close")}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div ref={scrollRef} className="px-6 py-5 overflow-auto">
                    {formError ? (
                        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl mb-4 inline-flex items-start gap-2">
                            <AlertTriangle size={16} className="mt-0.5" />
                            <div>{formError}</div>
                        </div>
                    ) : null}

                    {submitError ? (
                        <div className="text-sm text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">
                            {submitError}
                        </div>
                    ) : null}

                    <div className="space-y-6">
                        {sections.map((sec) => (
                            <div key={sec.sectionKey}>
                                <div className="px-1">
                                    <div className="text-xs font-semibold text-gray-700">
                                        {t(`intakeChecklist.sections.${sec.sectionKey}`)}
                                    </div>
                                    <div className="h-px bg-gray-100 mt-2" />
                                </div>

                                <div className="mt-3 space-y-3">
                                    {sec.rows.map((row) => {
                                        const d = decision[row.key] ?? null;
                                        const isFail = d === "fail";
                                        const err = fieldErrors[row.key];

                                        const label = t(row.labelKey, { defaultValue: row.defaultLabel });
                                        const hint = row.hintKey ? t(row.hintKey, { defaultValue: row.defaultHint ?? "" }) : "";

                                        return (
                                            <div
                                                key={row.key}
                                                data-row={row.key}
                                                className={cx(
                                                    "rounded-2xl border p-4",
                                                    err ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white"
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-gray-900">{label}</div>
                                                        {hint ? <div className="text-xs text-gray-500 mt-0.5">{hint}</div> : null}
                                                        {err ? <div className="text-xs text-red-700 mt-2">{err}</div> : null}
                                                    </div>

                                                    <div className="shrink-0 inline-flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden">
                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                "px-3 py-2 text-xs font-semibold inline-flex items-center gap-2",
                                                                d === "pass" ? "bg-emerald-50 text-emerald-700" : "text-gray-600 hover:text-gray-800"
                                                            )}
                                                            onClick={() => setDecisionForKey(row.key, "pass")}
                                                            disabled={submitting}
                                                            aria-pressed={d === "pass"}
                                                        >
                                                            <CheckCircle2 size={14} />
                                                            {t("intakeChecklist.actions.pass")}
                                                        </button>

                                                        <div className="w-px h-6 bg-gray-200" />

                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                "px-3 py-2 text-xs font-semibold inline-flex items-center gap-2",
                                                                d === "fail" ? "bg-red-50 text-red-700" : "text-gray-600 hover:text-gray-800"
                                                            )}
                                                            onClick={() => setDecisionForKey(row.key, "fail")}
                                                            disabled={submitting}
                                                            aria-pressed={d === "fail"}
                                                        >
                                                            <XCircle size={14} />
                                                            {t("intakeChecklist.actions.fail")}
                                                        </button>
                                                    </div>
                                                </div>

                                                {isFail ? (
                                                    <div className="mt-3">
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                                            {t("intakeChecklist.reason.label")}
                                                        </label>
                                                        <input
                                                            value={reason[row.key] ?? ""}
                                                            onChange={(e) => setReasonForKey(row.key, e.target.value)}
                                                            placeholder={t("intakeChecklist.reason.placeholder")}
                                                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                            disabled={submitting}
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6">
                        <label className="block text-xs font-medium text-gray-700 mb-1">{t("intakeChecklist.generalNote.label")}</label>
                        <textarea
                            value={generalNote}
                            onChange={(e) => setGeneralNote(e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            placeholder={t("intakeChecklist.generalNote.placeholder")}
                            disabled={submitting}
                        />
                    </div>

                    {anyFail ? (
                        <div className="mt-4 text-xs text-amber-900 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl inline-flex items-start gap-2">
                            <AlertTriangle size={16} className="mt-0.5" />
                            <div>
                                {t("intakeChecklist.warning.anyFail", {
                                    status: t("requestStatus.inspectionFailed", { defaultValue: "Inspection failed" }),
                                })}
                            </div>
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="shrink-0 px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="btn-outline" onClick={requestClose} disabled={submitting}>
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        className={cx("lims-btn-primary inline-flex items-center gap-2", submitting && "opacity-60 cursor-not-allowed")}
                        onClick={submit}
                        disabled={submitting}
                        title={progress.decided < progress.total ? t("intakeChecklist.validation.incompleteTooltip") : t("intakeChecklist.actions.submit")}
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                        {submitting ? t("intakeChecklist.actions.submitting") : t("intakeChecklist.actions.submit")}
                    </button>
                </div>
            </div>
        </div>
    );
};