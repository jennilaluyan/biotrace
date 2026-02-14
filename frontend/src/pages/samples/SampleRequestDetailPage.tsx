import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";
import { sampleService, type Sample } from "../../services/samples";
import { apiPost, apiPatch } from "../../services/api";

import { approveSampleIdChange, rejectSampleIdChange, type SampleIdChangeRow } from "../../services/sampleIdChanges";
import SampleIdChangeDecisionModal from "../../components/samples/SampleIdChangeDecisionModal";

import { UpdateRequestStatusModal } from "../../components/samples/UpdateRequestStatusModal";
import { IntakeChecklistModal } from "../../components/intake/IntakeChecklistModal";
import AssignSampleIdModal from "../../components/samples/AssignSampleIdModal";

import { SampleRequestInfoTab } from "../../components/samples/requests/SampleRequestInfoTab";
import { SampleRequestWorkflowTab } from "../../components/samples/requests/SampleRequestWorkflowTab";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function StatusPill({ value }: { value?: string | null }) {
    const v = (value ?? "-").toLowerCase();
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
    };

    const tone = tones[v] || "bg-gray-50 text-gray-600 border-gray-200";
    const label =
        value
            ? (() => {
                const vv = value.toLowerCase();
                if (vv === "under_inspection") return "Under inspection";
                if (vv === "inspection_failed") return "Inspection failed";
                if (vv === "returned_to_admin") return "Returned to Admin";
                if (vv === "awaiting_verification") return "Awaiting verification";
                if (vv === "waiting_sample_id_assignment") return "Waiting sample ID assignment";
                if (vv === "approved_for_assignment") return "Approved for assignment";
                if (vv === "sample_id_pending_verification") return "Sample ID pending verification";
                if (vv === "sample_id_approved_for_assignment") return "Sample ID approved for assignment";
                return value;
            })()
            : "-";

    return (
        <span className={cx("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border", tone)}>
            {label}
        </span>
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

function TabButton(props: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
}) {
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

export default function SampleRequestDetailPage() {
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

    const [tab, setTab] = useState<"info" | "workflow">("info");

    const [sample, setSample] = useState<Sample | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageRefreshing, setPageRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [returnModalOpen, setReturnModalOpen] = useState(false);

    const [intakeOpen, setIntakeOpen] = useState(false);

    const [assignOpen, setAssignOpen] = useState(false);
    const [assignFlash, setAssignFlash] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);

    const [wfBusy, setWfBusy] = useState(false);
    const [wfError, setWfError] = useState<string | null>(null);
    const [verifyBusy, setVerifyBusy] = useState(false);

    // =========================
    // Sample ID change approval (OM/LH) — now inside Workflow tab
    // =========================
    const isOmOrLh = roleId === ROLE_ID.OPERATIONAL_MANAGER || roleId === ROLE_ID.LAB_HEAD;

    const sidChangeObj = (sample as any)?.sample_id_change ?? null;
    const sidStatus = String(sidChangeObj?.status ?? "").trim().toLowerCase();
    const sidCanAct = isOmOrLh && (sidStatus === "pending" || sidStatus === "submitted" || sidStatus === "waiting");

    const sidRow: SampleIdChangeRow | null = useMemo(() => {
        if (!sidChangeObj) return null;

        const changeId = Number(
            sidChangeObj?.change_request_id ??
            sidChangeObj?.change_requestId ??
            sidChangeObj?.id ??
            sidChangeObj?.sample_id_change_id ??
            sidChangeObj?.change_request_id ??
            0
        );

        if (!Number.isFinite(changeId) || changeId <= 0) return null;

        const suggested =
            sidChangeObj?.suggested_lab_sample_code ??
            sidChangeObj?.suggested_sample_id ??
            sidChangeObj?.suggested ??
            null;

        const proposed =
            sidChangeObj?.proposed_lab_sample_code ??
            sidChangeObj?.proposed_sample_id ??
            sidChangeObj?.proposed ??
            null;

        const clientName =
            (sample as any)?.client?.name ??
            (sample as any)?.client_name ??
            ((sample as any)?.client_id ? `Client #${(sample as any)?.client_id}` : null);

        const clientEmail =
            (sample as any)?.client?.email ??
            (sample as any)?.client_email ??
            null;

        return {
            change_request_id: changeId,
            id: changeId,
            sample_id_change_id: changeId,

            sample_id: Number((sample as any)?.sample_id ?? (sample as any)?.id ?? 0) || undefined,
            request_id: Number((sample as any)?.sample_id ?? (sample as any)?.id ?? 0) || undefined,

            status: sidChangeObj?.status ?? "PENDING",

            suggested_sample_id: suggested ? String(suggested) : null,
            suggested_lab_sample_code: suggested ? String(suggested) : null,

            proposed_sample_id: proposed ? String(proposed) : null,
            proposed_lab_sample_code: proposed ? String(proposed) : null,

            client_name: clientName ? String(clientName) : null,
            client_email: clientEmail ? String(clientEmail) : null,
            workflow_group: (sample as any)?.workflow_group ?? null,
        };
    }, [sample, sidChangeObj, sidStatus, isOmOrLh]);

    const [sidModalOpen, setSidModalOpen] = useState(false);
    const [sidModalMode, setSidModalMode] = useState<"approve" | "reject">("approve");
    const [sidBusy, setSidBusy] = useState(false);
    const [sidErr, setSidErr] = useState<string | null>(null);

    // nudge/highlight SID approval section when user clicks "Verify Sample ID change"
    const [sidNudge, setSidNudge] = useState(false);

    const nudgeSampleIdChangeApproval = () => {
        setWfError(null);
        setSidErr(null);

        // kalau backend belum kirim detail change request id, kita ga bisa approve/reject
        if (!sidRow) {
            setWfError(
                "Sample ID change details not found. Backend harus mengirim sample_id_change.change_request_id (atau id) agar OM/LH bisa approve/reject."
            );
            return;
        }

        setSidNudge(true);
        window.setTimeout(() => setSidNudge(false), 1500);

        window.requestAnimationFrame(() => {
            document.getElementById("sid-change-approval")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    };

    const requestStatus = (sample as any)?.request_status ?? null;
    const labSampleCode = (sample as any)?.lab_sample_code ?? null;
    const verifiedAt = (sample as any)?.verified_at ?? null;

    const load = async (opts?: { silent?: boolean }) => {
        if (!canView) {
            setLoading(false);
            return;
        }
        if (!requestId || Number.isNaN(requestId)) {
            setError("Invalid request URL.");
            setLoading(false);
            return;
        }

        const silent = !!opts?.silent;
        try {
            if (!silent) setLoading(true);
            setError(null);
            const data = await sampleService.getById(requestId);
            setSample(data);
        } catch (err: any) {
            const msg = err?.data?.message ?? err?.data?.error ?? err?.message ?? "Failed to load sample request detail.";
            setError(msg);
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
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to approve request.";
            setWfError(msg);
        } finally {
            setWfBusy(false);
        }
    };

    const doMarkPhysicallyReceived = async () => {
        if (!requestId || Number.isNaN(requestId)) return;
        try {
            setWfBusy(true);
            setWfError(null);

            // ✅ record admin_received_from_client_at (physical workflow evidence)
            await apiPatch(`/v1/samples/${requestId}/physical-workflow`, {
                action: "admin_received_from_client",
                note: null,
            });

            await load({ silent: true });
            setTab("workflow");
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to update status.";
            setWfError(msg);
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
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.message ??
                "Failed to verify.";
            setWfError(msg);
        } finally {
            setVerifyBusy(false);
        }
    };

    if (!canView) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to access sample requests.
                </p>
                <Link to="/samples/requests" className="mt-4 lims-btn-primary">
                    Back to Sample Requests
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
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
                    <Link to="/samples/requests" className="lims-breadcrumb-link">
                        Sample Requests
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">Detail</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {loading && <div className="text-sm text-gray-600">Loading request detail...</div>}

                {error && !loading && (
                    <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
                )}

                {!loading && !error && sample && (
                    <div className="space-y-6">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div>
                                <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample Request Detail</h1>

                                <div className="text-sm text-gray-600 mt-1 flex items-center gap-2 flex-wrap">
                                    <span>
                                        Request ID <span className="font-semibold">#{(sample as any)?.sample_id ?? requestId}</span>
                                    </span>
                                    <span className="text-gray-400">·</span>
                                    <span className="text-xs text-gray-500">status</span>
                                    <StatusPill value={(sample as any)?.request_status ?? "-"} />

                                    {verifiedAt ? (
                                        <>
                                            <span className="text-gray-400">·</span>
                                            <span className="text-xs text-gray-500">verified</span>
                                            <span className="text-xs font-semibold text-emerald-700">
                                                {formatDateTimeLocal(verifiedAt)}
                                            </span>
                                        </>
                                    ) : null}

                                    {labSampleCode ? (
                                        <>
                                            <span className="text-gray-400">·</span>
                                            <span className="text-xs text-gray-500">BML</span>
                                            <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                                {labSampleCode}
                                            </span>
                                        </>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <SmallButton
                                    type="button"
                                    onClick={refresh}
                                    disabled={pageRefreshing}
                                    className="flex items-center gap-2"
                                >
                                    <IconRefresh />
                                    {pageRefreshing ? "Refreshing..." : "Refresh"}
                                </SmallButton>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                            <div className="px-5 pt-5">
                                <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-2xl p-1 flex-wrap">
                                    <TabButton active={tab === "info"} onClick={() => setTab("info")}>
                                        Info
                                    </TabButton>
                                    <TabButton active={tab === "workflow"} onClick={() => setTab("workflow")}>
                                        Workflow
                                    </TabButton>
                                </div>
                            </div>

                            <div className="px-5 py-5">
                                {tab === "info" && <SampleRequestInfoTab sample={sample} />}

                                {tab === "workflow" && (
                                    <>
                                        {sidCanAct && sidRow ? (
                                            <div
                                                id="sid-change-approval"
                                                className={cx(
                                                    "mb-5 rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden scroll-mt-24",
                                                    sidNudge && "ring-2 ring-amber-400"
                                                )}
                                            >
                                                <div className="px-5 py-4 border-b border-amber-200 flex items-start justify-between gap-3 flex-wrap">
                                                    <div>
                                                        <div className="text-sm font-bold text-amber-900">Sample ID Change Approval</div>
                                                        <div className="text-xs text-amber-800 mt-1">
                                                            This request has a proposed Sample ID. Approve/reject here (no separate page).
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                                                                "bg-primary text-white hover:opacity-95",
                                                                (sidBusy || !sidCanAct) && "opacity-60 cursor-not-allowed"
                                                            )}
                                                            disabled={sidBusy || !sidCanAct}
                                                            onClick={() => {
                                                                setSidErr(null);
                                                                setSidModalMode("approve");
                                                                setSidModalOpen(true);
                                                            }}
                                                        >
                                                            Approve
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                                                                "bg-red-600 text-white hover:opacity-95",
                                                                (sidBusy || sidStatus !== "pending") && "opacity-60 cursor-not-allowed"
                                                            )}
                                                            disabled={sidBusy || sidStatus !== "pending"}
                                                            onClick={() => {
                                                                setSidErr(null);
                                                                setSidModalMode("reject");
                                                                setSidModalOpen(true);
                                                            }}
                                                        >
                                                            Reject
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="px-5 py-4">
                                                    {sidErr ? (
                                                        <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                                                            {sidErr}
                                                        </div>
                                                    ) : null}

                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                                        <div className="rounded-xl border border-amber-200 bg-white px-3 py-2">
                                                            <div className="text-xs text-amber-700">Suggested</div>
                                                            <div className="mt-1 font-mono text-xs font-semibold text-gray-900">
                                                                {sidRow.suggested_lab_sample_code ?? sidRow.suggested_sample_id ?? "—"}
                                                            </div>
                                                        </div>

                                                        <div className="rounded-xl border border-amber-200 bg-white px-3 py-2">
                                                            <div className="text-xs text-amber-700">Proposed</div>
                                                            <div className="mt-1 font-mono text-xs font-semibold text-gray-900">
                                                                {sidRow.proposed_lab_sample_code ?? sidRow.proposed_sample_id ?? "—"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : null}

                                        <SampleRequestWorkflowTab
                                            sample={sample}
                                            roleId={roleId}
                                            roleLabel={roleLabel}
                                            wfBusy={wfBusy}
                                            wfError={wfError}
                                            verifyBusy={verifyBusy}
                                            assignFlash={assignFlash}
                                            onApprove={approve}
                                            onOpenReturn={() => setReturnModalOpen(true)}
                                            onMarkPhysicallyReceived={doMarkPhysicallyReceived}
                                            onDoPhysicalWorkflow={doPhysicalWorkflow}
                                            onOpenIntakeChecklist={() => setIntakeOpen(true)}
                                            onVerify={doVerify}
                                            onVerifySampleIdChange={nudgeSampleIdChangeApproval}
                                            onOpenAssignSampleId={() => setAssignOpen(true)}
                                        />

                                        <SampleIdChangeDecisionModal
                                            open={sidModalOpen}
                                            mode={sidModalMode}
                                            busy={sidBusy}
                                            row={sidRow}
                                            onClose={() => (sidBusy ? null : setSidModalOpen(false))}
                                            onConfirm={async (rejectReason?: string) => {
                                                if (!sidRow) return;

                                                const changeId = Number(
                                                    sidChangeObj?.change_request_id ??
                                                    sidChangeObj?.change_requestId ??
                                                    sidChangeObj?.sample_id_change_request_id ??
                                                    sidChangeObj?.sampleIdChangeRequestId ??
                                                    sidChangeObj?.sample_id_change_id ??
                                                    sidChangeObj?.change_id ??
                                                    sidChangeObj?.changeId ??
                                                    sidChangeObj?.id ??
                                                    sidChangeObj?.change_request?.id ??
                                                    0
                                                );
                                                if (!Number.isFinite(changeId) || changeId <= 0) return;

                                                setSidBusy(true);
                                                setSidErr(null);

                                                try {
                                                    if (sidModalMode === "approve") {
                                                        await approveSampleIdChange(changeId);
                                                    } else {
                                                        const r = String(rejectReason ?? "").trim();
                                                        if (r.length < 3) {
                                                            setSidErr("Reject reason wajib diisi (min 3 karakter).");
                                                            setSidBusy(false);
                                                            return;
                                                        }
                                                        await rejectSampleIdChange(changeId, r);
                                                    }

                                                    setSidModalOpen(false);
                                                    await load({ silent: true });
                                                    setTab("workflow");
                                                } catch (e: any) {
                                                    const msg =
                                                        e?.response?.data?.message ??
                                                        e?.data?.message ??
                                                        e?.data?.error ??
                                                        e?.message ??
                                                        "Failed to process decision.";
                                                    setSidErr(msg);
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
                                requestLabel={`Request #${requestId}`}
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
