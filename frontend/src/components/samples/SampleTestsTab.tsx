import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes } from "react";

import { apiGet } from "../../services/api";
import { formatDateTimeLocal } from "../../utils/date";

import { AddSampleTestsModal } from "../sampleTests/AddSampleTestsModal";
import { ResultEntryModal } from "../sampleTests/ResultEntryModal";
import { ReagentCalculationPanel } from "../sampleTests/ReagentCalculationPanel";
import { BulkVerifyValidateBar } from "../sampleTests/BulkVerifyValidateBar";
import { EnterQcModal } from "../qc/EnterQcModal";

import {
    updateSampleTestStatus,
    verifySampleTest,
    validateSampleTest,
    runSerial,
} from "../../services/sampleTests";
import { getQcSummary, type QcSummaryResponse } from "../../services/qc";
import { ROLE_ID } from "../../utils/roles";

/* ----------------------------- Types (ringan) ----------------------------- */
type StaffLite = {
    staff_id: number;
    name?: string | null;
    email?: string | null;
    role_id?: number | null;
    is_active?: boolean | null;
};

type ParameterLite = {
    parameter_id: number;
    code?: string | null;
    name?: string | null;
    unit?: string | null;
    unit_id?: number | null;
    method_ref?: string | null;
    status?: string | null;
    tag?: string | null;
};

type MethodLite = {
    method_id: number;
    code?: string | null;
    name?: string | null;
    description?: string | null;
    is_active?: boolean | null;
};

type TestResultLite = {
    result_id: number;
    sample_test_id: number;
    value_raw?: string | number | null;
    value_final?: string | number | null;
    unit_id?: number | null;
    flags?: any;
    version_no?: number | null;
    created_by?: number | null;
    created_at?: string | null;
    updated_at?: string | null;
};

type SampleTestStatus =
    | "draft"
    | "in_progress"
    | "measured"
    | "failed"
    | "verified"
    | "validated";

type AdvanceStatus = "in_progress" | "measured" | "failed";

type SampleTestRow = {
    sample_test_id: number;
    sample_id: number;
    parameter_id: number;
    method_id: number;
    assigned_to?: number | null;
    status: SampleTestStatus;
    started_at?: string | null;
    completed_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    parameter?: ParameterLite | null;
    method?: MethodLite | null;
    assignee?: StaffLite | null;
    latest_result?: TestResultLite | null;
};

type Paginator<T> = {
    current_page: number;
    data: T[];
    last_page?: number;
    per_page: number;
    total: number;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function StatusPill({ value }: { value?: string | null }) {
    const v = (value ?? "-").toLowerCase();
    const tones: Record<string, string> = {
        draft: "bg-slate-100 text-slate-700 border-slate-200",
        in_progress: "bg-blue-50 text-blue-700 border-blue-200",
        measured: "bg-emerald-50 text-emerald-700 border-emerald-200",
        failed: "bg-red-50 text-red-700 border-red-200",
        verified: "bg-purple-50 text-purple-700 border-purple-200",
        validated: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
    const tone = tones[v] || "bg-gray-50 text-gray-600 border-gray-200";

    return (
        <span className={cx("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border", tone)}>
            {value ?? "-"}
        </span>
    );
}

function SmallPrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    const { className, ...rest } = props;
    return (
        <button
            {...rest}
            className={cx(
                "lims-btn-primary",
                "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap",
                rest.disabled ? "opacity-60 cursor-not-allowed" : "",
                className
            )}
        />
    );
}

function SmallButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    const { className, ...rest } = props;
    return (
        <button
            {...rest}
            className={cx(
                "lims-btn",
                "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap",
                rest.disabled ? "opacity-60 cursor-not-allowed" : "",
                className
            )}
        />
    );
}

function IconRefresh({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={cx("h-4 w-4", className)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M21 12a9 9 0 0 1-15.4 6.4" />
            <path d="M3 12a9 9 0 0 1 15.4-6.4" />
            <path d="M3 18v-5h5" />
            <path d="M21 6v5h-5" />
        </svg>
    );
}

type Props = {
    sampleId: number;
    roleId: number | null;
    sample?: any;
    defaultAssignedTo?: number | null;
};

export const SampleTestsTab = ({
    sampleId,
    roleId,
    sample,
    defaultAssignedTo = null,
}: Props) => {
    const [testsPager, setTestsPager] = useState<Paginator<SampleTestRow> | null>(null);
    const [testsLoading, setTestsLoading] = useState(false);
    const [testsError, setTestsError] = useState<string | null>(null);
    const [testsPage, setTestsPage] = useState(1);
    const [testsStatus, setTestsStatus] = useState<string>("");

    const [openAddTests, setOpenAddTests] = useState(false);
    const [reagentRefreshKey, setReagentRefreshKey] = useState(0);

    const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
    const [statusActionError, setStatusActionError] = useState<string | null>(null);

    const [resultRow, setResultRow] = useState<SampleTestRow | null>(null);
    const [openResultModal, setOpenResultModal] = useState(false);

    const [qc, setQc] = useState<QcSummaryResponse | null>(null);
    const [qcLoading, setQcLoading] = useState(false);
    const [qcError, setQcError] = useState<string | null>(null);
    const [openQcModal, setOpenQcModal] = useState(false);

    const qcStatus = String(qc?.summary?.status ?? "").toLowerCase();
    const qcCounts = qc?.summary?.counts ?? { pass: 0, warning: 0, fail: 0 };
    const qcIsFail = qcStatus === "fail";
    const qcIsWarning = qcStatus === "warning";
    const qcIsPass = qcStatus === "pass";

    const isOM = roleId === ROLE_ID.OPERATIONAL_MANAGER;
    const isLH = roleId === ROLE_ID.LAB_HEAD;

    const canUpdateTestStatus = roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.ANALYST;
    const canAddTests = roleId === ROLE_ID.ANALYST;
    const canEnterQc =
        roleId === ROLE_ID.ADMIN ||
        roleId === ROLE_ID.ANALYST ||
        roleId === ROLE_ID.OPERATIONAL_MANAGER ||
        roleId === ROLE_ID.LAB_HEAD;

    const tests = testsPager?.data ?? [];
    const totalTests = testsPager?.total ?? tests.length;

    const eligibleIds = useMemo(() => {
        if (!tests || tests.length === 0) return [];
        if (isOM) return tests.filter((t) => t.status === "measured").map((t) => t.sample_test_id);
        if (isLH) return tests.filter((t) => t.status === "verified").map((t) => t.sample_test_id);
        return [];
    }, [tests, isOM, isLH]);

    const [bulkSelectedIds, setBulkSelectedIds] = useState<number[]>([]);
    const [bulkRunning, setBulkRunning] = useState(false);

    const selectedEligibleIds = useMemo(() => {
        const eligibleSet = new Set(eligibleIds);
        return bulkSelectedIds.filter((id) => eligibleSet.has(id));
    }, [bulkSelectedIds, eligibleIds]);

    function toggleOne(id: number) {
        setBulkSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }

    function toggleAllEligible() {
        setBulkSelectedIds((prev) => {
            const prevSet = new Set(prev);
            const allSelected = eligibleIds.length > 0 && eligibleIds.every((id) => prevSet.has(id));
            return allSelected ? [] : [...eligibleIds];
        });
    }

    function clearBulkSelection() {
        setBulkSelectedIds([]);
    }

    const openResult = (t: SampleTestRow) => {
        setResultRow(t);
        setOpenResultModal(true);
    };

    const closeResult = () => {
        setOpenResultModal(false);
        setResultRow(null);
    };

    const resultHeaderLine = useMemo(() => {
        if (!resultRow) return undefined;
        const pname = resultRow.parameter?.name ?? `Parameter #${resultRow.parameter_id}`;
        const mname = resultRow.method?.name ?? `Method #${resultRow.method_id}`;
        return `${pname} • ${mname} • Status: ${resultRow.status}`;
    }, [resultRow]);

    const loadTests = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setTestsLoading(true);
            setTestsError(null);

            const qs = new URLSearchParams();
            qs.set("page", String(testsPage));
            qs.set("per_page", "50");
            if (testsStatus) qs.set("status", testsStatus);

            const res = await apiGet<any>(`/v1/samples/${sampleId}/sample-tests?${qs.toString()}`);
            const pager: Paginator<SampleTestRow> = res?.data ?? res;
            setTestsPager(pager);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to load sample tests.";
            setTestsError(msg);
        } finally {
            setTestsLoading(false);
        }
    };

    const loadQc = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        try {
            setQcLoading(true);
            setQcError(null);
            const data = await getQcSummary(sampleId);
            setQc(data);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to load QC summary.";
            setQcError(msg);
            setQc(null);
        } finally {
            setQcLoading(false);
        }
    };

    useEffect(() => {
        loadTests();
        loadQc();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, testsPage, testsStatus]);

    const changeStatus = async (sampleTestId: number, nextStatus: AdvanceStatus) => {
        try {
            setStatusUpdatingId(sampleTestId);
            setStatusActionError(null);

            await updateSampleTestStatus(sampleTestId, nextStatus);
            await loadTests();
            setReagentRefreshKey((k) => k + 1);
            await loadQc();
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.response?.data?.errors?.status?.[0] ??
                err?.data?.message ??
                err?.message ??
                "Failed to update test status.";
            setStatusActionError(msg);
        } finally {
            setStatusUpdatingId(null);
        }
    };

    async function runBulkAction(note?: string) {
        const ids = selectedEligibleIds;
        if (ids.length === 0) return;

        setBulkRunning(true);
        setStatusActionError(null);

        try {
            if (isOM) {
                await runSerial(ids, (id) => verifySampleTest(id, note));
            } else if (isLH) {
                await runSerial(ids, (id) => validateSampleTest(id, note));
            }

            await loadTests();
            await loadQc();
            setReagentRefreshKey((k) => k + 1);

            setBulkSelectedIds([]);
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.response?.data?.error ??
                err?.data?.message ??
                err?.message ??
                "Bulk action failed.";
            setStatusActionError(msg);
        } finally {
            setBulkRunning(false);
        }
    }

    const qcBannerTone = qcIsFail
        ? "border-red-200 bg-red-50 text-red-900"
        : qcIsWarning
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : qcIsPass
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-gray-200 bg-gray-50 text-gray-900";

    const qcBannerTitle = qcIsFail
        ? "QC: FAIL — Blocked"
        : qcIsWarning
            ? "QC: WARNING"
            : qcIsPass
                ? "QC: PASS"
                : "QC: Not available";

    const qcBannerSub = qcIsFail
        ? "Status advance is disabled until QC is resolved (backend tetap source of truth)."
        : qcIsWarning
            ? "Proceed with caution. Review QC runs."
            : qcIsPass
                ? "All good."
                : "No QC summary yet (or QC has not been entered).";

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-semibold text-gray-900">Tests</div>
                    <div className="text-xs text-gray-500 mt-1">
                        {testsLoading ? "Loading tests..." : `${totalTests} test(s)`}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Status</span>
                        <select
                            className="border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            value={testsStatus}
                            onChange={(e) => {
                                setTestsPage(1);
                                setTestsStatus(e.target.value);
                            }}
                        >
                            <option value="">All</option>
                            <option value="draft">draft</option>
                            <option value="in_progress">in_progress</option>
                            <option value="measured">measured</option>
                            <option value="failed">failed</option>
                            <option value="verified">verified</option>
                            <option value="validated">validated</option>
                        </select>
                    </div>

                    <SmallButton
                        type="button"
                        onClick={() => {
                            loadTests();
                            loadQc();
                        }}
                        disabled={testsLoading || qcLoading}
                        className="flex items-center gap-2"
                    >
                        <IconRefresh />
                        {testsLoading || qcLoading ? "Refreshing..." : "Refresh"}
                    </SmallButton>

                    {canEnterQc && (
                        <SmallPrimaryButton type="button" onClick={() => setOpenQcModal(true)} title="Enter QC run">
                            Enter QC
                        </SmallPrimaryButton>
                    )}
                </div>
            </div>

            {/* QC Banner */}
            <div className={cx("rounded-2xl border px-4 py-4", qcBannerTone)}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="text-sm font-extrabold">{qcBannerTitle}</div>
                        <div className="text-xs opacity-90 mt-1">{qcBannerSub}</div>

                        <div className="mt-2 text-xs">
                            <span className="font-semibold">Counts:</span>{" "}
                            <span className="font-mono">
                                pass={qcCounts.pass ?? 0} • warning={qcCounts.warning ?? 0} • fail={qcCounts.fail ?? 0}
                            </span>
                        </div>

                        {qcError && <div className="mt-2 text-xs text-red-800">QC error: {qcError}</div>}
                    </div>

                    <div className="flex items-center gap-2">
                        <SmallButton
                            type="button"
                            onClick={loadQc}
                            disabled={qcLoading}
                            className="flex items-center gap-2"
                            title="Refresh QC summary"
                        >
                            <IconRefresh />
                            {qcLoading ? "Loading..." : "QC Refresh"}
                        </SmallButton>
                    </div>
                </div>

                {qcIsFail && (
                    <div className="mt-3 text-xs font-semibold">
                        ⛔ Blocked: advance status buttons are disabled while QC is FAIL.
                    </div>
                )}
            </div>

            {testsError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                    {testsError}
                </div>
            )}

            {statusActionError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                    {statusActionError}
                </div>
            )}

            {!testsLoading && !testsError && (
                <ReagentCalculationPanel sampleId={sampleId} refreshKey={reagentRefreshKey} />
            )}

            {/* Bulk bar */}
            {(isOM || isLH) && eligibleIds.length > 0 && !testsLoading && !testsError && (
                <BulkVerifyValidateBar
                    mode={isOM ? "verify" : "validate"}
                    eligibleCount={eligibleIds.length}
                    selectedCount={selectedEligibleIds.length}
                    running={bulkRunning}
                    onToggleAll={toggleAllEligible}
                    onClear={clearBulkSelection}
                    onRun={runBulkAction}
                />
            )}

            {/* Table */}
            {!testsLoading && !testsError && tests.length === 0 && (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                    No tests yet. {canAddTests ? "Click Add Tests (LoA must be locked)." : "(No permission.)"}
                </div>
            )}

            {!testsLoading && !testsError && tests.length > 0 && (
                <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-sm font-semibold text-gray-900">Sample Tests</div>
                        <div className="text-xs text-gray-500">
                            Page {testsPager?.current_page ?? 1} • Total {totalTests}
                        </div>
                    </div>

                    <div className="overflow-auto">
                        <table className="min-w-[900px] w-full text-sm">
                            <thead className="bg-white sticky top-0 z-10">
                                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                                    <th className="px-4 py-3">Parameter</th>
                                    <th className="px-4 py-3">Method</th>
                                    <th className="px-4 py-3">Assignee</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3">Updated</th>
                                    <th className="px-4 py-3">Result</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>

                            <tbody>
                                {tests.map((t) => {
                                    const pname = t.parameter?.name ?? `Parameter #${t.parameter_id}`;
                                    const mname = t.method?.name ?? (t.method_id ? `Method #${t.method_id}` : "-");
                                    const aname = t.assignee?.name ?? (t.assigned_to ? `Staff #${t.assigned_to}` : "-");
                                    const hasResult = !!t.latest_result?.result_id;

                                    const disableAdvance = qcIsFail || statusUpdatingId === t.sample_test_id;
                                    const eligible =
                                        (isOM && t.status === "measured") ||
                                        (isLH && t.status === "verified");

                                    return (
                                        <tr
                                            key={t.sample_test_id}
                                            className="group border-b border-gray-100 hover:bg-blue-50/30 transition-colors"
                                        >
                                            <td className="px-4 py-4">
                                                <div className="font-bold text-gray-800">{pname}</div>
                                                <div className="flex gap-2 mt-1">
                                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded font-mono">
                                                        #{t.sample_test_id}
                                                    </span>
                                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded font-mono">
                                                        PID:{t.parameter_id}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="px-4 py-4 text-gray-600 font-medium">{mname}</td>

                                            <td className="px-4 py-4">
                                                <div className="text-gray-700">{aname}</div>
                                            </td>

                                            <td className="px-4 py-4">
                                                <StatusPill value={t.status} />
                                            </td>

                                            <td className="px-4 py-4 text-gray-600">
                                                {t.updated_at ? formatDateTimeLocal(t.updated_at) : "-"}
                                            </td>

                                            <td className="px-4 py-4">
                                                <button
                                                    onClick={() => openResult(t)}
                                                    className={cx(
                                                        "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all text-xs font-semibold",
                                                        hasResult
                                                            ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                                                            : "bg-white border-gray-200 text-gray-600 hover:border-primary hover:text-primary shadow-sm"
                                                    )}
                                                >
                                                    {hasResult ? "View Result" : "Enter Result"}
                                                </button>
                                            </td>

                                            <td className="px-4 py-4 text-right">
                                                <div className="flex justify-end items-center gap-3">
                                                    {(isOM || isLH) && eligible && (
                                                        <label className="flex items-center gap-2 text-xs text-slate-500">
                                                            <input
                                                                type="checkbox"
                                                                className="h-4 w-4 cursor-pointer"
                                                                checked={bulkSelectedIds.includes(t.sample_test_id)}
                                                                onChange={() => toggleOne(t.sample_test_id)}
                                                                disabled={bulkRunning}
                                                                title="Select for bulk action"
                                                            />
                                                            Select
                                                        </label>
                                                    )}

                                                    {canUpdateTestStatus && (t.status === "draft" || t.status === "in_progress") ? (
                                                        <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                                                            {t.status === "draft" && (
                                                                <button
                                                                    disabled={disableAdvance}
                                                                    onClick={() => changeStatus(t.sample_test_id, "in_progress")}
                                                                    className="px-3 py-1 bg-white text-primary rounded-lg shadow-sm text-xs font-bold hover:bg-blue-50 disabled:opacity-50"
                                                                >
                                                                    Start
                                                                </button>
                                                            )}
                                                            {t.status === "in_progress" && (
                                                                <button
                                                                    disabled={disableAdvance}
                                                                    onClick={() => changeStatus(t.sample_test_id, "measured")}
                                                                    className="px-3 py-1 bg-emerald-600 text-white rounded-lg shadow-sm text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                                                                >
                                                                    Complete
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-gray-400 italic px-2">
                                                            {t.status === "measured"
                                                                ? "Waiting Verification"
                                                                : t.status === "verified"
                                                                    ? "Waiting Validation"
                                                                    : "Locked"}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {testsPager && (testsPager.last_page ?? 1) > 1 && (
                        <div className="px-4 py-3 flex items-center justify-between gap-2 bg-white border-t border-gray-100">
                            <SmallButton
                                type="button"
                                disabled={(testsPager.current_page ?? 1) <= 1}
                                onClick={() => setTestsPage((p) => Math.max(1, p - 1))}
                            >
                                Prev
                            </SmallButton>

                            <div className="text-xs text-gray-500">
                                Page{" "}
                                <span className="font-semibold text-gray-700">{testsPager.current_page ?? 1}</span>{" "}
                                / <span className="font-semibold text-gray-700">{testsPager.last_page ?? 1}</span>
                            </div>

                            <SmallButton
                                type="button"
                                disabled={(testsPager.current_page ?? 1) >= (testsPager.last_page ?? 1)}
                                onClick={() => setTestsPage((p) => p + 1)}
                            >
                                Next
                            </SmallButton>
                        </div>
                    )}
                </div>
            )}

            <AddSampleTestsModal
                open={openAddTests}
                onClose={() => setOpenAddTests(false)}
                sampleId={sampleId}
                defaultAssignedTo={defaultAssignedTo}
                canSubmit={roleId === ROLE_ID.ANALYST}
                onCreated={() => {
                    setTestsPage(1);
                    loadTests();
                    loadQc();
                    setReagentRefreshKey((k) => k + 1);
                }}
            />

            <ResultEntryModal
                open={openResultModal}
                onClose={closeResult}
                sampleTestId={resultRow?.sample_test_id ?? 0}
                headerLine={resultHeaderLine}
                existingResult={
                    resultRow?.latest_result
                        ? {
                            result_id: resultRow.latest_result.result_id,
                            value_raw: resultRow.latest_result.value_raw,
                            value_final: resultRow.latest_result.value_final,
                            unit_id: resultRow.latest_result.unit_id ?? null,
                            flags: resultRow.latest_result.flags ?? {},
                        }
                        : null
                }
                onSaved={async () => {
                    await loadTests();
                    await loadQc();
                    setReagentRefreshKey((k) => k + 1);
                }}
            />

            <EnterQcModal
                open={openQcModal}
                sampleId={sampleId}
                onClose={() => setOpenQcModal(false)}
                onSubmitted={loadQc}
            />
        </div>
    );
};
