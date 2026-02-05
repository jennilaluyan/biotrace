// L:\Campus\Final Countdown\biotrace\frontend\src\pages\samples\SampleDetailPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate, formatDateTimeLocal } from "../../utils/date";
import { sampleService, Sample } from "../../services/samples";
import { apiGet, apiPatch } from "../../services/api";

import { validateIntake } from "../../services/intake";
import { SampleTestingKanbanTab } from "../../components/samples/SampleTestingKanbanTab";

import {
    CrosscheckPill,
    IconRefresh,
    SmallButton,
    SmallPrimaryButton,
    StatusPill,
    WorkflowActionButton,
    cx,
} from "../../components/samples/SampleDetailAtoms";

import { QualityCoverSection } from "../../components/samples/QualityCoverSection";

/* ----------------------------- Local Types ----------------------------- */
type HistoryActor = {
    staff_id?: number | null;
    name?: string | null;
    email?: string | null;
    role?: { name?: string | null } | null;
} | null;

type SampleStatusHistoryItem = {
    id: number;
    from_status?: string | null;
    to_status?: string | null;
    note?: string | null;
    created_at: string;
    actor?: HistoryActor;
};

type ReagentReqStatus = "draft" | "submitted" | "approved" | "rejected" | "denied" | "cancelled" | string;

// unwrap like other pages (handles {data: ...} nesting)
function unwrapApi(res: any) {
    let x = res?.data ?? res;
    for (let i = 0; i < 5; i++) {
        if (x && typeof x === "object" && "data" in x && (x as any).data != null) {
            x = (x as any).data;
            continue;
        }
        break;
    }
    return x;
}

// robust extractor (same as SamplesPage)
const getReagentRequestStatus = (s: any): ReagentReqStatus | null => {
    const direct = s?.reagent_request_status ?? s?.reagentRequestStatus ?? null;
    if (direct) return String(direct).toLowerCase();

    const rr = s?.reagent_request ?? s?.reagentRequest ?? s?.reagentRequestLatest ?? null;
    const nested = rr?.status ?? rr?.request_status ?? null;
    if (nested) return String(nested).toLowerCase();

    return null;
};

function rrPillTone(status?: string | null) {
    const rr = String(status ?? "").toLowerCase();
    if (rr === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (rr === "submitted") return "border-amber-200 bg-amber-50 text-amber-800";
    if (rr === "draft") return "border-slate-200 bg-slate-50 text-slate-700";
    if (rr === "rejected" || rr === "denied") return "border-red-200 bg-red-50 text-red-700";
    if (!rr) return "border-gray-200 bg-gray-50 text-gray-600";
    return "border-gray-200 bg-gray-50 text-gray-700";
}

/* -------------------------------- Page -------------------------------- */
export const SampleDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(roleId);
    const sampleId = Number(id);

    /* ----------------------------- Derived auth ----------------------------- */
    const navReagentStatus = useMemo(() => {
        const st = (location.state as any)?.reagent_request_status ?? null;
        return st ? String(st).toLowerCase() : null;
    }, [location.state]);

    const displayRole = useMemo(() => {
        const fromUser =
            (user as any)?.role?.name ??
            (user as any)?.staff?.role?.name ??
            (user as any)?.staff?.role_name ??
            (user as any)?.role_name ??
            null;

        if (fromUser) return String(fromUser);
        if (roleLabel && roleLabel !== "UNKNOWN") return roleLabel;

        const idNum = Number(roleId);
        if (!Number.isNaN(idNum)) return `Role#${idNum}`;
        return "UNKNOWN";
    }, [user, roleLabel, roleId]);

    const canViewSamples = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.LAB_HEAD ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR
        );
    }, [roleId]);

    const checkedByName = (user as any)?.name ?? (user as any)?.staff?.name ?? (user as any)?.staff_name ?? "-";

    /* ----------------------------- Page State ----------------------------- */
    const [sample, setSample] = useState<Sample | null>(null);

    // ✅ Only 3 tabs: Overview, Tests (Kanban), Quality Cover
    const [tab, setTab] = useState<"overview" | "tests" | "quality_cover">("overview");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pageRefreshing, setPageRefreshing] = useState(false);

    /* ----------------------------- History State ----------------------------- */
    const [history, setHistory] = useState<SampleStatusHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    /* ----------------------------- Documents State ----------------------------- */
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState<string | null>(null);
    const [docs, setDocs] = useState<any[]>([]);

    /* ----------------------------- Intake State ----------------------------- */
    const [intakeValidating, setIntakeValidating] = useState(false);
    const [intakeError, setIntakeError] = useState<string | null>(null);
    const [intakeSuccess, setIntakeSuccess] = useState<string | null>(null);

    /* ----------------------------- Workflow State ----------------------------- */
    const [wfBusy, setWfBusy] = useState(false);
    const [wfError, setWfError] = useState<string | null>(null);

    /* ----------------------------- Crosscheck State ----------------------------- */
    const [ccBusy, setCcBusy] = useState(false);
    const [ccError, setCcError] = useState<string | null>(null);
    const [ccSuccess, setCcSuccess] = useState<string | null>(null);
    const [ccPhysicalCode, setCcPhysicalCode] = useState<string>("");
    const [ccReason, setCcReason] = useState<string>("");

    /* ----------------------------- Derived fields ----------------------------- */
    const reagentRequestStatus = useMemo(() => {
        const fromSample = getReagentRequestStatus(sample as any);
        return (fromSample ?? navReagentStatus ?? "") as string;
    }, [sample, navReagentStatus]);

    const requestStatus = String((sample as any)?.request_status ?? "");
    const labSampleCode = String((sample as any)?.lab_sample_code ?? "");

    const crossStatus = String((sample as any)?.crosscheck_status ?? "pending").toLowerCase();
    const crossAt = (sample as any)?.crosschecked_at ?? null;
    const crossBy = (sample as any)?.crosschecked_by_staff_id ?? null;
    const crossSavedPhysical = (sample as any)?.physical_label_code ?? null;
    const crossSavedNote = (sample as any)?.crosscheck_note ?? null;

    const expectedLabCode = String((sample as any)?.lab_sample_code ?? "");

    // physical workflow
    const scDeliveredToAnalystAt = (sample as any)?.sc_delivered_to_analyst_at ?? null;
    const analystReceivedAt = (sample as any)?.analyst_received_at ?? null;

    const isCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const isAnalyst = roleId === ROLE_ID.ANALYST;

    const canDoCrosscheck = isAnalyst && !!analystReceivedAt && !!expectedLabCode;
    const canWfScDeliverToAnalyst = isCollector && !scDeliveredToAnalystAt;
    const canWfAnalystReceive = isAnalyst && !!scDeliveredToAnalystAt && !analystReceivedAt;

    const canValidateIntake = useMemo(() => {
        if (roleId !== ROLE_ID.LAB_HEAD) return false;
        const st = requestStatus.toLowerCase();
        if (!st) return true;
        if (st === "intake_validated") return false;
        if (st === "validated") return false;
        return true;
    }, [roleId, requestStatus]);

    // ✅ Tests (Kanban) appears when lab workflow is active (BML exists)
    const canSeeTestsTab = useMemo(() => {
        const bml = String((sample as any)?.lab_sample_code ?? "").trim();
        return !!sample && !!bml;
    }, [sample]);

    /**
     * ✅ Fix: Quality Cover unlock should not rely ONLY on `quality_cover_unlocked_at`
     * because backend might not be setting it yet, even when user already reached last column.
     *
     * So we allow unlock when ANY of these "end-of-testing" signals are present.
     * This makes the UI reflect reality (like your screenshot).
     */
    const canSeeQualityCoverTab = useMemo(() => {
        const unlockedAt = (sample as any)?.quality_cover_unlocked_at ?? null;
        if (unlockedAt) return true;

        // best-effort fallbacks (support multiple backend naming variants)
        const maybeDoneFlags = [
            (sample as any)?.testing_completed_at,
            (sample as any)?.tests_completed_at,
            (sample as any)?.testing_done_at,
            (sample as any)?.ready_for_review_at,
            (sample as any)?.review_ready_at,
        ].filter(Boolean);

        if (maybeDoneFlags.length > 0) return true;

        const statusEnum = String((sample as any)?.status_enum ?? "").toLowerCase();
        const currentStatus = String((sample as any)?.current_status ?? "").toLowerCase();
        const reqStatus = String((sample as any)?.request_status ?? "").toLowerCase();

        // If sample already at review/completed-ish stage, QC should be accessible.
        const looksLikeEndStage =
            statusEnum.includes("review") ||
            statusEnum.includes("completed") ||
            currentStatus.includes("review") ||
            currentStatus.includes("ready") ||
            currentStatus.includes("completed") ||
            reqStatus.includes("review");

        return looksLikeEndStage;
    }, [sample]);

    const qualityCoverDisabled = !isAnalyst; // only analyst can fill

    // keep user from landing on tab they can't see
    useEffect(() => {
        if (tab === "tests" && !canSeeTestsTab) setTab("overview");
        if (tab === "quality_cover" && !canSeeQualityCoverTab) setTab("overview");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, canSeeTestsTab, canSeeQualityCoverTab]);

    /* ----------------------------- Data Loaders ----------------------------- */
    const tryFetchReagentStatusByLoo = async (loId: number) => {
        try {
            const res = await apiGet<any>(`/v1/reagents/requests/loo/${loId}`);
            const payload = unwrapApi(res);

            const status =
                getReagentRequestStatus(payload) ??
                getReagentRequestStatus(payload?.request) ??
                getReagentRequestStatus(payload?.reagent_request) ??
                null;

            return status ? String(status).toLowerCase() : null;
        } catch {
            return null;
        }
    };

    const loadSample = async (opts?: { silent?: boolean }) => {
        if (!canViewSamples) {
            setLoading(false);
            return;
        }
        if (!sampleId || Number.isNaN(sampleId)) {
            setError("Invalid sample URL.");
            setLoading(false);
            return;
        }

        const silent = !!opts?.silent;

        try {
            if (!silent) setLoading(true);
            setError(null);

            const data = await sampleService.getById(sampleId);

            let rr = getReagentRequestStatus(data as any);

            const loId = Number((data as any)?.lo_id ?? 0);
            if (!rr && loId) {
                const fromLoo = await tryFetchReagentStatusByLoo(loId);
                if (fromLoo) rr = fromLoo;
            }

            if (!rr && navReagentStatus) rr = navReagentStatus;

            const merged: any = { ...(data as any) };
            if (rr && !merged.reagent_request_status) merged.reagent_request_status = rr;

            setSample(merged as Sample);
        } catch (err: any) {
            const msg = err?.data?.message ?? err?.data?.error ?? err?.message ?? "Failed to load sample detail.";
            setError(msg);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const loadHistory = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setHistoryLoading(true);
            setHistoryError(null);

            const res = await apiGet<any>(`/v1/samples/${sampleId}/status-history`);
            const items = (res?.data ?? res) as SampleStatusHistoryItem[];
            setHistory(Array.isArray(items) ? items : []);
        } catch (err: any) {
            const msg = err?.data?.message ?? err?.data?.error ?? err?.message ?? "Failed to load status history.";
            setHistoryError(msg);
            setHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    const loadDocs = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setDocsLoading(true);
            setDocsError(null);

            const res = await apiGet<any>(`/v1/reports/documents?sample_id=${sampleId}`);
            const payload = unwrapApi(res);

            setDocs(Array.isArray(payload) ? payload : []);
        } catch (err: any) {
            const msg = err?.data?.message ?? err?.response?.data?.message ?? err?.message ?? "Failed to load documents.";
            setDocsError(msg);
            setDocs([]);
        } finally {
            setDocsLoading(false);
        }
    };

    const refreshAll = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        try {
            setPageRefreshing(true);
            await loadSample({ silent: true });
            await loadHistory();
            await loadDocs();
        } finally {
            setPageRefreshing(false);
        }
    };

    /* ----------------------------- Effects ----------------------------- */
    useEffect(() => {
        loadSample();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canViewSamples, sampleId]);

    useEffect(() => {
        if (!loading && !error && sample) {
            loadHistory();
            loadDocs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, loading, error, sample]);

    // Crosscheck input hydration from saved physical code
    useEffect(() => {
        if (!sample) return;
        const existing = String((sample as any)?.physical_label_code ?? "");
        setCcPhysicalCode((prev) => (prev && prev.trim() ? prev : existing));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, sample]);

    /* ----------------------------- Actions ----------------------------- */
    const doValidateIntake = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setIntakeValidating(true);
            setIntakeError(null);
            setIntakeSuccess(null);

            await validateIntake(sampleId);

            await refreshAll();
            setIntakeSuccess("Intake validated successfully. Lab workflow should be active now.");
        } catch (err: any) {
            const msg = err?.data?.message ?? err?.data?.error ?? err?.message ?? "Failed to validate intake.";
            setIntakeError(msg);
        } finally {
            setIntakeValidating(false);
        }
    };

    const doPhysicalWorkflow = async (action: string) => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        try {
            setWfBusy(true);
            setWfError(null);

            await apiPatch<any>(`/v1/samples/${sampleId}/physical-workflow`, { action, note: null });

            await refreshAll();
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to update physical workflow.";
            setWfError(msg);
        } finally {
            setWfBusy(false);
        }
    };

    const submitCrosscheck = async (mode: "pass" | "fail") => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        const enteredRaw = String(ccPhysicalCode ?? "");
        const entered = enteredRaw.trim().toUpperCase();
        const expected = expectedLabCode.trim().toUpperCase();

        setCcError(null);
        setCcSuccess(null);

        if (!entered) {
            setCcError("Physical label code is required.");
            return;
        }
        if (!expected) {
            setCcError("Expected Lab Code is missing; crosscheck cannot be performed.");
            return;
        }

        const isMatch = entered === expected;

        if (mode === "pass") {
            if (!isMatch) {
                setCcError(
                    `Mismatch detected. Expected: ${expectedLabCode}. Entered: ${enteredRaw}. Please provide a reason and click FAIL.`
                );
                return;
            }
        } else {
            const note = String(ccReason ?? "").trim();
            if (isMatch) {
                setCcError("Entered code matches expected. Use PASS (Fail is for mismatch cases).");
                return;
            }
            if (!note) {
                setCcError("Reason is required when FAIL.");
                return;
            }
        }

        try {
            setCcBusy(true);

            await sampleService.submitCrosscheck(sampleId, {
                physical_label_code: enteredRaw,
                note: mode === "fail" ? String(ccReason ?? "").trim() : null,
            });

            await refreshAll();

            setCcSuccess(mode === "pass" ? "Crosscheck PASSED." : "Crosscheck FAILED recorded.");
            if (mode === "fail") setCcReason("");
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

    /* ----------------------------- Guard ----------------------------- */
    if (!canViewSamples) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to access the samples module.
                </p>
                <Link to="/samples" className="mt-4 lims-btn-primary">
                    Back to samples
                </Link>
            </div>
        );
    }

    /* ----------------------------- Render ----------------------------- */
    return (
        <div className="min-h-[60vh]">
            {/* Breadcrumb */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <span className="lims-breadcrumb-icon">
                        <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M4 12h9" />
                            <path d="M11 9l3 3-3 3" />
                            <path d="M4 6v12" />
                        </svg>
                    </span>
                    <Link to="/samples" className="lims-breadcrumb-link">
                        Samples
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">Sample Detail</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {loading && <div className="text-sm text-gray-600">Loading sample detail...</div>}

                {error && !loading && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}

                {!loading && !error && sample && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample Detail</h1>
                                <div className="text-sm text-gray-600 mt-1">
                                    Sample ID <span className="font-semibold">#{sample.sample_id}</span>
                                    {" · "}Current Status <span className="font-semibold">{sample.current_status}</span>
                                    {" · "}high-level: <span className="font-mono text-xs">{(sample as any).status_enum ?? "-"}</span>
                                    {requestStatus ? (
                                        <>
                                            {" · "}request: <span className="font-mono text-xs">{requestStatus}</span>
                                        </>
                                    ) : null}
                                    {labSampleCode ? (
                                        <>
                                            {" · "}BML: <span className="font-mono text-xs">{labSampleCode}</span>
                                        </>
                                    ) : null}
                                </div>

                                {/* Reagent request status bar (kept informational) */}
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-500">Reagent request:</span>
                                    <span
                                        className={cx(
                                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border capitalize",
                                            rrPillTone(reagentRequestStatus || null)
                                        )}
                                        title={reagentRequestStatus || "-"}
                                    >
                                        {reagentRequestStatus ? String(reagentRequestStatus) : "-"}
                                    </span>

                                    {!canSeeQualityCoverTab && (
                                        <span className="text-xs text-gray-500">Quality Cover locked (unlock by reaching last Testing stage)</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <SmallButton
                                    type="button"
                                    onClick={refreshAll}
                                    disabled={pageRefreshing}
                                    title="Refresh sample, history, and documents"
                                    className="flex items-center gap-2"
                                >
                                    <IconRefresh />
                                    {pageRefreshing ? "Refreshing..." : "Refresh"}
                                </SmallButton>

                                <button className="lims-btn" type="button" onClick={() => navigate(-1)}>
                                    Back
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                            <div className="px-5 pt-5">
                                <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-1 flex-wrap">
                                    <button
                                        type="button"
                                        className={cx(
                                            "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                            tab === "overview" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-800"
                                        )}
                                        onClick={() => setTab("overview")}
                                    >
                                        Overview
                                    </button>

                                    {canSeeTestsTab ? (
                                        <button
                                            type="button"
                                            className={cx(
                                                "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                                tab === "tests" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-800"
                                            )}
                                            onClick={() => setTab("tests")}
                                            title="Testing workflow (Kanban)"
                                        >
                                            Tests
                                        </button>
                                    ) : (
                                        <span className="px-4 py-2 text-xs text-gray-500" title="Appears after Lab Code (BML) exists">
                                            Tests locked
                                        </span>
                                    )}

                                    {canSeeQualityCoverTab ? (
                                        <button
                                            type="button"
                                            className={cx(
                                                "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                                tab === "quality_cover" ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-800"
                                            )}
                                            onClick={() => setTab("quality_cover")}
                                            title="Quality Cover (unlocked after last Testing stage)"
                                        >
                                            Quality Cover
                                        </button>
                                    ) : (
                                        <span className="px-4 py-2 text-xs text-gray-500" title="Unlock by reaching last Testing stage">
                                            Quality Cover locked
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="px-5 py-5">
                                {tab === "overview" && (
                                    <div className="space-y-6">
                                        {/* Request / Intake */}
                                        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">Request / Intake</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Admin ↔ Sample Collector ↔ Analyst handoff timestamps (backend enforces order).
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {requestStatus ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-500">Request status</span>
                                                            <StatusPill value={requestStatus} />
                                                        </div>
                                                    ) : null}

                                                    {labSampleCode ? (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-gray-500">Lab code</span>
                                                            <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                                                {labSampleCode}
                                                            </span>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="px-5 py-4">
                                                {intakeError && (
                                                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                                                        {intakeError}
                                                    </div>
                                                )}

                                                {intakeSuccess && (
                                                    <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl mb-3">
                                                        {intakeSuccess}
                                                    </div>
                                                )}

                                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                                    <div className="text-sm text-gray-700">
                                                        <div className="font-semibold text-gray-900 mb-1">Validate Intake</div>
                                                        <div className="text-xs text-gray-600">
                                                            This should assign a lab sample code (BML) and unlock the lab workflow — if the backend rules are satisfied.
                                                        </div>
                                                    </div>

                                                    {canValidateIntake ? (
                                                        <SmallPrimaryButton
                                                            type="button"
                                                            onClick={doValidateIntake}
                                                            disabled={intakeValidating}
                                                            title="Validate intake (Lab Head)"
                                                        >
                                                            {intakeValidating ? "Validating..." : "Validate Intake"}
                                                        </SmallPrimaryButton>
                                                    ) : (
                                                        <div className="text-xs text-gray-500 italic">
                                                            Validate Intake is only available for Lab Head (or already validated).
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Documents */}
                                        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">Documents</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Dokumen terkait sample (LOO, Reagent Request, dll) dari repository Reports.
                                                    </div>
                                                </div>
                                                <div className="text-xs text-gray-500">{docsLoading ? "Loading…" : `${docs.length} item(s)`}</div>
                                            </div>

                                            <div className="px-5 py-4">
                                                {docsError ? (
                                                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                                                        {docsError}
                                                    </div>
                                                ) : null}

                                                {docsLoading ? (
                                                    <div className="text-sm text-gray-600">Loading documents…</div>
                                                ) : docs.length === 0 ? (
                                                    <div className="text-sm text-gray-600">No documents yet.</div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {docs.map((d, idx) => {
                                                            const name = d?.document_name ?? d?.type ?? "Document";
                                                            const no = d?.number ?? d?.document_code ?? "-";
                                                            const status = d?.status ?? "-";
                                                            const url = d?.download_url ?? null;

                                                            return (
                                                                <div
                                                                    key={`${d?.type ?? "doc"}-${d?.id ?? idx}`}
                                                                    className="rounded-xl border px-3 py-2 flex items-center justify-between gap-3"
                                                                >
                                                                    <div>
                                                                        <div className="text-sm font-semibold text-gray-900">{name}</div>
                                                                        <div className="text-xs text-gray-600 mt-0.5">
                                                                            {no} • <span className="capitalize">{String(status)}</span>
                                                                        </div>
                                                                    </div>

                                                                    {url ? (
                                                                        <button
                                                                            type="button"
                                                                            className="px-3 py-1 rounded-full text-xs bg-primary text-white hover:opacity-90 whitespace-nowrap"
                                                                            onClick={() => window.open(String(url), "_blank", "noopener,noreferrer")}
                                                                        >
                                                                            Open PDF
                                                                        </button>
                                                                    ) : (
                                                                        <span className="text-xs text-gray-400 whitespace-nowrap">No file</span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Physical Workflow */}
                                        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">Physical Workflow</div>
                                                    <div className="text-xs text-gray-500 mt-1">Lab samples start at SC → Analyst handoff.</div>
                                                </div>
                                                <div className="text-[11px] text-gray-500">
                                                    You are: <span className="font-semibold">{displayRole}</span>
                                                </div>
                                            </div>

                                            <div className="px-5 py-4">
                                                {wfError && (
                                                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                                                        {wfError}
                                                    </div>
                                                )}

                                                <div className="mt-2 space-y-2">
                                                    {[
                                                        { label: "SC: delivered to analyst", at: scDeliveredToAnalystAt },
                                                        { label: "Analyst: received", at: analystReceivedAt },
                                                    ].map((r, idx) => (
                                                        <div key={`${r.label}-${idx}`} className="flex items-start gap-3">
                                                            <div
                                                                className={cx(
                                                                    "mt-1 h-2.5 w-2.5 rounded-full border",
                                                                    r.at ? "bg-emerald-500 border-emerald-600" : "bg-gray-200 border-gray-300"
                                                                )}
                                                            />
                                                            <div className="flex-1">
                                                                <div className="text-xs font-semibold text-gray-800">{r.label}</div>
                                                                <div className="text-[11px] text-gray-600">{r.at ? formatDateTimeLocal(r.at) : "-"}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {isCollector ? (
                                                        <WorkflowActionButton
                                                            title="SC: Delivered to Analyst"
                                                            subtitle="Record handoff time when sample is delivered to analyst."
                                                            onClick={() => doPhysicalWorkflow("sc_delivered_to_analyst")}
                                                            disabled={!canWfScDeliverToAnalyst || wfBusy}
                                                            busy={wfBusy}
                                                            variant="primary"
                                                        />
                                                    ) : null}

                                                    {isAnalyst ? (
                                                        <WorkflowActionButton
                                                            title="Analyst: Received"
                                                            subtitle="Confirm the sample is physically received from Sample Collector."
                                                            onClick={() => doPhysicalWorkflow("analyst_received")}
                                                            disabled={!canWfAnalystReceive || wfBusy}
                                                            busy={wfBusy}
                                                            variant="primary"
                                                        />
                                                    ) : null}

                                                    {!isCollector && !isAnalyst ? (
                                                        <div className="sm:col-span-2 text-xs text-gray-700 bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl">
                                                            Only Sample Collector can deliver, and Analyst can receive.
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Analyst Crosscheck */}
                                        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">Analyst Crosscheck</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Match expected Lab Code (LOO/BML) with physical label before continuing.
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <CrosscheckPill value={crossStatus} />
                                                    {crossAt ? (
                                                        <span className="text-[11px] text-gray-500">
                                                            {formatDateTimeLocal(crossAt)}
                                                            {crossBy ? ` • Staff #${crossBy}` : ""}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-gray-500">Not submitted yet</span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="px-5 py-4">
                                                {ccError && (
                                                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                                                        {ccError}
                                                    </div>
                                                )}
                                                {ccSuccess && (
                                                    <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl mb-3">
                                                        {ccSuccess}
                                                    </div>
                                                )}

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <div className="text-xs text-gray-500">Expected Lab Code</div>
                                                        <div className="mt-1 font-mono text-sm bg-white border border-gray-200 rounded-xl px-3 py-2">
                                                            {expectedLabCode || "-"}
                                                        </div>

                                                        <div className="mt-3 text-xs text-gray-500">Last submitted physical label</div>
                                                        <div className="mt-1 font-mono text-sm bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                                                            {crossSavedPhysical ? String(crossSavedPhysical) : "-"}
                                                        </div>

                                                        {crossStatus === "failed" && crossSavedNote ? (
                                                            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2">
                                                                <div className="text-xs font-semibold text-red-900">Fail reason</div>
                                                                <div className="text-xs text-red-800 mt-1">{String(crossSavedNote)}</div>
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs text-gray-500">Physical label code</label>
                                                        <input
                                                            value={ccPhysicalCode}
                                                            onChange={(e) => setCcPhysicalCode(e.target.value)}
                                                            placeholder="Type the code from the physical label…"
                                                            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                            disabled={!canDoCrosscheck || ccBusy}
                                                        />

                                                        <label className="block text-xs text-gray-500 mt-3">Reason (required when FAIL)</label>
                                                        <textarea
                                                            value={ccReason}
                                                            onChange={(e) => setCcReason(e.target.value)}
                                                            placeholder="Explain mismatch / label issue…"
                                                            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-24 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                            disabled={!canDoCrosscheck || ccBusy}
                                                        />

                                                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                                                            <SmallPrimaryButton
                                                                type="button"
                                                                onClick={() => submitCrosscheck("pass")}
                                                                disabled={!canDoCrosscheck || ccBusy}
                                                                title={!canDoCrosscheck ? "Available only after Analyst received + Lab code exists" : "Submit PASS"}
                                                            >
                                                                {ccBusy ? "Saving..." : "Pass"}
                                                            </SmallPrimaryButton>

                                                            <SmallButton
                                                                type="button"
                                                                onClick={() => submitCrosscheck("fail")}
                                                                disabled={!canDoCrosscheck || ccBusy}
                                                                title={!canDoCrosscheck ? "Available only after Analyst received + Lab code exists" : "Submit FAIL"}
                                                                className="border-red-200 text-red-700 hover:bg-red-50"
                                                            >
                                                                {ccBusy ? "Saving..." : "Fail"}
                                                            </SmallButton>

                                                            {!canDoCrosscheck ? (
                                                                <div className="text-xs text-gray-500 italic">
                                                                    Crosscheck can be submitted only by Analyst after “Analyst: received”, and when Lab Code (BML) exists.
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sample Info + Client & Creator + History */}
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div>
                                                <h3 className="lims-detail-section-title mb-3">Sample Info</h3>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div>
                                                        <div className="lims-detail-label">Sample Type</div>
                                                        <div className="lims-detail-value">{sample.sample_type}</div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Received At</div>
                                                        <div className="lims-detail-value">{formatDate(sample.received_at)}</div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Priority</div>
                                                        <div className="lims-detail-value">{String((sample as any).priority ?? "-")}</div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Contact History</div>
                                                        <div className="lims-detail-value">{(sample as any).contact_history ?? "-"}</div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Examination Purpose</div>
                                                        <div className="lims-detail-value">{sample.examination_purpose ?? "-"}</div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Additional Notes</div>
                                                        <div className="lims-detail-value">{sample.additional_notes ?? "-"}</div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <h3 className="lims-detail-section-title mb-3">Client & Creator</h3>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Client</div>
                                                        <div className="lims-detail-value">{sample.client?.name ?? `Client #${sample.client_id}`}</div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Client Email</div>
                                                        <div className="lims-detail-value break-all">{sample.client?.email ?? "-"}</div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Client Phone</div>
                                                        <div className="lims-detail-value">{sample.client?.phone ?? "-"}</div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Created By</div>
                                                        <div className="lims-detail-value">{(sample as any).creator?.name ?? `Staff #${(sample as any).created_by}`}</div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Creator Email</div>
                                                        <div className="lims-detail-value break-all">{(sample as any).creator?.email ?? "-"}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status History */}
                                        <div>
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                <div>
                                                    <h3 className="lims-detail-section-title mb-1">Audit Trail / Status History</h3>
                                                    <div className="text-xs text-gray-500">
                                                        {historyLoading ? "Refreshing history..." : history.length > 0 ? `${history.length} event(s)` : "No status changes yet."}
                                                    </div>
                                                </div>

                                                <SmallButton type="button" onClick={loadHistory} disabled={historyLoading} className="flex items-center gap-2">
                                                    <IconRefresh />
                                                    {historyLoading ? "Refreshing..." : "Refresh"}
                                                </SmallButton>
                                            </div>

                                            {historyError && !historyLoading && (
                                                <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mt-3">{historyError}</div>
                                            )}

                                            {!historyLoading && !historyError && history.length === 0 && (
                                                <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                                                    No status changes yet.
                                                </div>
                                            )}

                                            {!historyLoading && !historyError && history.length > 0 && (
                                                <div className="space-y-3 mt-3">
                                                    {history.map((h) => (
                                                        <div key={h.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <div className="text-sm font-semibold text-gray-900">
                                                                        {h.actor?.name ?? "System"}
                                                                        {h.actor?.role?.name ? ` • ${h.actor.role.name}` : ""}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 mt-1">{formatDateTimeLocal(h.created_at)}</div>
                                                                </div>
                                                                <div className="text-xs font-medium text-gray-700">
                                                                    {h.from_status ? `${h.from_status} → ` : ""}
                                                                    {h.to_status ?? "-"}
                                                                </div>
                                                            </div>

                                                            {h.note && (
                                                                <div className="mt-2 text-sm text-gray-700">
                                                                    <span className="font-semibold">Note:</span> {h.note}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {tab === "tests" && canSeeTestsTab && (
                                    <div className="space-y-4">
                                        {!canSeeQualityCoverTab ? (
                                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                                <div className="font-semibold">Quality Cover is still locked.</div>
                                                <div className="text-xs mt-1">
                                                    Unlock it by moving this sample to the <span className="font-semibold">last column</span> of the Testing Kanban.
                                                </div>
                                            </div>
                                        ) : null}

                                        <SampleTestingKanbanTab sampleId={sampleId} sample={sample} roleId={roleId} />
                                    </div>
                                )}

                                {tab === "quality_cover" && canSeeQualityCoverTab && (
                                    <div className="space-y-4">
                                        {(sample as any)?.quality_cover_unlocked_at ? (
                                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                                                <div className="font-semibold">Quality Cover unlocked</div>
                                                <div className="text-xs mt-1">
                                                    Unlocked at:{" "}
                                                    <span className="font-semibold">{formatDateTimeLocal((sample as any)?.quality_cover_unlocked_at)}</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                                                <div className="font-semibold">Quality Cover unlocked</div>
                                                <div className="text-xs mt-1">Unlocked automatically because this sample is already at the end of Testing.</div>
                                            </div>
                                        )}

                                        <QualityCoverSection
                                            sample={sample}
                                            checkedByName={checkedByName}
                                            disabled={qualityCoverDisabled}
                                            onAfterSave={refreshAll}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
