import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, Truck, Hand } from "lucide-react";
import type { Sample } from "../../../services/samples";
import { ROLE_ID } from "../../../utils/roles";
import { formatDateTimeLocal } from "../../../utils/date";
import { sampleService } from "../../../services/samples";

type Props = {
    sample: Sample;
    roleId?: number | null;
    canDoCrosscheck: boolean;
    onWorkflowChanged?: () => void;
    apiPatch: (url: string, body: any) => Promise<any>;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function normalizeLabel(input?: string | null) {
    const s = String(input ?? "").trim();
    if (!s) return "-";
    if (s.includes("-") && /[A-Za-z]/.test(s) && /\d/.test(s)) return s;

    return s
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function SampleWorkflowTab({ sample, roleId, canDoCrosscheck, onWorkflowChanged, apiPatch }: Props) {
    const { t } = useTranslation();
    const s: any = sample;

    const isCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const isAnalyst = roleId === ROLE_ID.ANALYST;

    const labCode = String(s?.lab_sample_code ?? "").trim();
    const expectedLabCode = labCode;

    const scDeliveredToAnalystAt = s?.sc_delivered_to_analyst_at ?? null;
    const analystReceivedAt = s?.analyst_received_at ?? null;

    const crossStatusRaw = String(s?.crosscheck_status ?? "pending").trim().toLowerCase();
    const crossStatusLabel = normalizeLabel(crossStatusRaw);
    const crossAt = s?.crosschecked_at ?? null;
    const crossSavedPhysical = s?.physical_label_code ?? null;
    const crossSavedNote = s?.crosscheck_note ?? null;

    const isCrossPassed = crossStatusRaw === "passed";
    const showCrosscheck = !isCrossPassed;

    const [wfBusy, setWfBusy] = useState(false);
    const [wfError, setWfError] = useState<string | null>(null);

    const [ccBusy, setCcBusy] = useState(false);
    const [ccError, setCcError] = useState<string | null>(null);
    const [ccPhysicalCode, setCcPhysicalCode] = useState<string>("");
    const [ccReason, setCcReason] = useState<string>("");

    useEffect(() => {
        const existing = String(s?.physical_label_code ?? "");
        setCcPhysicalCode((prev) => (prev && prev.trim() ? prev : existing));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [s?.physical_label_code]);

    const canWfScDeliverToAnalyst = isCollector && !scDeliveredToAnalystAt;
    const canWfAnalystReceive = isAnalyst && !!scDeliveredToAnalystAt && !analystReceivedAt;

    const doPhysicalWorkflow = async (action: string) => {
        const sampleId = Number(s?.sample_id ?? 0);
        if (!sampleId) return;

        try {
            setWfBusy(true);
            setWfError(null);

            await apiPatch(`/v1/samples/${sampleId}/physical-workflow`, { action, note: null });
            onWorkflowChanged?.();
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                t("samples.workflow.workflowUpdateFailed");
            setWfError(msg);
        } finally {
            setWfBusy(false);
        }
    };

    const crosscheckTone = useMemo(() => {
        if (crossStatusRaw === "failed") return "border-red-200 bg-red-50 text-red-700";
        if (crossStatusRaw === "passed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
        return "border-slate-200 bg-slate-50 text-slate-700";
    }, [crossStatusRaw]);

    const submitCrosscheck = async (mode: "pass" | "fail") => {
        const sampleId = Number(s?.sample_id ?? 0);
        if (!sampleId) return;

        const enteredRaw = String(ccPhysicalCode ?? "");
        const entered = enteredRaw.trim().toUpperCase();
        const expected = String(expectedLabCode ?? "").trim().toUpperCase();

        setCcError(null);

        if (!entered) {
            setCcError(t("samples.workflow.physicalLabelRequired"));
            return;
        }
        if (!expected) {
            setCcError(t("samples.workflow.expectedLabCodeMissing"));
            return;
        }

        const isMatch = entered === expected;

        if (mode === "pass") {
            if (!isMatch) {
                setCcError(t("samples.workflow.mismatchUseFail"));
                return;
            }
        } else {
            const note = String(ccReason ?? "").trim();
            if (isMatch) {
                setCcError(t("samples.workflow.codesMatchUsePass"));
                return;
            }
            if (!note) {
                setCcError(t("samples.workflow.failReasonRequired"));
                return;
            }
        }

        try {
            setCcBusy(true);

            await sampleService.submitCrosscheck(sampleId, {
                physical_label_code: enteredRaw,
                note: mode === "fail" ? String(ccReason ?? "").trim() : null,
            });

            setCcReason("");
            onWorkflowChanged?.();
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.response?.data?.message ??
                err?.data?.error ??
                err?.message ??
                t("samples.workflow.submitCrosscheckFailed");
            setCcError(msg);
        } finally {
            setCcBusy(false);
        }
    };

    const entered = String(ccPhysicalCode ?? "").trim().toUpperCase();
    const expected = String(expectedLabCode ?? "").trim().toUpperCase();
    const codesMatch = !!entered && !!expected && entered === expected;

    const passDisabled = !canDoCrosscheck || ccBusy || !entered || !expected || !codesMatch;
    const failDisabled = !canDoCrosscheck || ccBusy || !entered || !expected || codesMatch;

    return (
        <div className="space-y-6">
            {/* Physical Workflow */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="text-sm font-bold text-gray-900">{t("samples.workflow.physicalTitle")}</div>
                </div>

                <div className="px-5 py-4">
                    {wfError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                            {wfError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="text-xs text-gray-500">{t("samples.workflow.deliveredToAnalyst")}</div>
                            <div className="font-semibold text-gray-900 mt-0.5">
                                {scDeliveredToAnalystAt ? formatDateTimeLocal(scDeliveredToAnalystAt) : "—"}
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="text-xs text-gray-500">{t("samples.workflow.analystReceived")}</div>
                            <div className="font-semibold text-gray-900 mt-0.5">
                                {analystReceivedAt ? formatDateTimeLocal(analystReceivedAt) : "—"}
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                        {isCollector ? (
                            <button
                                type="button"
                                className={cx(
                                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                    "border-gray-200 bg-white hover:bg-gray-50",
                                    (!canWfScDeliverToAnalyst || wfBusy) && "opacity-50 cursor-not-allowed"
                                )}
                                disabled={!canWfScDeliverToAnalyst || wfBusy}
                                onClick={() => doPhysicalWorkflow("sc_delivered_to_analyst")}
                                title={t("samples.workflow.deliver")}
                                aria-label={t("samples.workflow.deliver")}
                            >
                                <Truck size={16} />
                                {wfBusy ? t("processing") : t("samples.workflow.deliver")}
                            </button>
                        ) : null}

                        {isAnalyst ? (
                            <button
                                type="button"
                                className={cx(
                                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                    "border-gray-200 bg-white hover:bg-gray-50",
                                    (!canWfAnalystReceive || wfBusy) && "opacity-50 cursor-not-allowed"
                                )}
                                disabled={!canWfAnalystReceive || wfBusy}
                                onClick={() => doPhysicalWorkflow("analyst_received")}
                                title={t("samples.workflow.receive")}
                                aria-label={t("samples.workflow.receive")}
                            >
                                <Hand size={16} />
                                {wfBusy ? t("processing") : t("samples.workflow.receive")}
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Crosscheck compact card when PASSED */}
            {isCrossPassed ? (
                <div className="rounded-2xl border border-emerald-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                    <div className="px-5 py-3 border-b border-emerald-100 bg-emerald-50 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-sm font-bold text-emerald-900">{t("samples.workflow.crosscheckTitle")}</div>

                        <span
                            className={cx(
                                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border",
                                "border-emerald-200 bg-white text-emerald-700"
                            )}
                        >
                            <CheckCircle2 size={16} />
                            {t("samples.workflow.passed")}
                            {crossAt ? (
                                <span className="text-[11px] font-normal opacity-80">
                                    • {formatDateTimeLocal(crossAt)}
                                </span>
                            ) : null}
                        </span>
                    </div>

                    <div className="px-5 py-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                <div className="text-xs text-gray-500">{t("samples.workflow.expectedLabCode")}</div>
                                <div className="font-mono text-xs mt-1">{labCode || "—"}</div>
                            </div>

                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                <div className="text-xs text-gray-500">{t("samples.workflow.lastSubmittedLabel")}</div>
                                <div className="font-mono text-xs mt-1">
                                    {crossSavedPhysical ? String(crossSavedPhysical) : "—"}
                                </div>
                            </div>
                        </div>

                        {crossSavedNote ? (
                            <div className="mt-3 text-xs text-gray-600">
                                {t("samples.workflow.note")}: <span className="font-medium">{String(crossSavedNote)}</span>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}

            {/* Crosscheck full form */}
            {showCrosscheck ? (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <div className="text-sm font-bold text-gray-900">{t("samples.workflow.crosscheckTitle")}</div>
                            <div className="text-xs text-gray-500 mt-1">{t("samples.workflow.crosscheckSubtitle")}</div>
                        </div>

                        <span
                            className={cx(
                                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border",
                                crosscheckTone
                            )}
                        >
                            {crossStatusRaw === "failed" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                            {crossStatusLabel}
                            {crossAt ? (
                                <span className="text-[11px] font-normal opacity-80">
                                    • {formatDateTimeLocal(crossAt)}
                                </span>
                            ) : null}
                        </span>
                    </div>

                    <div className="px-5 py-4">
                        {ccError && (
                            <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                                {ccError}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                <div className="text-xs text-gray-500">{t("samples.workflow.expectedLabCode")}</div>
                                <div className="font-mono text-xs mt-1">{labCode || "—"}</div>

                                <div className="mt-3 text-xs text-gray-500">{t("samples.workflow.lastSubmittedLabel")}</div>
                                <div className="font-mono text-xs mt-1">
                                    {crossSavedPhysical ? String(crossSavedPhysical) : "—"}
                                </div>

                                {crossSavedNote ? (
                                    <div className="mt-3 text-xs text-gray-600">
                                        {t("samples.workflow.note")}: <span className="font-medium">{String(crossSavedNote)}</span>
                                    </div>
                                ) : null}
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500">{t("samples.workflow.physicalLabelCode")}</label>
                                <input
                                    value={ccPhysicalCode}
                                    onChange={(e) => setCcPhysicalCode(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    placeholder={t("samples.workflow.labelPlaceholder")}
                                    disabled={!canDoCrosscheck || ccBusy}
                                />

                                <label className="block text-xs text-gray-500 mt-3">{t("samples.workflow.reasonForFail")}</label>
                                <textarea
                                    value={ccReason}
                                    onChange={(e) => setCcReason(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-24 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    placeholder={t("samples.workflow.reasonPlaceholder")}
                                    disabled={!canDoCrosscheck || ccBusy}
                                />

                                <div className="mt-3 text-[11px] text-gray-500">
                                    {entered && expected ? (
                                        codesMatch
                                            ? t("samples.workflow.codesMatchHint")
                                            : t("samples.workflow.codesMismatchHint")
                                    ) : t("samples.workflow.enterBothCodesHint")}
                                </div>

                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        type="button"
                                        className={cx(
                                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                            "border-emerald-200 bg-emerald-50 text-emerald-800 hover:opacity-90",
                                            passDisabled && "opacity-50 cursor-not-allowed"
                                        )}
                                        disabled={passDisabled}
                                        onClick={() => submitCrosscheck("pass")}
                                        aria-label={t("samples.workflow.pass")}
                                        title={t("samples.workflow.pass")}
                                    >
                                        <CheckCircle2 size={16} />
                                        {ccBusy ? t("processing") : t("samples.workflow.pass")}
                                    </button>

                                    <button
                                        type="button"
                                        className={cx(
                                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                            "border-red-200 bg-red-50 text-red-700 hover:opacity-90",
                                            failDisabled && "opacity-50 cursor-not-allowed"
                                        )}
                                        disabled={failDisabled}
                                        onClick={() => submitCrosscheck("fail")}
                                        aria-label={t("samples.workflow.fail")}
                                        title={t("samples.workflow.fail")}
                                    >
                                        <XCircle size={16} />
                                        {ccBusy ? t("processing") : t("samples.workflow.fail")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
