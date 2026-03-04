import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ArrowLeft, Lock, RefreshCw } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";
import { getErrorMessage } from "../../utils/errors";
import { cx } from "../../utils/cx";
import { unwrapApi } from "../../utils/apiData";

import { sampleService, type Sample } from "../../services/samples";
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
    const { t } = useTranslation();

    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const navigate = useNavigate();

    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const sampleId = Number(id);

    const goBack = useCallback(() => {
        const idx = (window.history.state as any)?.idx ?? 0;
        if (idx > 0) navigate(-1);
        else navigate("/samples", { replace: true });
    }, [navigate]);

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
        t("common.na", "—");

    const isAnalyst = roleId === ROLE_ID.ANALYST;

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

    const analystReceivedAt = sample?.analyst_received_at ?? null;
    const expectedLabCode = String(sample?.lab_sample_code ?? "");

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

        const doneFlags = [
            (sample as any)?.testing_completed_at,
            (sample as any)?.testing_done_at,
            (sample as any)?.tests_completed_at,
        ].filter(Boolean);

        if (doneFlags.length > 0) return true;

        const unlockedAt = (sample as any)?.quality_cover_unlocked_at ?? null;
        if (unlockedAt) return true;

        return false;
    }, [sample]);

    const qualityCoverDisabled = !isAnalyst;

    const tabButtonClass = (isActive: boolean) =>
        cx(
            "px-4 py-2 rounded-xl text-sm font-semibold transition",
            isActive ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-800"
        );

    // Keep user from landing on tab they can't access
    useEffect(() => {
        if (tab === "tests" && !canSeeTestsTab) setTab("summary");
        if (tab === "quality_cover" && !canSeeQualityCoverTab) setTab("summary");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, canSeeTestsTab, canSeeQualityCoverTab]);

    /* ----------------------------- Data Loaders ----------------------------- */
    const tryFetchReagentStatusByLoo = useCallback(async (loId: number) => {
        try {
            type ReagentByLooPayload = {
                request?: unknown;
                reagent_request?: unknown;
                reagentRequest?: unknown;
                reagentRequestLatest?: unknown;
                reagent_request_status?: unknown;
                reagentRequestStatus?: unknown;
            };

            const res = await apiGet<any>(`/v1/reagents/requests/loo/${loId}`);
            const payload = (unwrapApi(res) as ReagentByLooPayload | null) ?? null;

            const status =
                getReagentRequestStatus(payload as any) ??
                getReagentRequestStatus(payload?.request as any) ??
                getReagentRequestStatus(payload?.reagent_request as any) ??
                null;

            return status ? String(status).toLowerCase() : null;
        } catch {
            return null;
        }
    }, []);

    const loadSample = useCallback(
        async (opts?: { silent?: boolean }) => {
            if (!canViewSamples) {
                setLoading(false);
                return;
            }
            if (!sampleId || Number.isNaN(sampleId)) {
                setError(t("samples.pages.detail.invalidUrl", "Invalid sample URL."));
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
                setError(getErrorMessage(err) || t("samples.pages.detail.loadFailed", "Failed to load sample detail."));
                setSample(null);
            } finally {
                if (!silent) setLoading(false);
            }
        },
        [canViewSamples, navReagentStatus, sampleId, t, tryFetchReagentStatusByLoo]
    );

    const loadDocs = useCallback(async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setDocsLoading(true);
            setDocsError(null);

            const res = await apiGet<any>(`/v1/reports/documents?sample_id=${sampleId}`);
            const payload = unwrapApi(res);

            setDocs(Array.isArray(payload) ? payload : []);
        } catch (err: any) {
            setDocsError(getErrorMessage(err) || t("samples.pages.detail.loadDocsError", "Failed to load documents."));
            setDocs([]);
        } finally {
            setDocsLoading(false);
        }
    }, [sampleId, t]);

    const refreshAll = useCallback(async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        try {
            setPageRefreshing(true);
            await loadSample({ silent: true });
            await loadDocs();
        } finally {
            setPageRefreshing(false);
        }
    }, [loadDocs, loadSample, sampleId]);

    /* ----------------------------- Effects ----------------------------- */
    useEffect(() => {
        void loadSample();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadSample]);

    useEffect(() => {
        if (!loading && !error && sample) {
            void loadDocs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, loading, error, sample]);

    /* ----------------------------- Guard ----------------------------- */
    if (!canViewSamples) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">{t("errors.accessDeniedTitle")}</h1>
                <p className="text-sm text-gray-600 text-center max-w-md">
                    {t("errors.accessDeniedBodyWithRole", { role: roleLabel })}
                </p>

                <button
                    type="button"
                    onClick={goBack}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:translate-y-px transition"
                >
                    <ArrowLeft size={16} />
                    {t("back", "Back")}
                </button>
            </div>
        );
    }

    /* ----------------------------- Render ----------------------------- */
    const headerCode = labSampleCode || t("common.na", "—");

    return (
        <div className="min-h-[60vh]">
            <div className="lims-detail-shell">
                {/* Loading */}
                {loading && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <RefreshCw size={16} className="animate-spin text-primary" />
                        <span>{t("samples.pages.detail.loading", "Loading sample…")}</span>
                    </div>
                )}

                {/* Error */}
                {error && !loading && (
                    <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
                )}

                {!loading && !error && sample && (
                    <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3">
                                <button
                                    type="button"
                                    onClick={goBack}
                                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:translate-y-px transition"
                                    aria-label={t("back", "Back")}
                                    title={t("back", "Back")}
                                >
                                    <ArrowLeft size={16} />
                                    {t("back", "Back")}
                                </button>

                                <div>
                                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                                        {t("samples.pages.detail.title")}
                                    </h1>

                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-gray-500">{t("samples.info.labCode")}</span>
                                        <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                            {headerCode}
                                        </span>

                                        {(sample as any)?.updated_at ? (
                                            <span className="text-[11px] text-gray-500">
                                                {t("common.updatedAt", "updated {{at}}", {
                                                    at: formatDateTimeLocal((sample as any)?.updated_at),
                                                })}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="lims-icon-button"
                                    onClick={refreshAll}
                                    disabled={pageRefreshing}
                                    aria-label={t("refresh")}
                                    title={t("refresh")}
                                >
                                    <RefreshCw size={16} className={cx(pageRefreshing && "animate-spin")} />
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                            <div className="px-5 pt-5">
                                <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-1 flex-wrap">
                                    <button type="button" className={tabButtonClass(tab === "summary")} onClick={() => setTab("summary")}>
                                        {t("samples.pages.detail.tabs.summary")}
                                    </button>

                                    <button type="button" className={tabButtonClass(tab === "sample")} onClick={() => setTab("sample")}>
                                        {t("samples.pages.detail.tabs.sample")}
                                    </button>

                                    <button type="button" className={tabButtonClass(tab === "workflow")} onClick={() => setTab("workflow")}>
                                        {t("samples.pages.detail.tabs.workflow")}
                                    </button>

                                    {/* Tests */}
                                    {canSeeTestsTab ? (
                                        <button
                                            type="button"
                                            className={tabButtonClass(tab === "tests")}
                                            onClick={() => setTab("tests")}
                                            title={t("samples.pages.detail.tabs.tests")}
                                        >
                                            {t("samples.pages.detail.tabs.tests")}
                                        </button>
                                    ) : (
                                        <span
                                            className="px-4 py-2 text-xs font-semibold rounded-xl border border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-2"
                                            title={t("samples.pages.detail.hints.testsLocked", "Locked until Reagent Request is approved.")}
                                        >
                                            <Lock size={14} />
                                            {t("samples.pages.detail.tabs.tests")}
                                        </span>
                                    )}

                                    {/* Quality cover */}
                                    {canSeeQualityCoverTab ? (
                                        <button
                                            type="button"
                                            className={tabButtonClass(tab === "quality_cover")}
                                            onClick={() => setTab("quality_cover")}
                                            title={
                                                qualityCoverDisabled
                                                    ? t("samples.pages.detail.hints.qualityCoverReadOnly", "Read-only for your role.")
                                                    : t("samples.pages.detail.tabs.qualityCover")
                                            }
                                        >
                                            {t("samples.pages.detail.tabs.qualityCover")}
                                        </button>
                                    ) : (
                                        <span
                                            className="px-4 py-2 text-xs font-semibold rounded-xl border border-red-200 bg-red-50 text-red-700 inline-flex items-center gap-2"
                                            title={t("samples.pages.detail.hints.qualityCoverLocked", "Unlocks after final testing stage.")}
                                        >
                                            <Lock size={14} />
                                            {t("samples.pages.detail.tabs.qualityCover")}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="px-5 py-5">
                                {tab === "summary" && (
                                    <div className="space-y-6">
                                        <SampleStatusCard sample={sample} reagentRequestStatus={reagentRequestStatus} />
                                        <SampleDocumentsCard docs={docs} loading={docsLoading} error={docsError} />
                                    </div>
                                )}

                                {tab === "sample" && <SampleInfoTab sample={sample} />}

                                {tab === "workflow" && (
                                    <SampleWorkflowTab
                                        sample={sample}
                                        roleId={roleId ?? 0}
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
                                            await refreshAll();
                                            setTab("quality_cover");
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

export default SampleDetailPage;