import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";
import { sampleService, type Sample } from "../../services/samples";
import { apiPost, apiPatch } from "../../services/api";
import { UpdateRequestStatusModal } from "../../components/samples/UpdateRequestStatusModal";
import { LoaPanelStaff } from "../../components/loa/LoaPanelStaff";
import { IntakeChecklistModal } from "../../components/intake/IntakeChecklistModal";

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
        intake_validated: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
    const tone = tones[v] || "bg-gray-50 text-gray-600 border-gray-200";
    const label =
        value
            ? (() => {
                const vv = value.toLowerCase();
                if (vv === "under_inspection") return "Under inspection";
                if (vv === "inspection_failed") return "Inspection failed";
                if (vv === "returned_to_admin") return "Returned to Admin";
                return value;
            })()
            : "-"

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

function WorkflowActionButton(props: {
    title: string;
    subtitle: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "primary" | "neutral";
    busy?: boolean;
}) {
    const { title, subtitle, onClick, disabled, variant = "neutral", busy } = props;

    const base =
        "w-full text-left rounded-2xl border px-4 py-3 transition " +
        "focus:outline-none focus:ring-2 focus:ring-offset-2 " +
        (disabled ? "opacity-60 cursor-not-allowed" : "hover:shadow-sm");

    const tone =
        variant === "primary"
            ? "bg-amber-50 border-amber-200 focus:ring-amber-300"
            : "bg-white border-slate-200 focus:ring-slate-300";

    return (
        <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${tone}`}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="font-semibold text-sm text-slate-900">{busy ? "Saving..." : title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{subtitle}</div>
                </div>
                <div className="text-slate-400 text-sm">{disabled ? "Locked" : "→"}</div>
            </div>
        </button>
    );
}

export default function SampleRequestDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
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
        () => roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.SAMPLE_COLLECTOR,
        [roleId]
    );

    const [sample, setSample] = useState<Sample | null>(null);
    const [loading, setLoading] = useState(true);
    const [pageRefreshing, setPageRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalAction, setModalAction] = useState<"return" | "received">("return");

    const [intakeOpen, setIntakeOpen] = useState(false);

    const requestStatus = String((sample as any)?.request_status ?? "").toLowerCase();
    const labSampleCode = String((sample as any)?.lab_sample_code ?? "");

    const isDraft = requestStatus === "draft" && !labSampleCode;
    const isSubmitted = requestStatus === "submitted";
    const isReturned = requestStatus === "returned" || requestStatus === "needs_revision";

    const isApprovedOrLater =
        requestStatus === "ready_for_delivery" ||
        requestStatus === "physically_received" ||
        requestStatus === "in_transit_to_collector" ||
        requestStatus === "under_inspection" ||
        requestStatus === "inspection_failed" ||
        requestStatus === "returned_to_admin" ||
        requestStatus === "intake_checklist_passed" ||
        requestStatus === "intake_validated";

    const showPostApproveSections = isApprovedOrLater;

    const adminReceivedFromClientAt = (sample as any)?.admin_received_from_client_at ?? null;
    const adminBroughtToCollectorAt = (sample as any)?.admin_brought_to_collector_at ?? null;
    const collectorReceivedAt = (sample as any)?.collector_received_at ?? null;
    const collectorIntakeCompletedAt = (sample as any)?.collector_intake_completed_at ?? null;
    const collectorReturnedToAdminAt = (sample as any)?.collector_returned_to_admin_at ?? null;
    const adminReceivedFromCollectorAt = (sample as any)?.admin_received_from_collector_at ?? null;
    const clientPickedUpAt = (sample as any)?.client_picked_up_at ?? null;

    const isAdmin = roleId === ROLE_ID.ADMIN;
    const isCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;

    const canWfAdminReceive =
        isAdmin &&
        (requestStatus === "ready_for_delivery" || requestStatus === "physically_received") &&
        !adminReceivedFromClientAt;

    const canWfAdminBring = isAdmin && !!adminReceivedFromClientAt && !adminBroughtToCollectorAt;

    const canWfCollectorReceive =
        isCollector &&
        requestStatus === "in_transit_to_collector" &&
        !!adminBroughtToCollectorAt &&
        !collectorReceivedAt;

    const canWfCollectorReturnToAdmin =
        isCollector &&
        requestStatus === "inspection_failed" &&
        !!collectorIntakeCompletedAt &&
        !collectorReturnedToAdminAt;

    const canOpenIntakeChecklist =
        isCollector &&
        requestStatus === "under_inspection" &&
        !!collectorReceivedAt &&
        !collectorIntakeCompletedAt;

    const canWfAdminReceiveBack =
        isAdmin && !!collectorReturnedToAdminAt && !adminReceivedFromCollectorAt;

    const canWfClientPickup = isAdmin && !!adminReceivedFromCollectorAt && !clientPickedUpAt;

    const [wfBusy, setWfBusy] = useState(false);
    const [wfError, setWfError] = useState<string | null>(null);

    const returnNote = useMemo(() => {
        const note = String((sample as any)?.request_return_note ?? "").trim();
        return note || null;
    }, [sample]);

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
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to load sample request detail.";
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

    const openReturn = () => {
        setModalAction("return");
        setModalOpen(true);
    };

    const openReceived = () => {
        setModalAction("received");
        setModalOpen(true);
    };

    const closeModal = () => setModalOpen(false);

    const approve = async () => {
        if (!requestId || Number.isNaN(requestId)) return;
        try {
            setError(null);
            await apiPost<any>(`/v1/samples/${requestId}/request-status`, { action: "accept" });
            await load({ silent: true });
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Failed to approve request.";
            setError(msg);
        }
    };

    const doPhysicalWorkflow = async (action: string) => {
        if (!requestId || Number.isNaN(requestId)) return;
        try {
            setWfBusy(true);
            setWfError(null);
            await apiPatch<any>(`/v1/samples/${requestId}/physical-workflow`, { action, note: null });
            await load({ silent: true });
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

    const doMarkPhysicallyReceived = async () => {
        if (!requestId || Number.isNaN(requestId)) return;
        try {
            setWfBusy(true);
            setWfError(null);
            await apiPost(`/v1/samples/${requestId}/request-status`, { action: "received", note: null });
            await load({ silent: true });
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
                    <span className="lims-breadcrumb-current">Sample Request Detail</span>
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
                                        Request ID <span className="font-semibold">#{sample.sample_id}</span>
                                    </span>
                                    <span className="text-gray-400">·</span>
                                    <span className="text-xs text-gray-500">status</span>
                                    <StatusPill value={(sample as any)?.request_status ?? "-"} />
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

                        {labSampleCode ? (
                            <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                                <div className="font-semibold">This request has been promoted to a lab sample.</div>
                                <div className="mt-1">
                                    Lab code: <span className="font-mono">{labSampleCode}</span>
                                </div>
                                <div className="mt-3">
                                    <button
                                        type="button"
                                        className="lims-btn-primary"
                                        onClick={() => navigate(`/samples/${requestId}`)}
                                    >
                                        Open in Samples
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {isDraft ? (
                            <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-4 text-sm text-red-800">
                                This request is still <span className="font-semibold">draft</span> and is only visible to the client.
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {(isSubmitted || isReturned) && isAdmin && (
                                        <>
                                            <SmallPrimaryButton type="button" onClick={approve}>
                                                Approve
                                            </SmallPrimaryButton>
                                            <SmallButton
                                                type="button"
                                                className="border-red-200 text-red-700 hover:bg-red-50"
                                                onClick={openReturn}
                                            >
                                                Return
                                            </SmallButton>
                                        </>
                                    )}

                                    {isAdmin && requestStatus === "ready_for_delivery" && (
                                        <SmallButton type="button" onClick={openReceived}>
                                            Mark Physically Received
                                        </SmallButton>
                                    )}
                                </div>

                                {returnNote && isReturned && (
                                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                        <div className="font-semibold">Return note sent to client</div>
                                        <div className="mt-1 whitespace-pre-wrap">{returnNote}</div>
                                    </div>
                                )}

                                <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                                        <div className="text-sm font-bold text-gray-900">Sample Info</div>
                                        <div className="text-xs text-gray-500 mt-1">
                                            Review request details before approving. Operational workflow becomes available after approval.
                                        </div>
                                    </div>

                                    <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <div className="lims-detail-label">Sample Type</div>
                                            <div className="lims-detail-value">{sample.sample_type ?? "-"}</div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">Scheduled Delivery</div>
                                            <div className="lims-detail-value">
                                                {(sample as any)?.scheduled_delivery_at
                                                    ? formatDateTimeLocal((sample as any).scheduled_delivery_at)
                                                    : "-"}
                                            </div>
                                        </div>

                                        <div className="lg:col-span-2">
                                            <div className="lims-detail-label">Requested Parameters</div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {(sample as any)?.requested_parameters?.length ? (
                                                    (sample as any).requested_parameters.map((p: any) => {
                                                        const code = String(p?.code ?? "").trim();
                                                        const name = String(p?.name ?? "").trim();
                                                        const label = (code ? `${code} — ` : "") + (name || `Parameter #${p?.parameter_id ?? ""}`);
                                                        return (
                                                            <span
                                                                key={String(p?.parameter_id)}
                                                                className="inline-flex items-center rounded-full px-3 py-1 text-xs border bg-gray-50 text-gray-800 border-gray-200"
                                                                title={label}
                                                            >
                                                                {label}
                                                            </span>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-gray-600">-</span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="lg:col-span-2">
                                            <div className="lims-detail-label">Examination Purpose</div>
                                            <div className="lims-detail-value">{sample.examination_purpose ?? "-"}</div>
                                        </div>

                                        <div className="lg:col-span-2">
                                            <div className="lims-detail-label">Additional Notes</div>
                                            <div className="lims-detail-value">{sample.additional_notes ?? "-"}</div>
                                        </div>

                                        <div className="lg:col-span-2">
                                            <div className="lims-detail-label">Client</div>
                                            <div className="lims-detail-value">
                                                {sample.client?.name ?? (sample.client_id ? `Client #${sample.client_id}` : "-")}
                                                {sample.client?.email ? (
                                                    <span className="text-xs text-gray-500"> · {sample.client.email}</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {showPostApproveSections && (
                                    <>
                                        {isAdmin && (
                                            <LoaPanelStaff
                                                sampleId={requestId}
                                                roleId={roleId}
                                                samplePayload={sample}
                                                onChanged={async () => {
                                                    await load({ silent: true });
                                                }}
                                            />
                                        )}

                                        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-bold text-gray-900">Physical Workflow</div>
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        Admin ↔ Sample Collector handoff timestamps (backend enforces order).
                                                    </div>
                                                </div>
                                                <div className="text-[11px] text-gray-500">
                                                    You are: <span className="font-semibold">{roleLabel}</span>
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

                                                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {isAdmin ? (
                                                        <>
                                                            <WorkflowActionButton
                                                                title="Admin: Received from client"
                                                                subtitle="Record the time the sample arrived at the admin desk."
                                                                onClick={doMarkPhysicallyReceived}
                                                                disabled={!canWfAdminReceive || wfBusy}
                                                                busy={wfBusy}
                                                                variant="neutral"
                                                            />

                                                            <WorkflowActionButton
                                                                title="Admin: Hand off to Sample Collector"
                                                                subtitle="Marks this request as In transit to Sample Collector."
                                                                onClick={() => doPhysicalWorkflow("admin_brought_to_collector")}
                                                                disabled={!canWfAdminBring || wfBusy}
                                                                busy={wfBusy}
                                                                variant="primary"
                                                            />

                                                            <WorkflowActionButton
                                                                title="Admin: Received back from collector"
                                                                subtitle="Record the time the collector returned the sample to admin."
                                                                onClick={() => doPhysicalWorkflow("admin_received_from_collector")}
                                                                disabled={!canWfAdminReceiveBack || wfBusy}
                                                                busy={wfBusy}
                                                                variant="neutral"
                                                            />

                                                            <WorkflowActionButton
                                                                title="Admin: Client picked up"
                                                                subtitle="Final step for returned samples — record pickup time."
                                                                onClick={() => doPhysicalWorkflow("client_picked_up")}
                                                                disabled={!canWfClientPickup || wfBusy}
                                                                busy={wfBusy}
                                                                variant="neutral"
                                                            />
                                                        </>
                                                    ) : null}

                                                    {isCollector ? (
                                                        <>
                                                            <WorkflowActionButton
                                                                title="Collector: Received"
                                                                subtitle="Confirm you received the sample from admin. Status becomes Under inspection."
                                                                onClick={() => doPhysicalWorkflow("collector_received")}
                                                                disabled={!canWfCollectorReceive || wfBusy}
                                                                busy={wfBusy}
                                                                variant="primary"
                                                            />

                                                            <WorkflowActionButton
                                                                title="Collector: Intake checklist"
                                                                subtitle="Complete the intake checks. All categories must pass."
                                                                onClick={() => setIntakeOpen(true)}
                                                                disabled={!canOpenIntakeChecklist || wfBusy}
                                                                busy={wfBusy}
                                                                variant="neutral"
                                                            />

                                                            <WorkflowActionButton
                                                                title="Collector: Returned to Admin"
                                                                subtitle="Return the sample to admin after inspection failed."
                                                                onClick={() => doPhysicalWorkflow("collector_returned_to_admin")}
                                                                disabled={!canWfCollectorReturnToAdmin || wfBusy}
                                                                busy={wfBusy}
                                                                variant="primary"
                                                            />
                                                        </>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </>
                        )}

                        <UpdateRequestStatusModal
                            open={modalOpen}
                            sampleId={requestId}
                            action={modalAction}
                            currentStatus={(sample as any)?.request_status ?? null}
                            onClose={closeModal}
                            onUpdated={async () => {
                                await load({ silent: true });
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
                                }}
                            />
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
