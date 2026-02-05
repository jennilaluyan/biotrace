import { useEffect, useMemo, useState } from "react";
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

// local UI helpers (no external ./ui import)
function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function normalizeLabel(input?: string | null) {
    const s = String(input ?? "").trim();
    if (!s) return "-";
    if (s.includes("-") && /[A-Za-z]/.test(s) && /\d/.test(s)) return s; // keep codes like BML-034

    return s
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function SampleWorkflowTab({ sample, roleId, canDoCrosscheck, onWorkflowChanged, apiPatch }: Props) {
    const s: any = sample;

    const isCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const isAnalyst = roleId === ROLE_ID.ANALYST;

    const labCode = String(s?.lab_sample_code ?? "").trim();
    const expectedLabCode = labCode;

    const scDeliveredToAnalystAt = s?.sc_delivered_to_analyst_at ?? null;
    const analystReceivedAt = s?.analyst_received_at ?? null;

    const crossStatus = normalizeLabel(s?.crosscheck_status ?? "pending");
    const crossAt = s?.crosschecked_at ?? null;
    const crossSavedPhysical = s?.physical_label_code ?? null;
    const crossSavedNote = s?.crosscheck_note ?? null;

    const showCrosscheck = crossStatus !== "passed"; // ✅ hide when passed

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
                "Failed to update workflow.";
            setWfError(msg);
        } finally {
            setWfBusy(false);
        }
    };

    const crosscheckTone = useMemo(() => {
        if (crossStatus === "failed") return "border-red-200 bg-red-50 text-red-700";
        if (crossStatus === "passed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
        return "border-slate-200 bg-slate-50 text-slate-700";
    }, [crossStatus]);

    const submitCrosscheck = async (mode: "pass" | "fail") => {
        const sampleId = Number(s?.sample_id ?? 0);
        if (!sampleId) return;

        const enteredRaw = String(ccPhysicalCode ?? "");
        const entered = enteredRaw.trim().toUpperCase();
        const expected = String(expectedLabCode ?? "").trim().toUpperCase();

        setCcError(null);

        if (!entered) {
            setCcError("Physical label code is required.");
            return;
        }
        if (!expected) {
            setCcError("Expected lab code is missing.");
            return;
        }

        const isMatch = entered === expected;

        if (mode === "pass") {
            if (!isMatch) {
                setCcError("Mismatch. Use FAIL and add a reason.");
                return;
            }
        } else {
            const note = String(ccReason ?? "").trim();
            if (isMatch) {
                setCcError("Codes match. Use PASS.");
                return;
            }
            if (!note) {
                setCcError("Reason is required for FAIL.");
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
                "Failed to submit crosscheck.";
            setCcError(msg);
        } finally {
            setCcBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Physical Workflow */}
            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="text-sm font-bold text-gray-900">Physical workflow</div>
                </div>

                <div className="px-5 py-4">
                    {wfError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                            {wfError}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="text-xs text-gray-500">Delivered to analyst</div>
                            <div className="font-semibold text-gray-900 mt-0.5">
                                {scDeliveredToAnalystAt ? formatDateTimeLocal(scDeliveredToAnalystAt) : "—"}
                            </div>
                        </div>

                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                            <div className="text-xs text-gray-500">Analyst received</div>
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
                                title="Mark delivered"
                                aria-label="Delivered to analyst"
                            >
                                <Truck size={16} />
                                Deliver
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
                                title="Mark received"
                                aria-label="Analyst received"
                            >
                                <Hand size={16} />
                                Receive
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Crosscheck (hidden if passed) */}
            {showCrosscheck ? (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <div className="text-sm font-bold text-gray-900">Crosscheck</div>
                            <div className="text-xs text-gray-500 mt-1">Match lab code with physical label.</div>
                        </div>

                        <span className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border", crosscheckTone)}>
                            {crossStatus === "failed" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
                            {crossStatus}
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
                                <div className="text-xs text-gray-500">Expected lab code</div>
                                <div className="font-mono text-xs mt-1">{labCode || "—"}</div>

                                <div className="mt-3 text-xs text-gray-500">Last submitted label</div>
                                <div className="font-mono text-xs mt-1">{crossSavedPhysical ? String(crossSavedPhysical) : "—"}</div>

                                {crossSavedNote ? (
                                    <div className="mt-3 text-xs text-gray-600">
                                        note: <span className="font-medium">{String(crossSavedNote)}</span>
                                    </div>
                                ) : null}
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500">Physical label code</label>
                                <input
                                    value={ccPhysicalCode}
                                    onChange={(e) => setCcPhysicalCode(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    placeholder="Type label code…"
                                    disabled={!canDoCrosscheck || ccBusy}
                                />

                                <label className="block text-xs text-gray-500 mt-3">Reason (for fail)</label>
                                <textarea
                                    value={ccReason}
                                    onChange={(e) => setCcReason(e.target.value)}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-24 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    placeholder="Explain mismatch…"
                                    disabled={!canDoCrosscheck || ccBusy}
                                />

                                <div className="mt-3 flex items-center gap-2">
                                    <button
                                        type="button"
                                        className={cx(
                                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                            "border-emerald-200 bg-emerald-50 text-emerald-800 hover:opacity-90",
                                            (!canDoCrosscheck || ccBusy) && "opacity-50 cursor-not-allowed"
                                        )}
                                        disabled={!canDoCrosscheck || ccBusy}
                                        onClick={() => submitCrosscheck("pass")}
                                        aria-label="Pass"
                                        title="Pass"
                                    >
                                        <CheckCircle2 size={16} />
                                        Pass
                                    </button>

                                    <button
                                        type="button"
                                        className={cx(
                                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                            "border-red-200 bg-red-50 text-red-700 hover:opacity-90",
                                            (!canDoCrosscheck || ccBusy) && "opacity-50 cursor-not-allowed"
                                        )}
                                        disabled={!canDoCrosscheck || ccBusy}
                                        onClick={() => submitCrosscheck("fail")}
                                        aria-label="Fail"
                                        title="Fail"
                                    >
                                        <XCircle size={16} />
                                        Fail
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
