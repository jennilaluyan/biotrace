import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
    CheckCircle2,
    ArrowRight,
    Truck,
    Hand,
    ClipboardCheck,
    Hash,
    ShieldCheck,
    RotateCcw,
} from "lucide-react";

import type { Sample } from "../../../services/samples";
import { ROLE_ID } from "../../../utils/roles";
import { formatDateTimeLocal } from "../../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type TimelineEvent = {
    key: string;
    title: string;
    actor: string;
    at?: string | null;
    note?: string | null;
};

function pickAt(s: any, keys: string[]) {
    for (const k of keys) {
        const v = s?.[k];
        if (v) return String(v);
    }
    return null;
}

function ActionCard(props: {
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    tone?: "primary" | "neutral" | "danger";
    rightText?: string;
}) {
    const { title, subtitle, icon, onClick, disabled, tone = "neutral", rightText } = props;

    const base =
        "w-full text-left rounded-2xl border px-4 py-3 transition " +
        "focus:outline-none focus:ring-2 focus:ring-offset-2 " +
        (disabled ? "opacity-60 cursor-not-allowed" : "hover:shadow-sm");

    const toneCls =
        tone === "primary"
            ? "bg-amber-50 border-amber-200 focus:ring-amber-300"
            : tone === "danger"
                ? "bg-rose-50 border-rose-200 focus:ring-rose-300"
                : "bg-white border-slate-200 focus:ring-slate-300";

    return (
        <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${toneCls}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                    <div className="mt-0.5 text-slate-700">{icon}</div>
                    <div className="min-w-0">
                        <div className="font-semibold text-sm text-slate-900 truncate">{title}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{subtitle}</div>
                    </div>
                </div>
                <div className="text-slate-400 text-sm shrink-0">{disabled ? "Locked" : rightText ?? "→"}</div>
            </div>
        </button>
    );
}

export function SampleRequestWorkflowTab(props: {
    sample: Sample;
    roleId: number;
    roleLabel: string;
    wfBusy: boolean;
    wfError: string | null;
    verifyBusy: boolean;
    assignFlash: { type: "success" | "warning" | "error"; message: string } | null;
    onApprove: () => void;
    onOpenReturn: () => void;
    onMarkPhysicallyReceived: () => void;
    onDoPhysicalWorkflow: (action: string) => void;
    onOpenIntakeChecklist: () => void;
    onVerify: () => void;
    onOpenAssignSampleId: () => void;
}) {
    const { sample, roleId, roleLabel } = props;
    const s: any = sample;

    const isAdmin = roleId === ROLE_ID.ADMIN;
    const isCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const isOmLh = roleId === ROLE_ID.OPERATIONAL_MANAGER || roleId === ROLE_ID.LAB_HEAD;

    const requestStatus = s?.request_status ?? null;
    const requestStatusKey = String(requestStatus ?? "").trim().toLowerCase();
    const labSampleCode = String(s?.lab_sample_code ?? "").trim();
    const returnNote = String(s?.request_return_note ?? "").trim() || null;

    const sampleIdChangeObj = s?.sample_id_change ?? null;
    const sampleIdChangeStatusKey = String(
        sampleIdChangeObj?.status ?? s?.sample_id_change_status ?? s?.sample_id_change_state ?? ""
    )
        .trim()
        .toLowerCase();

    const isSampleIdChangePending =
        sampleIdChangeStatusKey === "pending" ||
        sampleIdChangeStatusKey === "submitted" ||
        sampleIdChangeStatusKey === "waiting";

    const isSampleIdChangeApproved = sampleIdChangeStatusKey === "approved";
    const isSampleIdChangeRejected = sampleIdChangeStatusKey === "rejected";

    const canApproveReturn =
        isAdmin &&
        !labSampleCode &&
        (requestStatusKey === "submitted" || requestStatusKey === "returned" || requestStatusKey === "needs_revision");

    const canMarkPhysicallyReceived =
        isAdmin &&
        !labSampleCode &&
        (requestStatusKey === "ready_for_delivery" || requestStatusKey === "physically_received") &&
        !s?.admin_received_from_client_at;

    const canAdminBringToCollector =
        isAdmin && !labSampleCode && !!s?.admin_received_from_client_at && !s?.admin_brought_to_collector_at;

    const canCollectorReceive =
        isCollector &&
        !labSampleCode &&
        requestStatusKey === "in_transit_to_collector" &&
        !!s?.admin_brought_to_collector_at &&
        !s?.collector_received_at;

    const canOpenIntakeChecklist =
        isCollector &&
        !labSampleCode &&
        requestStatusKey === "under_inspection" &&
        !!s?.collector_received_at &&
        !s?.collector_intake_completed_at;

    const canCollectorReturnToAdmin =
        isCollector &&
        !labSampleCode &&
        requestStatusKey === "inspection_failed" &&
        !!s?.collector_intake_completed_at &&
        !s?.collector_returned_to_admin_at;

    const canAdminReceiveBack =
        isAdmin && !labSampleCode && !!s?.collector_returned_to_admin_at && !s?.admin_received_from_collector_at;

    const canAdminClientPickup =
        isAdmin &&
        !labSampleCode &&
        !!s?.admin_received_from_collector_at &&
        (requestStatusKey === "returned" || requestStatusKey === "needs_revision") &&
        !s?.client_picked_up_at;

    const verifiedAt = s?.verified_at ?? null;
    const awaitingVerify = requestStatusKey === "awaiting_verification" && !labSampleCode;

    const canVerify = isOmLh && !labSampleCode && (awaitingVerify || isSampleIdChangePending);

    const canAssignSampleId =
        isAdmin &&
        !labSampleCode &&
        !isSampleIdChangePending &&
        (requestStatusKey === "waiting_sample_id_assignment" || requestStatusKey === "approved_for_assignment");

    const showActions = !labSampleCode;

    const timeline = useMemo<TimelineEvent[]>(() => {
        const out: TimelineEvent[] = [];

        const submittedAt = pickAt(s, ["request_submitted_at", "submitted_at", "request_created_at", "created_at"]);
        if (submittedAt && requestStatusKey !== "draft") {
            out.push({
                key: "client_submit",
                title: "Client submitted request",
                actor: "Client",
                at: submittedAt,
            });
        }

        const acceptedAt = pickAt(s, ["request_accepted_at", "accepted_at", "approved_at", "request_approved_at"]);
        const progressed = requestStatusKey && !["draft", "submitted", "returned", "needs_revision"].includes(requestStatusKey);
        if (progressed) {
            out.push({
                key: "admin_accept",
                title: "Admin accepted request",
                actor: "Admin",
                at: acceptedAt ?? null,
            });
        }

        if (returnNote && (requestStatusKey === "returned" || requestStatusKey === "needs_revision")) {
            const retAt = pickAt(s, ["request_returned_at", "returned_at", "request_updated_at", "updated_at"]);
            out.push({
                key: "admin_return",
                title: "Admin returned request to client",
                actor: "Admin",
                at: retAt ?? null,
                note: returnNote,
            });
        }

        if (s?.admin_received_from_client_at) {
            out.push({
                key: "admin_received",
                title: "Admin received sample from client",
                actor: "Admin",
                at: String(s.admin_received_from_client_at),
            });
        }

        if (s?.admin_brought_to_collector_at) {
            out.push({
                key: "admin_handoff",
                title: "Admin brought sample to Sample Collector",
                actor: "Admin",
                at: String(s.admin_brought_to_collector_at),
            });
        }

        if (s?.collector_received_at) {
            out.push({
                key: "collector_received",
                title: "Sample Collector received sample from admin",
                actor: "Sample Collector",
                at: String(s.collector_received_at),
            });
        }

        if (s?.collector_intake_completed_at) {
            const failed = requestStatusKey === "inspection_failed";
            out.push({
                key: "collector_intake",
                title: failed ? "Sample Collector intake failed" : "Sample Collector intake completed (all passed)",
                actor: "Sample Collector",
                at: String(s.collector_intake_completed_at),
            });
        }

        if (s?.collector_returned_to_admin_at) {
            out.push({
                key: "collector_return",
                title: "Sample Collector returned sample to admin",
                actor: "Sample Collector",
                at: String(s.collector_returned_to_admin_at),
            });
        }

        if (s?.admin_received_from_collector_at) {
            out.push({
                key: "admin_receive_back",
                title: "Admin received sample back from Sample Collector",
                actor: "Admin",
                at: String(s.admin_received_from_collector_at),
            });
        }

        if (verifiedAt) {
            out.push({
                key: "omlh_verify",
                title: "OM/LH verified intake from Sample Collector",
                actor: "OM/LH",
                at: String(verifiedAt),
            });
        }

        const sidReqAt = pickAt(sampleIdChangeObj, ["created_at", "requested_at", "submitted_at"]);
        if (sampleIdChangeObj && isSampleIdChangePending) {
            out.push({
                key: "sid_change_requested",
                title: "Admin requested Sample ID change",
                actor: "Admin",
                at: sidReqAt ?? null,
            });
        }

        const sidDecidedAt = pickAt(sampleIdChangeObj, ["decided_at", "approved_at", "rejected_at", "updated_at"]);
        if (sampleIdChangeObj && (isSampleIdChangeApproved || isSampleIdChangeRejected)) {
            out.push({
                key: "sid_change_decided",
                title: isSampleIdChangeApproved ? "OM/LH approved Sample ID change" : "OM/LH rejected Sample ID change",
                actor: "OM/LH",
                at: sidDecidedAt ?? null,
            });
        }

        if (labSampleCode) {
            const assignedAt = pickAt(s, ["lab_sample_code_assigned_at", "sample_id_assigned_at", "assigned_at", "updated_at"]);
            out.push({
                key: "admin_assign",
                title: "Admin assigned Sample ID",
                actor: "Admin",
                at: assignedAt ?? null,
            });
        }

        if (s?.client_picked_up_at) {
            out.push({
                key: "client_pickup",
                title: "Client picked up sample",
                actor: "Client",
                at: String(s.client_picked_up_at),
            });
        }

        out.sort((a, b) => {
            const ta = a.at ? new Date(a.at).getTime() : 0;
            const tb = b.at ? new Date(b.at).getTime() : 0;
            return tb - ta;
        });

        return out;
    }, [
        s,
        requestStatusKey,
        returnNote,
        verifiedAt,
        labSampleCode,
        sampleIdChangeObj,
        isSampleIdChangePending,
        isSampleIdChangeApproved,
        isSampleIdChangeRejected,
    ]);

    const topBanner = useMemo(() => {
        if (props.assignFlash) return props.assignFlash;

        if (labSampleCode) {
            return {
                type: "success" as const,
                message: `Sample ID assigned: ${labSampleCode}. Workflow actions are now locked.`,
            };
        }

        if (isSampleIdChangePending) {
            return { type: "warning" as const, message: "Sample ID change is pending OM/LH verification." };
        }

        if (isSampleIdChangeApproved) {
            return { type: "success" as const, message: "Sample ID change approved by OM/LH. Admin can assign again." };
        }

        if (isSampleIdChangeRejected) {
            return { type: "error" as const, message: "Sample ID change rejected by OM/LH. Admin can try assigning again." };
        }

        return null;
    }, [props.assignFlash, labSampleCode, isSampleIdChangePending, isSampleIdChangeApproved, isSampleIdChangeRejected]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[11px] text-gray-500">
                    You are: <span className="font-semibold">{roleLabel}</span>
                </div>

                {labSampleCode ? (
                    <Link
                        to={`/samples/${Number(s?.sample_id ?? 0)}`}
                        className="text-xs text-gray-700 underline"
                        title="Open sample detail"
                    >
                        Open Sample Detail
                    </Link>
                ) : null}
            </div>

            {props.wfError ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                    {props.wfError}
                </div>
            ) : null}

            {topBanner ? (
                <div
                    className={cx(
                        "rounded-2xl border px-4 py-3 text-sm",
                        topBanner.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
                        topBanner.type === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
                        topBanner.type === "error" && "border-rose-200 bg-rose-50 text-rose-900"
                    )}
                >
                    {topBanner.message}
                </div>
            ) : null}

            {showActions ? (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                        <div className="text-sm font-bold text-gray-900">Next actions</div>
                        <div className="text-xs text-gray-500 mt-1">Buttons appear only when your step is needed.</div>
                    </div>

                    <div className="px-5 py-4 space-y-2">
                        {canApproveReturn ? (
                            <>
                                <ActionCard
                                    title="Admin: Accept request"
                                    subtitle="Client request is valid. Continue to physical workflow."
                                    icon={<CheckCircle2 size={18} />}
                                    onClick={props.onApprove}
                                    disabled={props.wfBusy}
                                    tone="primary"
                                />

                                <ActionCard
                                    title="Admin: Return request"
                                    subtitle="Send back to client (note required)."
                                    icon={<RotateCcw size={18} />}
                                    onClick={props.onOpenReturn}
                                    disabled={props.wfBusy}
                                    tone="danger"
                                    rightText="Open"
                                />
                            </>
                        ) : null}

                        {canMarkPhysicallyReceived ? (
                            <ActionCard
                                title="Admin: Received sample from client"
                                subtitle="Record arrival at admin desk."
                                icon={<Hand size={18} />}
                                onClick={props.onMarkPhysicallyReceived}
                                disabled={props.wfBusy}
                                tone="neutral"
                            />
                        ) : null}

                        {canAdminBringToCollector ? (
                            <ActionCard
                                title="Admin: Bring sample to Sample Collector"
                                subtitle="Moves status to In transit to Sample Collector."
                                icon={<Truck size={18} />}
                                onClick={() => props.onDoPhysicalWorkflow("admin_brought_to_collector")}
                                disabled={props.wfBusy}
                                tone="primary"
                            />
                        ) : null}

                        {canCollectorReceive ? (
                            <ActionCard
                                title="Sample Collector: Received sample"
                                subtitle="Confirm you received the sample from admin."
                                icon={<Hand size={18} />}
                                onClick={() => props.onDoPhysicalWorkflow("collector_received")}
                                disabled={props.wfBusy}
                                tone="primary"
                            />
                        ) : null}

                        {canOpenIntakeChecklist ? (
                            <ActionCard
                                title="Sample Collector: Intake checklist"
                                subtitle="Complete intake checks. If failed, return to admin."
                                icon={<ClipboardCheck size={18} />}
                                onClick={props.onOpenIntakeChecklist}
                                disabled={props.wfBusy}
                                tone="neutral"
                                rightText="Open"
                            />
                        ) : null}

                        {canCollectorReturnToAdmin ? (
                            <ActionCard
                                title="Sample Collector: Return sample to admin"
                                subtitle="Used when intake fails."
                                icon={<ArrowRight size={18} />}
                                onClick={() => props.onDoPhysicalWorkflow("collector_returned_to_admin")}
                                disabled={props.wfBusy}
                                tone="danger"
                            />
                        ) : null}

                        {canAdminReceiveBack ? (
                            <ActionCard
                                title="Admin: Received back from Sample Collector"
                                subtitle="Record return time from collector."
                                icon={<Hand size={18} />}
                                onClick={() => props.onDoPhysicalWorkflow("admin_received_from_collector")}
                                disabled={props.wfBusy}
                                tone="neutral"
                            />
                        ) : null}

                        {canAdminClientPickup ? (
                            <ActionCard
                                title="Admin: Client picked up"
                                subtitle="Final step for returned samples."
                                icon={<ArrowRight size={18} />}
                                onClick={() => props.onDoPhysicalWorkflow("client_picked_up")}
                                disabled={props.wfBusy}
                                tone="neutral"
                            />
                        ) : null}

                        {canVerify ? (
                            <ActionCard
                                title={isSampleIdChangePending ? "OM/LH: Verify Sample ID change" : "OM/LH: Verify intake"}
                                subtitle={
                                    isSampleIdChangePending
                                        ? "Approve/reject the requested Sample ID change."
                                        : "Verify intake result from Sample Collector."
                                }
                                icon={<ShieldCheck size={18} />}
                                onClick={props.onVerify}
                                disabled={props.verifyBusy}
                                tone="primary"
                                rightText={props.verifyBusy ? "Saving..." : "Verify"}
                            />
                        ) : null}

                        {isAdmin && canAssignSampleId ? (
                            <ActionCard
                                title="Admin: Assign Sample ID"
                                subtitle="Assign the final lab code (BML)."
                                icon={<Hash size={18} />}
                                onClick={props.onOpenAssignSampleId}
                                disabled={props.wfBusy}
                                tone="primary"
                                rightText="Open"
                            />
                        ) : null}

                        {!canApproveReturn &&
                            !canMarkPhysicallyReceived &&
                            !canAdminBringToCollector &&
                            !canCollectorReceive &&
                            !canOpenIntakeChecklist &&
                            !canCollectorReturnToAdmin &&
                            !canAdminReceiveBack &&
                            !canAdminClientPickup &&
                            !canVerify &&
                            !(isAdmin && canAssignSampleId) ? (
                            <div className="text-sm text-gray-600">No actions required from your role right now.</div>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                        <div className="text-sm font-bold text-gray-900">Next actions</div>
                    </div>
                    <div className="px-5 py-4 text-sm text-gray-600">Sample ID has been assigned. Actions are hidden.</div>
                </div>
            )}

            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="text-sm font-bold text-gray-900">Workflow history</div>
                    <div className="text-xs text-gray-500 mt-1">Only shows events that actually happened.</div>
                </div>

                <div className="px-5 py-5">
                    {timeline.length === 0 ? (
                        <div className="text-sm text-gray-600">No workflow events yet.</div>
                    ) : (
                        <ol className="space-y-2">
                            {timeline.map((e) => (
                                <li key={e.key} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                        <div className="text-sm font-semibold text-gray-900">{e.title}</div>
                                        <div className="text-xs text-gray-600">{e.at ? formatDateTimeLocal(e.at) : "-"}</div>
                                    </div>

                                    <div className="mt-1 text-xs text-gray-600">By: {e.actor}</div>

                                    {e.note ? (
                                        <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{e.note}</div>
                                    ) : null}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    );
}
