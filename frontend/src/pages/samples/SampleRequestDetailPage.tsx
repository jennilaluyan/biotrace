import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";
import { sampleService, type Sample } from "../../services/samples";
import { apiGet, apiPost, apiPatch } from "../../services/api";

import {
    approveSampleIdChange,
    rejectSampleIdChange,
    type SampleIdChangeRow,
    getLatestSampleIdChangeBySampleId,
} from "../../services/sampleIdChanges";
import SampleIdChangeDecisionModal from "../../components/samples/SampleIdChangeDecisionModal";

import { UpdateRequestStatusModal } from "../../components/samples/UpdateRequestStatusModal";
import { IntakeChecklistModal } from "../../components/intake/IntakeChecklistModal";
import AssignSampleIdModal from "../../components/samples/AssignSampleIdModal";
import FinalizeApprovedSampleIdModal from "../../components/samples/FinalizeApprovedSampleIdModal";

import { SampleRequestInfoTab } from "../../components/samples/requests/SampleRequestInfoTab";
import { SampleRequestWorkflowTab } from "../../components/samples/requests/SampleRequestWorkflowTab";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function safeApiMessage(err: any, fallback: string) {
    const data = err?.response?.data ?? err?.data ?? null;
    if (data && typeof data === "object") {
        const msg = (data as any).message ?? (data as any).error ?? null;
        if (typeof msg === "string" && msg.trim()) return msg.trim();
    }
    if (typeof err?.message === "string" && err.message.trim()) return err.message.trim();
    return fallback;
}

function normalizeStatusToken(raw?: string | null) {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function requestStatusLabel(t: TFunction, raw?: string | null) {
    const token = normalizeStatusToken(raw);
    if (!token) return "-";

    const map: Record<string, string> = {
        draft: "requestStatus.draft",
        submitted: "requestStatus.submitted",
        returned: "requestStatus.returned",
        needs_revision: "requestStatus.needsRevision",

        ready_for_delivery: "requestStatus.readyForDelivery",
        physically_received: "requestStatus.physicallyReceived",

        in_transit_to_collector: "requestStatus.inTransitToCollector",
        under_inspection: "requestStatus.underInspection",
        inspection_failed: "requestStatus.inspectionFailed",
        returned_to_admin: "requestStatus.returnedToAdmin",

        intake_checklist_passed: "requestStatus.intakeChecklistPassed",
        awaiting_verification: "requestStatus.awaitingVerification",
        intake_validated: "requestStatus.intakeValidated",

        waiting_sample_id_assignment: "requestStatus.waitingSampleIdAssignment",
        sample_id_pending_verification: "requestStatus.sampleIdPendingVerification",
        sample_id_approved_for_assignment: "requestStatus.sampleIdApprovedForAssignment",
        approved_for_assignment: "requestStatus.sampleIdApprovedForAssignment",
    };

    const key = map[token];
    if (!key) return raw ?? "-";

    const out = t(key);
    return out === key ? (raw ?? "-") : out;
}

function StatusPill({ value, t }: { value?: string | null; t: TFunction }) {
    const token = normalizeStatusToken(value);

    const tones: Record<string, string> = {
        draft: "bg-slate-100 text-slate-700 border-slate-200",
        submitted: "bg-blue-50 text-blue-700 border-blue-200",
        returned: "bg-red-50 text-red-700 border-red-200",
        needs_revision: "bg-red-50 text-red-700 border-red-200",
        ready_for_delivery: "bg-indigo-50 text-indigo-700 border-indigo-200",
        physically_received: "bg-emerald-50 text-emerald-700 border-emerald-200",
        in_transit_to_collector: "bg-amber-50 text-amber-800 border-amber-200",
        under_inspection: "bg-amber-50 text-amber-800 border-amber-200",
        inspection_failed: "bg-red-50 text-red-700 border-red-200",
        returned_to_admin: "bg-slate-100 text-slate-700 border-slate-200",
        intake_checklist_passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
        awaiting_verification: "bg-violet-50 text-violet-700 border-violet-200",
        intake_validated: "bg-indigo-50 text-indigo-700 border-indigo-200",
        waiting_sample_id_assignment: "bg-slate-50 text-slate-700 border-slate-200",
        sample_id_pending_verification: "bg-amber-50 text-amber-800 border-amber-200",
        sample_id_approved_for_assignment: "bg-emerald-50 text-emerald-700 border-emerald-200",
        approved_for_assignment: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };

    const tone = tones[token] || "bg-gray-50 text-gray-600 border-gray-200";
    const label = requestStatusLabel(t, value);

    return (
        <span className={cx("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border", tone)}>
            {label}
        </span>
    );
}

function SmallButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    const { className, ...rest } = props;
    return (
        <button
            {...rest}
            className={cx(
                "lims-btn",
                "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap inline-flex items-center gap-2",
                rest.disabled ? "opacity-60 cursor-not-allowed" : "",
                className
            )}
        />
    );
}

function TabButton(props: { active: boolean; children: ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={cx(
                "px-4 py-2 rounded-xl text-sm font-semibold transition",
                props.active ? "bg-white shadow-sm text-gray-900" : "text-gray-600 hover:text-gray-800"
            )}
        >
            {props.children}
        </button>
    );
}

function toSidRow(root: any, sidRaw: any): SampleIdChangeRow | null {
    if (!sidRaw) return null;

    const changeId = Number(
        sidRaw?.change_request_id ??
        sidRaw?.change_requestId ??
        sidRaw?.sample_id_change_request_id ??
        sidRaw?.sampleIdChangeRequestId ??
        sidRaw?.sample_id_change_id ??
        sidRaw?.change_id ??
        sidRaw?.changeId ??
        sidRaw?.id ??
        sidRaw?.change_request?.id ??
        root?.sample_id_change_request_id ??
        root?.sample_id_change_id ??
        root?.change_request_id ??
        root?.change_request?.id ??
        0
    );

    if (!Number.isFinite(changeId) || changeId <= 0) return null;

    const suggested = sidRaw?.suggested_lab_sample_code ?? sidRaw?.suggested_sample_id ?? sidRaw?.suggested ?? null;
    const proposed = sidRaw?.proposed_lab_sample_code ?? sidRaw?.proposed_sample_id ?? sidRaw?.proposed ?? null;

    const clientName = root?.client?.name ?? root?.client_name ?? (root?.client_id ? `Client #${root?.client_id}` : null);
    const clientEmail = root?.client?.email ?? root?.client_email ?? null;

    return {
        change_request_id: changeId,
        id: changeId,
        sample_id_change_id: changeId,

        sample_id: Number(root?.sample_id ?? root?.id ?? 0) || undefined,
        request_id: Number(root?.sample_id ?? root?.id ?? 0) || undefined,

        status: sidRaw?.status ?? "PENDING",

        suggested_sample_id: suggested ? String(suggested) : null,
        suggested_lab_sample_code: suggested ? String(suggested) : null,

        proposed_sample_id: proposed ? String(proposed) : null,
        proposed_lab_sample_code: proposed ? String(proposed) : null,

        client_name: clientName ? String(clientName) : null,
        client_email: clientEmail ? String(clientEmail) : null,
        workflow_group: root?.workflow_group ?? null,
    };
}

export default function SampleRequestDetailPage() {
    const { t } = useTranslation();

    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();

    const roleId = useMemo(() => {
        const pickRoleId = (obj: any): number | null => {
            if (!obj) return null;
            const candidates = [
                obj.role_id,
                obj.roleId,
                obj.role?.role_id,
                obj.role?.id,
                obj.role?.roleId,
                obj.user?.role_id,
                obj.user?.roleId,
                obj.data?.role_id,
                obj.data?.roleId,
                obj.staff?.role_id,
                obj.staff?.roleId,
            ];
            for (const c of candidates) {
                const n = Number(c);
                if (Number.isFinite(n) && n > 0) return n;
            }
            return null;
        };

        const fromUser = pickRoleId(user);
        if (fromUser) return fromUser;

        try {
            const keys = ["biotrace_auth", "biotrace_user", "auth", "user", "staff"];
            for (const k of keys) {
                const raw = localStorage.getItem(k);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                const fromStorage = pickRoleId(parsed);
                if (fromStorage) return fromStorage;
            }
        } catch {
            // ignore
        }

        const fallback = Number(getUserRoleId(user));
        return Number.isFinite(fallback) ? fallback : 0;
    }, [user]);

    const roleLabel = useMemo(() => getUserRoleLabel(roleId), [roleId]);
    const requestId = Number(id);

    const canView = useMemo(
        () =>
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.LAB_HEAD,
        [roleId]
    );

    const [workflowLogs, setWorkflowLogs] = useState<any[] | null>(null);
    const [tab, setTab] = useState<"info" | "workflow">("info");

    const [sample, setSample] = useState<Sample | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageRefreshing, setPageRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [returnModalOpen, setReturnModalOpen] = useState(false);
    const [intakeOpen, setIntakeOpen] = useState(false);

    const [assignOpen, setAssignOpen] = useState(false);
    const [finalizeApprovedOpen, setFinalizeApprovedOpen] = useState(false);
    const [assignFlash, setAssignFlash] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);

    const [wfBusy, setWfBusy] = useState(false);
    const [wfError, setWfError] = useState<string | null>(null);
    const [verifyBusy, setVerifyBusy] = useState(false);

    const [sidFetchedRaw, setSidFetchedRaw] = useState<any | null>(null);
    const [sidActiveRow, setSidActiveRow] = useState<SampleIdChangeRow | null>(null);
    const [sidPickOpen, setSidPickOpen] = useState(false);

    const [sidModalOpen, setSidModalOpen] = useState(false);
    const [sidModalMode, setSidModalMode] = useState<"approve" | "reject">("approve");
    const [sidBusy, setSidBusy] = useState(false);

    const labSampleCode = (sample as any)?.lab_sample_code ?? null;
    const verifiedAt = (sample as any)?.verified_at ?? null;

    const sidRaw =
        sidFetchedRaw ??
        (sample as any)?.sample_id_change ??
        (sample as any)?.sample_id_change_request ??
        (sample as any)?.sampleIdChange ??
        null;

    const sidRow: SampleIdChangeRow | null = useMemo(() => {
        if (!sample) return null;
        return toSidRow(sample as any, sidRaw);
    }, [sample, sidRaw]);

    const handleVerifySampleIdChange = async () => {
        setWfError(null);

        let row = sidRow;

        if (!row && Number.isFinite(requestId) && requestId > 0) {
            try {
                const fetched = await getLatestSampleIdChangeBySampleId(requestId);
                if (fetched) {
                    setSidFetchedRaw(fetched);
                    row = sample ? toSidRow(sample as any, fetched) : null;
                }
            } catch {
                // ignore
            }
        }

        if (!row) {
            setWfError(t("sampleRequestDetail.sampleIdChangeMissing"));
            return;
        }

        setSidActiveRow(row);
        setSidPickOpen(true);
    };

    const load = async (opts?: { silent?: boolean }) => {
        if (!canView) {
            setLoading(false);
            return;
        }
        if (!requestId || Number.isNaN(requestId)) {
            setError(t("errors.invalidRequestUrl"));
            setLoading(false);
            return;
        }

        const silent = !!opts?.silent;
        try {
            if (!silent) setLoading(true);
            setError(null);

            const data = await sampleService.getById(requestId);
            setSample(data);

            try {
                const res = await apiGet<any>(`/v1/samples/${requestId}/workflow-logs`);

                const unwrapLogs = (x: any): any[] | null => {
                    if (Array.isArray(x)) return x;
                    if (x && typeof x === "object") {
                        if (Array.isArray((x as any).data)) return (x as any).data;
                        if ((x as any).data && typeof (x as any).data === "object" && Array.isArray((x as any).data.data)) {
                            return (x as any).data.data;
                        }
                        if (Array.isArray((x as any).items)) return (x as any).items;
                    }
                    return null;
                };

                const arr = unwrapLogs(res);
                setWorkflowLogs(arr ?? []);
            } catch {
                setWorkflowLogs(null);
            }
        } catch (err: any) {
            setError(safeApiMessage(err, t("errors.failedToLoad")));
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canView, requestId]);

    const refresh = async () => {
        try {
            setPageRefreshing(true);
            await load({ silent: true });
        } finally {
            setPageRefreshing(false);
        }
    };

    const approve = async () => {
        if (!requestId || Number.isNaN(requestId)) return;
        try {
            setWfBusy(true);
            setWfError(null);
            await apiPost<any>(`/v1/samples/${requestId}/request-status`, { action: "accept" });
            await load({ silent: true });
            setTab("workflow");
        } catch (err: any) {
            setWfError(safeApiMessage(err, t("sampleRequestDetail.errors.approveFailed")));
        } finally {
            setWfBusy(false);
        }
    };

    const doMarkPhysicallyReceived = async () => {
        if (!requestId || Number.isNaN(requestId)) return;
        try {
            setWfBusy(true);
            setWfError(null);

            await apiPatch(`/v1/samples/${requestId}/physical-workflow`, {
                action: "admin_received_from_client",
                note: null,
            });

            await load({ silent: true });
            setTab("workflow");
        } catch (err: any) {
            setWfError(safeApiMessage(err, t("sampleRequestDetail.errors.updateStatusFailed")));
        } finally {
            setWfBusy(false);
        }
    };

    const doPhysicalWorkflow = async (action: string) => {
        if (!requestId || Number.isNaN(requestId)) return;
        try {
            setWfBusy(true);
            setWfError(null);
            await apiPatch<any>(`/v1/samples/${requestId}/physical-workflow`, { action, note: null });
            await load({ silent: true });
            setTab("workflow");
        } catch (err: any) {
            setWfError(safeApiMessage(err, t("sampleRequestDetail.errors.updateWorkflowFailed")));
        } finally {
            setWfBusy(false);
        }
    };

    const doVerify = async () => {
        if (!requestId || Number.isNaN(requestId)) return;
        if (verifyBusy) return;

        try {
            setVerifyBusy(true);
            setWfError(null);

            await apiPost(`/v1/samples/${requestId}/verify`, {});
            await load({ silent: true });
            setTab("workflow");
        } catch (err: any) {
            setWfError(safeApiMessage(err, t("sampleRequestDetail.errors.verifyFailed")));
        } finally {
            setVerifyBusy(false);
        }
    };

    if (!canView) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">{t("errors.accessDeniedTitle")}</h1>
                <p className="text-sm text-gray-600 text-center max-w-xl">
                    {t("errors.accessDeniedBodyWithRole", { role: roleLabel })}
                </p>
                <Link to="/samples/requests" className="mt-4 lims-btn-primary">
                    {t("sampleRequestDetail.backToList")}
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <span className="lims-breadcrumb-icon" aria-hidden="true">
                        <ArrowLeft className="h-4 w-4" />
                    </span>

                    <Link to="/samples/requests" className="lims-breadcrumb-link">
                        {t("sampleRequestDetail.breadcrumbList")}
                    </Link>

                    <span className="lims-breadcrumb-separator" aria-hidden="true">
                        <ChevronRight className="h-4 w-4" />
                    </span>

                    <span className="lims-breadcrumb-current">{t("sampleRequestDetail.breadcrumbDetail")}</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {loading && <div className="text-sm text-gray-600">{t("sampleRequestDetail.loading")}</div>}

                {error && !loading && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}

                {!loading && !error && sample && (
                    <div className="space-y-6">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <h1 className="text-lg md:text-xl font-bold text-gray-900">
                                    {t("sampleRequestDetail.title")}
                                </h1>

                                <div className="text-sm text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                                    <span>
                                        {t("sampleRequestDetail.requestId")}{" "}
                                        <span className="font-semibold">#{(sample as any)?.sample_id ?? requestId}</span>
                                    </span>

                                    <span className="text-gray-400">·</span>
                                    <span className="text-xs text-gray-500">{t("sampleRequestDetail.status")}</span>
                                    <StatusPill value={(sample as any)?.request_status ?? "-"} t={t} />

                                    {verifiedAt ? (
                                        <>
                                            <span className="text-gray-400">·</span>
                                            <span className="text-xs text-gray-500">{t("sampleRequestDetail.verified")}</span>
                                            <span className="text-xs font-semibold text-emerald-700">{formatDateTimeLocal(verifiedAt)}</span>
                                        </>
                                    ) : null}

                                    {labSampleCode ? (
                                        <>
                                            <span className="text-gray-400">·</span>
                                            <span className="text-xs text-gray-500">{t("sampleRequestDetail.labCode")}</span>
                                            <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                                {labSampleCode}
                                            </span>
                                        </>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <SmallButton type="button" onClick={refresh} disabled={pageRefreshing} className="flex items-center gap-2">
                                    <RefreshCw className="h-4 w-4" />
                                    {pageRefreshing ? t("common.refreshing") : t("common.refresh")}
                                </SmallButton>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                            <div className="px-5 pt-5">
                                <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-1 flex-wrap">
                                    <TabButton active={tab === "info"} onClick={() => setTab("info")}>
                                        {t("common.info")}
                                    </TabButton>
                                    <TabButton active={tab === "workflow"} onClick={() => setTab("workflow")}>
                                        {t("common.workflow")}
                                    </TabButton>
                                </div>
                            </div>

                            <div className="px-5 py-5">
                                {tab === "info" && <SampleRequestInfoTab sample={sample} />}

                                {tab === "workflow" && (
                                    <>
                                        <SampleRequestWorkflowTab
                                            sample={sample}
                                            roleId={roleId}
                                            roleLabel={roleLabel}
                                            wfBusy={wfBusy}
                                            wfError={wfError}
                                            verifyBusy={verifyBusy}
                                            assignFlash={assignFlash}
                                            workflowLogs={workflowLogs}
                                            onApprove={approve}
                                            onOpenReturn={() => setReturnModalOpen(true)}
                                            onMarkPhysicallyReceived={doMarkPhysicallyReceived}
                                            onDoPhysicalWorkflow={doPhysicalWorkflow}
                                            onOpenIntakeChecklist={() => setIntakeOpen(true)}
                                            onVerify={doVerify}
                                            onVerifySampleIdChange={handleVerifySampleIdChange}
                                            onOpenAssignSampleId={() => {
                                                const key = normalizeStatusToken((sample as any)?.request_status ?? "");
                                                const approvedKeys = ["sample_id_approved_for_assignment", "approved_for_assignment"];

                                                if (approvedKeys.includes(key)) {
                                                    setAssignOpen(false);
                                                    setFinalizeApprovedOpen(true);
                                                    return;
                                                }

                                                setFinalizeApprovedOpen(false);
                                                setAssignOpen(true);
                                            }}
                                        />

                                        {sidPickOpen ? (
                                            <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                                                <div className="absolute inset-0 bg-black/40" onClick={() => (sidBusy ? null : setSidPickOpen(false))} />

                                                <div className="relative w-full max-w-sm rounded-2xl bg-white shadow-xl border">
                                                    <div className="px-5 py-4 border-b">
                                                        <div className="text-sm font-bold text-gray-900">
                                                            {t("sampleRequestDetail.sidVerify.title")}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {t("sampleRequestDetail.sidVerify.subtitle")}
                                                        </div>
                                                    </div>

                                                    <div className="px-5 py-4 grid grid-cols-1 gap-2">
                                                        <div className="text-xs text-gray-500">
                                                            {sidActiveRow?.suggested_lab_sample_code || sidActiveRow?.suggested_sample_id ? (
                                                                <>
                                                                    {t("common.suggested")}:{" "}
                                                                    <span className="font-mono text-gray-800">
                                                                        {sidActiveRow?.suggested_lab_sample_code ?? sidActiveRow?.suggested_sample_id}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                " "
                                                            )}
                                                        </div>

                                                        <div className="text-xs text-gray-500">
                                                            {sidActiveRow?.proposed_lab_sample_code || sidActiveRow?.proposed_sample_id ? (
                                                                <>
                                                                    {t("common.proposed")}:{" "}
                                                                    <span className="font-mono text-gray-800">
                                                                        {sidActiveRow?.proposed_lab_sample_code ?? sidActiveRow?.proposed_sample_id}
                                                                    </span>
                                                                </>
                                                            ) : (
                                                                " "
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="px-5 pb-5 flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSidPickOpen(false)}
                                                            disabled={sidBusy}
                                                            className={cx("btn-outline", sidBusy && "opacity-60 cursor-not-allowed")}
                                                        >
                                                            {t("common.cancel")}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSidPickOpen(false);
                                                                setSidModalMode("reject");
                                                                setSidModalOpen(true);
                                                            }}
                                                            disabled={sidBusy || !sidActiveRow}
                                                            className={cx("btn-outline", (sidBusy || !sidActiveRow) && "opacity-60 cursor-not-allowed")}
                                                        >
                                                            {t("common.reject")}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSidPickOpen(false);
                                                                setSidModalMode("approve");
                                                                setSidModalOpen(true);
                                                            }}
                                                            disabled={sidBusy || !sidActiveRow}
                                                            className={cx("lims-btn-primary", (sidBusy || !sidActiveRow) && "opacity-60 cursor-not-allowed")}
                                                        >
                                                            {t("common.approve")}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}

                                        <SampleIdChangeDecisionModal
                                            open={sidModalOpen}
                                            mode={sidModalMode}
                                            busy={sidBusy}
                                            row={sidActiveRow}
                                            onClose={() => (sidBusy ? null : setSidModalOpen(false))}
                                            onConfirm={async (rejectReason?: string) => {
                                                if (!sidActiveRow) return;

                                                const changeId = Number(
                                                    sidActiveRow.change_request_id ?? sidActiveRow.id ?? sidActiveRow.sample_id_change_id ?? 0
                                                );
                                                if (!Number.isFinite(changeId) || changeId <= 0) return;

                                                setSidBusy(true);
                                                setWfError(null);

                                                try {
                                                    if (sidModalMode === "approve") {
                                                        await approveSampleIdChange(changeId);
                                                    } else {
                                                        const r = String(rejectReason ?? "").trim();
                                                        await rejectSampleIdChange(changeId, r);
                                                    }

                                                    setSidModalOpen(false);
                                                    setSidPickOpen(false);
                                                    setSidActiveRow(null);
                                                    setSidFetchedRaw(null);

                                                    await load({ silent: true });
                                                    setTab("workflow");
                                                } catch (e: any) {
                                                    setSidModalOpen(false);
                                                    setSidPickOpen(false);
                                                    setWfError(safeApiMessage(e, t("sampleRequestDetail.errors.sidDecisionFailed")));
                                                } finally {
                                                    setSidBusy(false);
                                                }
                                            }}
                                        />
                                    </>
                                )}
                            </div>
                        </div>

                        <AssignSampleIdModal
                            open={assignOpen}
                            sample={sample}
                            onClose={() => setAssignOpen(false)}
                            onDone={async (payload) => {
                                setAssignOpen(false);
                                setAssignFlash(payload.type ? { type: payload.type, message: payload.message } : null);
                                await load({ silent: true });

                                if (payload.type) {
                                    window.setTimeout(() => setAssignFlash(null), 9000);
                                }
                            }}
                        />

                        <FinalizeApprovedSampleIdModal
                            open={finalizeApprovedOpen}
                            sample={sample}
                            onClose={() => setFinalizeApprovedOpen(false)}
                            onDone={async (payload) => {
                                setFinalizeApprovedOpen(false);
                                setAssignFlash(payload.type ? { type: payload.type, message: payload.message } : null);
                                await load({ silent: true });

                                if (payload.type) {
                                    window.setTimeout(() => setAssignFlash(null), 9000);
                                }
                            }}
                        />

                        <UpdateRequestStatusModal
                            open={returnModalOpen}
                            sampleId={requestId}
                            action="return"
                            currentStatus={(sample as any)?.request_status ?? null}
                            onClose={() => setReturnModalOpen(false)}
                            onUpdated={async () => {
                                await load({ silent: true });
                                setTab("workflow");
                            }}
                        />

                        {intakeOpen ? (
                            <IntakeChecklistModal
                                open={intakeOpen}
                                onClose={() => setIntakeOpen(false)}
                                sampleId={requestId}
                                requestLabel={t("sampleRequestDetail.requestLabel", { id: requestId })}
                                onSubmitted={async () => {
                                    await load({ silent: true });
                                    setTab("workflow");
                                }}
                            />
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
