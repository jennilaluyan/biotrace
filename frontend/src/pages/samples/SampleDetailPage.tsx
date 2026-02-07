import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { Lock, RefreshCw } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";
import { sampleService, Sample } from "../../services/samples";
import { apiGet, apiPatch } from "../../services/api";

import { SampleTestingKanbanTab } from "../../components/samples/SampleTestingKanbanTab";
import { QualityCoverSection } from "../../components/samples/QualityCoverSection";

import { SampleStatusCard } from "../../components/samples/detail/SampleStatusCard";
import { SampleDocumentsCard } from "../../components/samples/detail/SampleDocumentsCard";
import { SampleInfoTab } from "../../components/samples/detail/SampleInfoTab";
import { SampleWorkflowTab } from "../../components/samples/detail/SampleWorkflowTab";

/* ----------------------------- Local Types ----------------------------- */
type ReagentReqStatus =
    | "draft"
    | "submitted"
    | "approved"
    | "rejected"
    | "denied"
    | "cancelled"
    | string;

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

// local UI helpers (no external ./ui import)
function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
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

    const canViewSamples = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.LAB_HEAD ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR
        );
    }, [roleId]);

    const checkedByName =
        (user as any)?.name ??
        (user as any)?.staff?.name ??
        (user as any)?.staff_name ??
        "-";

    const isAnalyst = roleId === ROLE_ID.ANALYST;
    const isCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;

    /* ----------------------------- Page State ----------------------------- */
    const [sample, setSample] = useState<Sample | null>(null);

    // Tabs
    const [tab, setTab] = useState<"summary" | "sample" | "workflow" | "tests" | "quality_cover">("summary");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pageRefreshing, setPageRefreshing] = useState(false);

    /* ----------------------------- Documents State ----------------------------- */
    const [docsLoading, setDocsLoading] = useState(false);
    const [docsError, setDocsError] = useState<string | null>(null);
    const [docs, setDocs] = useState<any[]>([]);

    /* ----------------------------- Derived fields ----------------------------- */
    const reagentRequestStatus = useMemo(() => {
        const fromSample = getReagentRequestStatus(sample as any);
        return (fromSample ?? navReagentStatus ?? "") as string;
    }, [sample, navReagentStatus]);

    const labSampleCode = String((sample as any)?.lab_sample_code ?? "").trim();

    const crossStatus = String((sample as any)?.crosscheck_status ?? "pending").toLowerCase();
    const analystReceivedAt = sample?.analyst_received_at ?? null;
    const expectedLabCode = String(sample?.lab_sample_code ?? "");

    // physical workflow
    const scDeliveredToAnalystAt = sample?.sc_delivered_to_analyst_at ?? null;

    const canDoCrosscheck = isAnalyst && !!analystReceivedAt && !!expectedLabCode;

    // ✅ Tests tab appears ONLY after reagent request is approved (and lab code exists)
    const canSeeTestsTab = useMemo(() => {
        if (!sample) return false;
        if (!labSampleCode) return false;

        const rr = String(reagentRequestStatus ?? "").toLowerCase();
        return rr === "approved";
    }, [sample, labSampleCode, reagentRequestStatus]);

    /**
     * ✅ Quality Cover gate: open ONLY after DONE flags OR explicit unlock timestamp
     */
    const canSeeQualityCoverTab = useMemo(() => {
        if (!sample) return false;

        // ✅ strong "done" flags set by backend on finalize (if columns exist)
        const doneFlags = [
            (sample as any)?.testing_completed_at,
            (sample as any)?.testing_done_at,
            (sample as any)?.tests_completed_at,
        ].filter(Boolean);

        if (doneFlags.length > 0) return true;

        // ✅ fallback unlock field (still allowed)
        const unlockedAt = (sample as any)?.quality_cover_unlocked_at ?? null;
        if (unlockedAt) return true;

        return false;
    }, [sample]);

    const qualityCoverDisabled = !isAnalyst;

    // Keep user from landing on tab they can't access
    useEffect(() => {
        if (tab === "tests" && !canSeeTestsTab) setTab("summary");
        if (tab === "quality_cover" && !canSeeQualityCoverTab) setTab("summary");
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

    const loadDocs = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setDocsLoading(true);
            setDocsError(null);

            const res = await apiGet<any>(`/v1/reports/documents?sample_id=${sampleId}`);
            const payload = unwrapApi(res);

            setDocs(Array.isArray(payload) ? payload : []);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.response?.data?.message ??
                err?.message ??
                "Failed to load documents.";
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
            loadDocs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, loading, error, sample]);

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
    const headerCode = labSampleCode || "—";

    return (
        <div className="min-h-[60vh]">
            {/* Breadcrumb */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/samples" className="lims-breadcrumb-link">
                        Samples
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">Detail</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {loading && <div className="text-sm text-gray-600">Loading…</div>}

                {error && !loading && (
                    <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                        {error}
                    </div>
                )}

                {!loading && !error && sample && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample</h1>
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-500">Lab code</span>
                                    <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                        {headerCode}
                                    </span>
                                    {(sample as any)?.updated_at ? (
                                        <span className="text-[11px] text-gray-500">
                                            updated {formatDateTimeLocal((sample as any)?.updated_at)}
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="lims-icon-button"
                                    onClick={refreshAll}
                                    disabled={pageRefreshing}
                                    aria-label="Refresh"
                                    title="Refresh"
                                >
                                    <RefreshCw size={16} />
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
                                            tab === "summary"
                                                ? "bg-white shadow-sm text-gray-900"
                                                : "text-gray-600 hover:text-gray-800"
                                        )}
                                        onClick={() => setTab("summary")}
                                    >
                                        Summary
                                    </button>

                                    <button
                                        type="button"
                                        className={cx(
                                            "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                            tab === "sample"
                                                ? "bg-white shadow-sm text-gray-900"
                                                : "text-gray-600 hover:text-gray-800"
                                        )}
                                        onClick={() => setTab("sample")}
                                    >
                                        Sample
                                    </button>

                                    <button
                                        type="button"
                                        className={cx(
                                            "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                            tab === "workflow"
                                                ? "bg-white shadow-sm text-gray-900"
                                                : "text-gray-600 hover:text-gray-800"
                                        )}
                                        onClick={() => setTab("workflow")}
                                    >
                                        Workflow
                                    </button>

                                    {canSeeTestsTab ? (
                                        <button
                                            type="button"
                                            className={cx(
                                                "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                                tab === "tests"
                                                    ? "bg-white shadow-sm text-gray-900"
                                                    : "text-gray-600 hover:text-gray-800"
                                            )}
                                            onClick={() => setTab("tests")}
                                            title="Testing board"
                                        >
                                            Tests
                                        </button>
                                    ) : (
                                        <span
                                            className="px-4 py-2 text-xs font-semibold rounded-xl border border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-2"
                                            title="Locked until Reagent Request is approved"
                                        >
                                            <Lock size={14} />
                                            Tests
                                        </span>
                                    )}

                                    {canSeeQualityCoverTab ? (
                                        <button
                                            type="button"
                                            className={cx(
                                                "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                                tab === "quality_cover"
                                                    ? "bg-white shadow-sm text-gray-900"
                                                    : "text-gray-600 hover:text-gray-800"
                                            )}
                                            onClick={() => setTab("quality_cover")}
                                            title="Quality cover"
                                        >
                                            Quality cover
                                        </button>
                                    ) : (
                                        <span
                                            className="px-4 py-2 text-xs font-semibold rounded-xl border border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-2"
                                            title="Unlocks after final testing stage"
                                        >
                                            <Lock size={14} />
                                            Quality cover
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="px-5 py-5">
                                {tab === "summary" && (
                                    <div className="space-y-6">
                                        <SampleStatusCard sample={sample} reagentRequestStatus={reagentRequestStatus} />

                                        <SampleDocumentsCard
                                            docs={docs}
                                            loading={docsLoading}
                                            error={docsError}
                                        />
                                    </div>
                                )}

                                {tab === "sample" && (
                                    <SampleInfoTab sample={sample} />
                                )}

                                {tab === "workflow" && (
                                    <SampleWorkflowTab
                                        sample={sample}
                                        roleId={roleId}
                                        canDoCrosscheck={canDoCrosscheck}
                                        onWorkflowChanged={refreshAll}
                                        apiPatch={apiPatch}
                                    />
                                )}

                                {tab === "tests" && canSeeTestsTab && (
                                    <SampleTestingKanbanTab
                                        sampleId={sampleId}
                                        sample={sample}
                                        onQualityCoverUnlocked={async () => {
                                            await refreshAll();       // ✅ ensure gate fields updated
                                            setTab("quality_cover");  // ✅ then open QC tab
                                        }}
                                    />
                                )}

                                {tab === "quality_cover" && canSeeQualityCoverTab && (
                                    <QualityCoverSection
                                        sample={sample}
                                        checkedByName={checkedByName}
                                        disabled={qualityCoverDisabled}
                                        onAfterSave={refreshAll}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
