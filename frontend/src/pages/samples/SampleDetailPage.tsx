// L:\Campus\Final Countdown\biotrace\frontend\src\pages\samples\SampleDetailPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate, formatDateTimeLocal } from "../../utils/date";
import { sampleService, Sample } from "../../services/samples";
import { apiGet, apiPost } from "../../services/api";

import { validateIntake } from "../../services/intake";
import { SampleTestsTab } from "../../components/samples/SampleTestsTab";

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
        validated: "bg-indigo-50 text-indigo-700 border-indigo-200",

        // request/intake-ish
        submitted: "bg-blue-50 text-blue-700 border-blue-200",
        returned: "bg-amber-50 text-amber-800 border-amber-200",
        ready_for_delivery: "bg-slate-50 text-slate-700 border-slate-200",
        physically_received: "bg-emerald-50 text-emerald-700 border-emerald-200",
        intake_checklist_passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
        intake_validated: "bg-indigo-50 text-indigo-700 border-indigo-200",
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
    const roleLabel = getUserRoleLabel(roleId);
    const sampleId = Number(id);

    // ✅ Fix "You are: UNKNOWN"
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

    // Intake validate UI state
    const [intakeValidating, setIntakeValidating] = useState(false);
    const [intakeError, setIntakeError] = useState<string | null>(null);
    const [intakeSuccess, setIntakeSuccess] = useState<string | null>(null);

    // Physical workflow UI state
    const [wfBusy, setWfBusy] = useState(false);
    const [wfError, setWfError] = useState<string | null>(null);

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
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to load sample detail.";
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

            // ✅ no dependency on missing sampleService.getStatusHistory / missing type export
            const res = await apiGet<any>(`/v1/samples/${sampleId}/status-history`);
            const items = (res?.data ?? res) as SampleStatusHistoryItem[];
            setHistory(Array.isArray(items) ? items : []);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to load status history.";
            setHistoryError(msg);
            setHistory([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        loadSample();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canViewSamples, sampleId]);

    useEffect(() => {
        if (!loading && !error && sample) loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, loading, error, sample]);

    const refreshAll = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setPageRefreshing(true);
            await loadSample({ silent: true });
            await loadHistory();
        } finally {
            setPageRefreshing(false);
        }
    };

    const requestStatus = String((sample as any)?.request_status ?? "");
    const labSampleCode = String((sample as any)?.lab_sample_code ?? "");

    const canValidateIntake = useMemo(() => {
        if (roleId !== ROLE_ID.LAB_HEAD) return false;
        const st = requestStatus.toLowerCase();
        if (!st) return true;
        if (st === "intake_validated") return false;
        if (st === "validated") return false;
        return true;
    }, [roleId, requestStatus]);

    const doValidateIntake = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setIntakeValidating(true);
            setIntakeError(null);
            setIntakeSuccess(null);

            await validateIntake(sampleId);

            await loadSample({ silent: true });
            await loadHistory();

            setIntakeSuccess("Intake validated successfully. Lab workflow should be active now.");
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to validate intake.";
            setIntakeError(msg);
        } finally {
            setIntakeValidating(false);
        }
    };

    // ---------------- Step 2: Physical workflow fields ----------------
    const adminReceivedFromClientAt = (sample as any)?.admin_received_from_client_at ?? null;
    const adminBroughtToCollectorAt = (sample as any)?.admin_brought_to_collector_at ?? null;
    const collectorReceivedAt = (sample as any)?.collector_received_at ?? null;
    const collectorIntakeCompletedAt = (sample as any)?.collector_intake_completed_at ?? null;

    // ✅ NEW: SC → Analyst handoff timestamps
    const scDeliveredToAnalystAt = (sample as any)?.sc_delivered_to_analyst_at ?? null;
    const analystReceivedAt = (sample as any)?.analyst_received_at ?? null;

    const collectorReturnedToAdminAt = (sample as any)?.collector_returned_to_admin_at ?? null;
    const adminReceivedFromCollectorAt = (sample as any)?.admin_received_from_collector_at ?? null;
    const clientPickedUpAt = (sample as any)?.client_picked_up_at ?? null;

    const isAdmin = roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.LAB_HEAD;
    const isCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const isAnalyst = roleId === ROLE_ID.ANALYST;

    const canWfAdminReceive =
        isAdmin && requestStatus.toLowerCase() === "physically_received" && !adminReceivedFromClientAt;

    const canWfAdminBring =
        isAdmin && !!adminReceivedFromClientAt && !adminBroughtToCollectorAt;

    const canWfCollectorReceive =
        isCollector && !!adminBroughtToCollectorAt && !collectorReceivedAt;

    const canWfCollectorIntakeDone =
        isCollector && !!collectorReceivedAt && !collectorIntakeCompletedAt;

    // ✅ NEW: handoff gating (SC delivers only after intake completed; Analyst receives only after SC delivered)
    const canWfScDeliverToAnalyst =
        isCollector && !!collectorIntakeCompletedAt && !scDeliveredToAnalystAt;

    const canWfAnalystReceive =
        isAnalyst && !!scDeliveredToAnalystAt && !analystReceivedAt;

    const canWfCollectorReturn =
        isCollector && !!collectorIntakeCompletedAt && !collectorReturnedToAdminAt;

    const canWfAdminReceiveBack =
        isAdmin && !!collectorReturnedToAdminAt && !adminReceivedFromCollectorAt;

    const canWfClientPickup =
        isAdmin && !!adminReceivedFromCollectorAt && !clientPickedUpAt;

    const doPhysicalWorkflow = async (action: string) => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setWfBusy(true);
            setWfError(null);

            // ✅ no prompt/alert note
            // backend tetap source of truth
            await apiPost<any>(`/v1/samples/${sampleId}/physical-workflow`, {
                action,
                note: null,
            });

            await loadSample({ silent: true });
            await loadHistory();
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
                                    {requestStatus ? (
                                        <>
                                            {" · "}request:{" "}
                                            <span className="font-mono text-xs">{requestStatus}</span>
                                        </>
                                    ) : null}
                                    {labSampleCode ? (
                                        <>
                                            {" · "}BML:{" "}
                                            <span className="font-mono text-xs">{labSampleCode}</span>
                                        </>
                                    ) : null}
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

                                <button className="lims-btn" type="button" onClick={() => navigate(-1)}>
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

                                        {/* Step 2: Physical Workflow */}
                                        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">Physical Workflow</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Admin ↔ Sample Collector handoff timestamps (backend enforces order).
                                                    </div>
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
                                                        { label: "Admin: received from client", at: adminReceivedFromClientAt },
                                                        { label: "Admin: brought to collector", at: adminBroughtToCollectorAt },
                                                        { label: "Collector: received", at: collectorReceivedAt },
                                                        { label: "Collector: intake completed", at: collectorIntakeCompletedAt },

                                                        // ✅ NEW: SC → Analyst handoff
                                                        { label: "SC: delivered to analyst", at: scDeliveredToAnalystAt },
                                                        { label: "Analyst: received", at: analystReceivedAt },

                                                        { label: "Collector: returned to admin", at: collectorReturnedToAdminAt },
                                                        { label: "Admin: received from collector", at: adminReceivedFromCollectorAt },
                                                        { label: "Client: picked up", at: clientPickedUpAt },
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
                                                                <div className="text-[11px] text-gray-600">
                                                                    {r.at ? formatDateTimeLocal(r.at) : "-"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <SmallPrimaryButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("admin_received_from_client")}
                                                        disabled={!canWfAdminReceive || wfBusy}
                                                        title="Admin marks received from client"
                                                    >
                                                        {wfBusy ? "Saving..." : "Admin: Received"}
                                                    </SmallPrimaryButton>

                                                    <SmallButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("admin_brought_to_collector")}
                                                        disabled={!canWfAdminBring || wfBusy}
                                                        title="Admin hands off to collector"
                                                    >
                                                        {wfBusy ? "Saving..." : "Admin: To Collector"}
                                                    </SmallButton>

                                                    <SmallButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("collector_received")}
                                                        disabled={!canWfCollectorReceive || wfBusy}
                                                        title="Collector confirms receipt"
                                                    >
                                                        {wfBusy ? "Saving..." : "Collector: Received"}
                                                    </SmallButton>

                                                    <SmallButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("collector_intake_completed")}
                                                        disabled={!canWfCollectorIntakeDone || wfBusy}
                                                        title="Collector marks intake completed"
                                                    >
                                                        {wfBusy ? "Saving..." : "Collector: Intake Completed"}
                                                    </SmallButton>

                                                    {/* ✅ NEW: SC → Analyst handoff actions */}
                                                    <SmallButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("sc_delivered_to_analyst")}
                                                        disabled={!canWfScDeliverToAnalyst || wfBusy}
                                                        title="Sample Collector delivers sample to analyst"
                                                    >
                                                        {wfBusy ? "Saving..." : "SC: Delivered to Analyst"}
                                                    </SmallButton>

                                                    <SmallButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("analyst_received")}
                                                        disabled={!canWfAnalystReceive || wfBusy}
                                                        title="Analyst confirms sample received"
                                                    >
                                                        {wfBusy ? "Saving..." : "Analyst: Received"}
                                                    </SmallButton>

                                                    <SmallButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("collector_returned_to_admin")}
                                                        disabled={!canWfCollectorReturn || wfBusy}
                                                        title="Collector returns to admin"
                                                    >
                                                        {wfBusy ? "Saving..." : "Collector: Return to Admin"}
                                                    </SmallButton>

                                                    <SmallButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("admin_received_from_collector")}
                                                        disabled={!canWfAdminReceiveBack || wfBusy}
                                                        title="Admin confirms receipt back"
                                                    >
                                                        {wfBusy ? "Saving..." : "Admin: Received Back"}
                                                    </SmallButton>

                                                    <SmallButton
                                                        type="button"
                                                        onClick={() => doPhysicalWorkflow("client_picked_up")}
                                                        disabled={!canWfClientPickup || wfBusy}
                                                        title="Admin records client pickup"
                                                    >
                                                        {wfBusy ? "Saving..." : "Admin: Client Picked Up"}
                                                    </SmallButton>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sample Info + Client & Creator + History (tetap seperti kamu) */}
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
                                                        <div className="lims-detail-value">
                                                            {sample.client?.name ?? `Client #${sample.client_id}`}
                                                        </div>
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
                                                        <div className="lims-detail-value">
                                                            {sample.creator?.name ?? `Staff #${sample.created_by}`}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <div className="lims-detail-label">Creator Email</div>
                                                        <div className="lims-detail-value break-all">{sample.creator?.email ?? "-"}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                                <div>
                                                    <h3 className="lims-detail-section-title mb-1">Audit Trail / Status History</h3>
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

                                {tab === "tests" && (
                                    <SampleTestsTab
                                        sampleId={sampleId}
                                        roleId={roleId}
                                        sample={sample}
                                        defaultAssignedTo={myStaffId}
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
