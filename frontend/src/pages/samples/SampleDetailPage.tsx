// frontend/src/pages/samples/SampleDetailPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate, formatDateTimeLocal } from "../../utils/date";
import { sampleService, Sample } from "../../services/samples";
import type { SampleStatusHistoryItem } from "../../services/samples";
import { apiGet } from "../../services/api";

import { AddSampleTestsModal } from "../../components/sampleTests/AddSampleTestsModal";
import { ResultEntryModal } from "../../components/sampleTests/ResultEntryModal";
import { updateSampleTestStatus } from "../../services/sampleTests";
import { ReagentCalculationPanel } from "../../components/sampleTests/ReagentCalculationPanel";

// ✅ Step 6: QC service
import { getQcSummary, type QcSummaryResponse } from "../../services/qc";
import { EnterQcModal } from "../../components/qc/EnterQcModal";

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

// hanya status yang boleh di-set oleh Analyst/Admin via status endpoint
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
    latest_result?: TestResultLite | null; // backend kamu pakai key ini
};

type Paginator<T> = {
    current_page: number;
    data: T[];
    first_page_url?: string | null;
    from?: number | null;
    last_page?: number;
    last_page_url?: string | null;
    next_page_url?: string | null;
    path?: string | null;
    per_page: number;
    prev_page_url?: string | null;
    to?: number | null;
    total: number;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

/* ----------------------------- UI atoms ----------------------------- */
function StatusPill({ value }: { value?: string | null }) {
    const v = (value ?? "-").toLowerCase();
    const tones: Record<string, string> = {
        draft: "bg-slate-100 text-slate-700 border-slate-200",
        in_progress: "bg-blue-50 text-blue-700 border-blue-200",
        measured: "bg-emerald-50 text-emerald-700 border-emerald-200",
        failed: "bg-red-50 text-red-700 border-red-200",
        verified: "bg-purple-50 text-purple-700 border-purple-200",
    };
    const tone = tones[v] || "bg-gray-50 text-gray-600 border-gray-200";

    return (
        <span
            title={value ?? "-"}
            className={cx(
                "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border",
                tone
            )}
        >
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

/* -------------------------------- Page -------------------------------- */
export const SampleDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(roleId); // ✅ FIX
    const sampleId = Number(id);

    const canViewSamples = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.LAB_HEAD ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR
        );
    }, [roleId]);

    const myStaffId =
        (user as any)?.staff_id ?? (user as any)?.staff?.staff_id ?? null;

    const [sample, setSample] = useState<Sample | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [pageRefreshing, setPageRefreshing] = useState(false);

    const [history, setHistory] = useState<SampleStatusHistoryItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const [tab, setTab] = useState<"overview" | "tests">("overview");

    const [testsPager, setTestsPager] = useState<Paginator<SampleTestRow> | null>(
        null
    );
    const [testsLoading, setTestsLoading] = useState(false);
    const [testsError, setTestsError] = useState<string | null>(null);
    const [testsPage, setTestsPage] = useState(1);
    const [testsStatus, setTestsStatus] = useState<string>("");
    const [openAddTests, setOpenAddTests] = useState(false);

    const [reagentRefreshKey, setReagentRefreshKey] = useState(0);

    const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);
    const [statusActionError, setStatusActionError] = useState<string | null>(
        null
    );

    const [resultRow, setResultRow] = useState<SampleTestRow | null>(null);
    const [openResultModal, setOpenResultModal] = useState(false);

    const canUpdateTestStatus = roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.ANALYST;
    const canEditResult = roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.ANALYST;

    const openResult = (t: SampleTestRow) => {
        setResultRow(t);
        setOpenResultModal(true);
    };

    const closeResult = () => {
        setOpenResultModal(false);
        setResultRow(null);
    };

    const canAddTests = useMemo(() => {
        return roleId === ROLE_ID.ANALYST;
    }, [roleId]);

    const [qc, setQc] = useState<QcSummaryResponse | null>(null); // ✅ FIX
    const [qcLoading, setQcLoading] = useState(false);
    const [qcError, setQcError] = useState<string | null>(null);

    const [openQcModal, setOpenQcModal] = useState(false);

    const qcStatus = String(qc?.summary?.status ?? "").toLowerCase();
    const qcCounts = qc?.summary?.counts ?? { pass: 0, warning: 0, fail: 0 };
    const qcIsFail = qcStatus === "fail";
    const qcIsWarning = qcStatus === "warning";
    const qcIsPass = qcStatus === "pass";

    const canEnterQc = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.LAB_HEAD
        );
    }, [roleId]);

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
            setSample(data);
        } catch (err: any) {
            const msg =
                err?.data?.message ?? err?.data?.error ?? "Failed to load sample detail.";
            setError(msg);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        loadSample();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canViewSamples, sampleId]);

    const loadHistory = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setHistoryLoading(true);
            setHistoryError(null);

            const items = await sampleService.getStatusHistory(sampleId);
            setHistory(items);
        } catch (err: any) {
            const msg =
                err?.data?.message ?? err?.data?.error ?? "Failed to load status history.";
            setHistoryError(msg);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (!loading && !error && sample) {
            loadHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, loading, error, sample]);

    const loadTests = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setTestsLoading(true);
            setTestsError(null);

            const qs = new URLSearchParams();
            qs.set("page", String(testsPage));
            qs.set("per_page", "50");
            if (testsStatus) qs.set("status", testsStatus);

            const res = await apiGet<any>(
                `/v1/samples/${sampleId}/sample-tests?${qs.toString()}`
            );

            const pager: Paginator<SampleTestRow> = res?.data ?? res; // ✅ more robust
            setTestsPager(pager);
        } catch (err: any) {
            const msg =
                err?.data?.message ?? err?.data?.error ?? "Failed to load sample tests.";
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
        if (tab !== "tests") return;
        if (loading || error || !sample) return;
        loadTests();
        loadQc();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, loading, error, sample, testsPage, testsStatus]);

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
                "Failed to update test status.";
            setStatusActionError(msg);
        } finally {
            setStatusUpdatingId(null);
        }
    };

    const refreshAll = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setPageRefreshing(true);

            await loadSample({ silent: true });
            await loadHistory();

            if (tab === "tests") {
                await loadTests();
                await loadQc();
                setReagentRefreshKey((k) => k + 1);
            }
        } finally {
            setPageRefreshing(false);
        }
    };

    const tests = testsPager?.data ?? [];
    const totalTests = testsPager?.total ?? tests.length;

    const resultHeaderLine = useMemo(() => {
        if (!resultRow) return undefined;

        const pname =
            resultRow.parameter?.name ?? `Parameter #${resultRow.parameter_id}`;
        const mname = resultRow.method?.name ?? `Method #${resultRow.method_id}`;
        return `${pname} • ${mname} • Status: ${resultRow.status}`;
    }, [resultRow]);

    if (!canViewSamples) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not
                    allowed to access the samples module.
                </p>
                <Link to="/samples" className="mt-4 lims-btn-primary">
                    Back to samples
                </Link>
            </div>
        );
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
                {loading && (
                    <div className="text-sm text-gray-600">Loading sample detail...</div>
                )}

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
                                <h1 className="text-lg md:text-xl font-bold text-gray-900">
                                    Sample Detail
                                </h1>
                                <div className="text-sm text-gray-600 mt-1">
                                    Sample ID{" "}
                                    <span className="font-semibold">#{sample.sample_id}</span>
                                    {" · "}Current Status{" "}
                                    <span className="font-semibold">{sample.current_status}</span>
                                    {" · "}high-level:{" "}
                                    <span className="font-mono text-xs">
                                        {sample.status_enum ?? "-"}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <SmallButton
                                    type="button"
                                    onClick={refreshAll}
                                    disabled={pageRefreshing}
                                    title="Refresh sample, history, and current tab"
                                    aria-label="Refresh sample detail"
                                    className="flex items-center gap-2"
                                >
                                    <IconRefresh />
                                    {pageRefreshing ? "Refreshing..." : "Refresh"}
                                </SmallButton>

                                <button
                                    className="lims-btn"
                                    type="button"
                                    onClick={() => navigate(-1)}
                                >
                                    Back
                                </button>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                            <div className="px-5 pt-5">
                                <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-1">
                                    <button
                                        type="button"
                                        className={cx(
                                            "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                            tab === "overview"
                                                ? "bg-white shadow-sm text-gray-900"
                                                : "text-gray-600 hover:text-gray-800"
                                        )}
                                        onClick={() => setTab("overview")}
                                    >
                                        Overview
                                    </button>
                                    <button
                                        type="button"
                                        className={cx(
                                            "px-4 py-2 rounded-xl text-sm font-semibold transition",
                                            tab === "tests"
                                                ? "bg-white shadow-sm text-gray-900"
                                                : "text-gray-600 hover:text-gray-800"
                                        )}
                                        onClick={() => setTab("tests")}
                                    >
                                        Tests
                                    </button>
                                </div>
                            </div>

                            {/* Tab content */}
                            <div className="px-5 py-5">
                                {tab === "overview" && (
                                    <div className="space-y-6">
                                        {/* ... (bagian overview kamu aman, aku biarin sama) */}
                                        {/* History block tetap sama seperti punya kamu */}
                                        {/* (aku tidak ubah konten, hanya fixing errors) */}

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div>
                                                <h3 className="lims-detail-section-title mb-3">
                                                    Sample Info
                                                </h3>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div>
                                                        <div className="lims-detail-label">Sample Type</div>
                                                        <div className="lims-detail-value">
                                                            {sample.sample_type}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Received At</div>
                                                        <div className="lims-detail-value">
                                                            {formatDate(sample.received_at)}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Priority</div>
                                                        <div className="lims-detail-value">
                                                            {String(sample.priority ?? "-")}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Contact History</div>
                                                        <div className="lims-detail-value">
                                                            {sample.contact_history ?? "-"}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">
                                                            Examination Purpose
                                                        </div>
                                                        <div className="lims-detail-value">
                                                            {sample.examination_purpose ?? "-"}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Additional Notes</div>
                                                        <div className="lims-detail-value">
                                                            {sample.additional_notes ?? "-"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <h3 className="lims-detail-section-title mb-3">
                                                    Client & Creator
                                                </h3>
                                                <div className="grid grid-cols-2 gap-3 text-sm">
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Client</div>
                                                        <div className="lims-detail-value">
                                                            {sample.client?.name ?? `Client #${sample.client_id}`}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Client Email</div>
                                                        <div className="lims-detail-value break-all">
                                                            {sample.client?.email ?? "-"}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">Client Phone</div>
                                                        <div className="lims-detail-value">
                                                            {sample.client?.phone ?? "-"}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Created By</div>
                                                        <div className="lims-detail-value">
                                                            {sample.creator?.name ?? `Staff #${sample.created_by}`}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Creator Email</div>
                                                        <div className="lims-detail-value break-all">
                                                            {sample.creator?.email ?? "-"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                <div>
                                                    <h3 className="lims-detail-section-title mb-1">
                                                        Audit Trail / Status History
                                                    </h3>
                                                    <div className="text-xs text-gray-500">
                                                        {historyLoading
                                                            ? "Refreshing history..."
                                                            : history.length > 0
                                                                ? `${history.length} event(s)`
                                                                : "No status changes yet."}
                                                    </div>
                                                </div>

                                                <SmallButton
                                                    type="button"
                                                    onClick={loadHistory}
                                                    disabled={historyLoading}
                                                    className="flex items-center gap-2"
                                                >
                                                    <IconRefresh />
                                                    {historyLoading ? "Refreshing..." : "Refresh"}
                                                </SmallButton>
                                            </div>

                                            {historyError && !historyLoading && (
                                                <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mt-3">
                                                    {historyError}
                                                </div>
                                            )}

                                            {!historyLoading && !historyError && history.length === 0 && (
                                                <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                                                    No status changes yet.
                                                </div>
                                            )}

                                            {!historyLoading && !historyError && history.length > 0 && (
                                                <div className="space-y-3 mt-3">
                                                    {history.map((h) => (
                                                        <div
                                                            key={h.id}
                                                            className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div>
                                                                    <div className="text-sm font-semibold text-gray-900">
                                                                        {h.actor?.name ?? "System"}
                                                                        {h.actor?.role?.name ? ` • ${h.actor.role.name}` : ""}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        {formatDateTimeLocal(h.created_at)}
                                                                    </div>
                                                                </div>
                                                                <div className="text-xs font-medium text-gray-700">
                                                                    {h.from_status ? `${h.from_status} → ` : ""}
                                                                    {h.to_status ?? "-"}
                                                                </div>
                                                            </div>

                                                            {h.note && (
                                                                <div className="mt-2 text-sm text-gray-700">
                                                                    <span className="font-semibold">Note:</span>{" "}
                                                                    {h.note}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {tab === "tests" && (
                                    <div className="space-y-4">
                                        {/* Tests toolbar */}
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div>
                                                <div className="text-sm font-semibold text-gray-900">
                                                    Tests
                                                </div>
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
                                                    <SmallPrimaryButton
                                                        type="button"
                                                        onClick={() => setOpenQcModal(true)}
                                                        title="Enter QC run"
                                                    >
                                                        Enter QC
                                                    </SmallPrimaryButton>
                                                )}

                                                {canAddTests && (
                                                    <button
                                                        className="lims-btn-primary"
                                                        type="button"
                                                        onClick={() => setOpenAddTests(true)}
                                                    >
                                                        Add Tests
                                                    </button>
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

                                                    {qcError && (
                                                        <div className="mt-2 text-xs text-red-800">
                                                            QC error: {qcError}
                                                        </div>
                                                    )}
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

                                        {!testsLoading && !testsError && tests.length === 0 && (
                                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                                                No tests yet.{" "}
                                                {canAddTests ? (
                                                    <span>
                                                        Click <span className="font-semibold">Add Tests</span> to create sample tests.
                                                    </span>
                                                ) : (
                                                    <span>(You don’t have permission to add tests.)</span>
                                                )}
                                            </div>
                                        )}

                                        {statusActionError && (
                                            <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                                                {statusActionError}
                                            </div>
                                        )}

                                        {!testsLoading && !testsError && (
                                            <ReagentCalculationPanel sampleId={sampleId} refreshKey={reagentRefreshKey} />
                                        )}

                                        {/* Sample Tests Table (FIX: previously not rendered) */}
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
                                                                <th className="px-4 py-3">Result</th>
                                                                <th className="px-4 py-3 text-right">
                                                                    Actions
                                                                    <div className="text-[11px] font-normal text-gray-400 mt-0.5">
                                                                        click buttons
                                                                    </div>
                                                                </th>
                                                            </tr>
                                                        </thead>

                                                        <tbody>
                                                            {tests.map((t) => {
                                                                const pname = t.parameter?.name ?? `Parameter #${t.parameter_id}`;
                                                                const mname = t.method?.name ?? (t.method_id ? `Method #${t.method_id}` : "-");
                                                                const aname = t.assignee?.name ?? (t.assigned_to ? `Staff #${t.assigned_to}` : "-");
                                                                const hasResult = !!t.latest_result?.result_id;
                                                                const disableAdvance = qcIsFail || statusUpdatingId === t.sample_test_id;

                                                                return (
                                                                    <tr key={t.sample_test_id} className="group border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                                                                        <td className="px-4 py-4">
                                                                            <div className="font-bold text-gray-800 group-hover:text-primary transition-colors">{pname}</div>
                                                                            <div className="flex gap-2 mt-1">
                                                                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded font-mono">#{t.sample_test_id}</span>
                                                                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 rounded font-mono">PID:{t.parameter_id}</span>
                                                                            </div>
                                                                        </td>

                                                                        <td className="px-4 py-4 text-gray-600 font-medium">{mname}</td>

                                                                        <td className="px-4 py-4">
                                                                            <div className="text-gray-700">{aname}</div>
                                                                        </td>

                                                                        <td className="px-4 py-4">
                                                                            <StatusPill value={t.status} />
                                                                        </td>

                                                                        {/* Kolom Result: Sekarang lebih terlihat seperti tombol interaktif */}
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
                                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                                </svg>
                                                                                {hasResult ? "View Result" : "Enter Result"}
                                                                            </button>
                                                                        </td>

                                                                        <td className="px-4 py-4 text-right">
                                                                            <div className="flex justify-end items-center gap-2">
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
                                                                                        {t.status === "measured" ? "Waiting Verification" : "Locked"}
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

                                                {/* Pagination controls */}
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
                                                            Page <span className="font-semibold text-gray-700">{testsPager.current_page}</span>{" "}
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

                                    </div>
                                )}
                            </div>
                        </div>

                        <AddSampleTestsModal
                            open={openAddTests}
                            onClose={() => setOpenAddTests(false)}
                            sampleId={sampleId}
                            defaultAssignedTo={myStaffId}
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
                )}
            </div>
        </div>
    );
};
