// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\requests\SampleRequestWorkflowTab.tsx
import { useMemo } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight, Truck, Hand, ClipboardCheck, Hash, ShieldCheck, RotateCcw } from "lucide-react";

import type { Sample } from "../../../services/samples";
import { ROLE_ID, getUserRoleLabel } from "../../../utils/roles";
import { formatDateTimeLocal } from "../../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type TimelineEvent = {
    key: string;
    title: string;
    actor: string;
    actorObj?: any;
    actorName?: string | null;
    actorRole?: string | null;
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

function pickStr(s: any, keys: string[]) {
    for (const k of keys) {
        const v = s?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
}

function pickNum(s: any, keys: string[]) {
    for (const k of keys) {
        const v = s?.[k];
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
}

function pickArr(s: any, keys: string[]) {
    for (const k of keys) {
        const v = s?.[k];
        if (Array.isArray(v)) return v;
    }
    return null;
}

function pickObj(s: any, keys: string[]) {
    for (const k of keys) {
        const v = s?.[k];
        if (v && typeof v === "object" && !Array.isArray(v)) return v;
        if (v?.staff && typeof v.staff === "object") return v.staff;
        if (v?.user && typeof v.user === "object") return v.user;
    }
    return null;
}

function normText(v: any) {
    return String(v ?? "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function safeTimeMs(v: any) {
    if (!v) return 0;
    const d = typeof v === "number" ? new Date(v) : new Date(String(v));
    const t = d.getTime();
    return Number.isNaN(t) ? 0 : t;
}

function logText(log: any) {
    const parts = [
        log?.action,
        log?.event,
        log?.type,
        log?.key,
        log?.title,
        log?.message,
        log?.description,
        log?.name,
        typeof log?.new_values === "string" ? log.new_values : null,
        typeof log?.old_values === "string" ? log.old_values : null,
    ].filter(Boolean);
    return normText(parts.join(" "));
}

function logAt(log: any) {
    // diperluas: banyak backend beda-beda key timestamp-nya
    return (
        (log?.timestamp ? String(log.timestamp) : null) ??
        (log?.occurred_at ? String(log.occurred_at) : null) ??
        (log?.occurredAt ? String(log.occurredAt) : null) ??
        (log?.created_at ? String(log.created_at) : null) ??
        (log?.createdAt ? String(log.createdAt) : null) ??
        (log?.logged_at ? String(log.logged_at) : null) ??
        (log?.loggedAt ? String(log.loggedAt) : null) ??
        (log?.event_time ? String(log.event_time) : null) ??
        (log?.eventTime ? String(log.eventTime) : null) ??
        (log?.at ? String(log.at) : null) ??
        null
    );
}

function normalizeRoleLabel(raw?: string | null) {
    const s = String(raw ?? "").trim();
    const k = s.toLowerCase();

    // samakan label agar konsisten seperti requirement kamu
    if (!k) return "";

    // admin variants
    if (k === "admin" || k.includes("administrator")) return "Administrator";

    // sample collector variants
    if (k === "sample collector" || k === "samplecollector" || k === "collector" || k.includes("sample_collector"))
        return "Sample Collector";

    // OM variants
    if (k === "om" || k.includes("operational manager")) return "Operational Manager";

    // LH variants
    if (k === "lh" || k.includes("lab head") || k.includes("laboratory head")) return "Laboratory Head";

    // analyst
    if (k.includes("analyst")) return "Analyst";

    // client
    if (k.includes("client")) return "Client";

    // default: keep original (trimmed)
    return s;
}

function roleLabelFromRoleId(roleId?: any) {
    const n = Number(roleId);
    if (!Number.isFinite(n) || n <= 0) return null;

    // getUserRoleLabel kadang keluarkan "Admin", "Sample Collector", dst
    const lbl = getUserRoleLabel(n);
    return normalizeRoleLabel(lbl);
}

function pickName(obj: any): string | null {
    const v =
        obj?.name ??
        obj?.full_name ??
        obj?.fullName ??
        obj?.staff_name ??
        obj?.user_name ??
        obj?.username ??
        obj?.display_name ??
        obj?.user?.name ??
        obj?.staff?.name ??
        obj?.data?.name ??
        null;

    const ss = typeof v === "string" ? v.trim() : "";
    return ss ? ss : null;
}

function pickRoleName(obj: any): string | null {
    const direct =
        obj?.role_name ??
        obj?.roleName ??
        obj?.role?.name ??
        obj?.role?.label ??
        obj?.user?.role?.name ??
        obj?.staff?.role?.name ??
        obj?.role_code ??
        obj?.roleCode ??
        null;

    const directStr = typeof direct === "string" ? direct.trim() : "";
    if (directStr) return normalizeRoleLabel(directStr);

    const roleId =
        obj?.role_id ??
        obj?.roleId ??
        obj?.role?.id ??
        obj?.role?.role_id ??
        obj?.user?.role_id ??
        obj?.user?.roleId ??
        obj?.staff?.role_id ??
        obj?.staff?.roleId ??
        null;

    const fromId = roleLabelFromRoleId(roleId);
    return fromId ? fromId : null;
}

function prettyRoleLabel(fallback: string) {
    // fallback label internal event (Admin / OM/LH / Sample Collector)
    const k = String(fallback ?? "").trim().toLowerCase();
    if (k === "admin") return "Administrator";
    if (k === "sample collector") return "Sample Collector";
    if (k === "om/lh") return "OM/LH";
    return fallback;
}

function extractActorFromLog(log: any): { obj?: any; name?: string | null; role?: string | null } | null {
    const direct =
        log?.actor ??
        log?.actor_user ??
        log?.actorUser ??
        log?.actor_staff ??
        log?.actorStaff ??
        log?.causer ?? // laravel-ish
        log?.staff ??
        log?.user ??
        log?.performed_by ??
        log?.performedBy ??
        log?.performed_by_staff ??
        log?.performedByStaff ??
        log?.performed_by_user ??
        log?.performedByUser ??
        log?.by ??
        log?.created_by ??
        log?.createdBy ??
        null;

    const nameFromLog =
        pickStr(log, [
            "actor_name",
            "actorName",
            "staff_name",
            "staffName",
            "user_name",
            "userName",
            "performed_by_name",
            "performedByName",
            "causer_name",
            "causerName",
            "name",
            "full_name",
            "fullName",
        ]) ?? null;

    const roleFromLogStr =
        pickStr(log, [
            "actor_role_name",
            "actorRoleName",
            "role_name",
            "roleName",
            "actor_role",
            "actorRole",
            "role",
            "causer_role_name",
            "causerRoleName",
        ]) ?? null;

    const roleFromLogId = roleLabelFromRoleId(
        pickNum(log, ["actor_role_id", "actorRoleId", "role_id", "roleId", "causer_role_id", "causerRoleId"])
    );

    const roleFromLog = normalizeRoleLabel(roleFromLogStr ?? roleFromLogId ?? null) || null;

    if (direct && typeof direct === "object") {
        // walau direct object ada, sering kali cuma {id}, jadi tetap ambil name/role dari log juga
        const name = pickName(direct) ?? nameFromLog ?? null;
        const role = pickRoleName(direct) ?? roleFromLog ?? null;
        return { obj: direct, name, role };
    }

    // kalau direct bukan object (mis: string), pakai name/role dari log
    const name = nameFromLog ? String(nameFromLog).trim() : null;
    const role = roleFromLog ? String(roleFromLog).trim() : null;

    if (!name && !role) return null;
    return { name, role };
}

function findNearestActorByTime(logs: any[] | null, at?: string | null, windowMs = 15 * 60 * 1000) {
    if (!logs || logs.length === 0 || !at) return null;

    const target = safeTimeMs(at);
    if (!target) return null;

    const closest = logs
        .map((l) => {
            const la = logAt(l);
            const t = safeTimeMs(la);
            return { l, t, diff: t ? Math.abs(t - target) : Number.POSITIVE_INFINITY };
        })
        .filter((x) => x.t > 0 && Number.isFinite(x.diff))
        .sort((a, b) => a.diff - b.diff)[0];

    if (!closest || closest.diff > windowMs) return null;
    return extractActorFromLog(closest.l);
}

function findActorFromLogs(logs: any[] | null, needles: string[], at?: string | null) {
    if (!logs || logs.length === 0) return null;

    const ns = needles.map((n) => normText(n)).filter(Boolean);
    const target = at ? safeTimeMs(at) : 0;

    if (ns.length > 0) {
        const candidates = logs
            .map((l) => {
                const txt = logText(l);
                const match = ns.some((n) => txt.includes(n));
                return { l, match, t: safeTimeMs(logAt(l)) };
            })
            .filter((x) => x.match);

        if (candidates.length > 0) {
            if (target) {
                const closest = candidates
                    .map((x) => ({ ...x, diff: x.t ? Math.abs(x.t - target) : Number.POSITIVE_INFINITY }))
                    .sort((a, b) => a.diff - b.diff)[0];

                if (closest && Number.isFinite(closest.diff) && closest.diff <= 6 * 60 * 60 * 1000) {
                    return extractActorFromLog(closest.l);
                }
            }

            // fallback newest by time (kalau time 0 semua, tetap ambil terakhir)
            const newest = candidates.sort((a, b) => (b.t || 0) - (a.t || 0))[0];
            return newest ? extractActorFromLog(newest.l) : null;
        }
    }

    return findNearestActorByTime(logs, at ?? null);
}

function pickActorMeta(s: any, cfg: { objKeys: string[]; nameKeys: string[]; roleKeys: string[] }) {
    const obj = pickObj(s, cfg.objKeys);

    const nameFromObjKey = pickStr(s, cfg.objKeys);
    const roleFromObjKey = pickStr(s, cfg.roleKeys);

    const name = pickStr(s, cfg.nameKeys) ?? nameFromObjKey;
    const role = roleFromObjKey ?? pickStr(s, cfg.roleKeys);

    return { obj, name, role };
}

function ActionCard(props: {
    title: string;
    subtitle: string;
    icon: ReactNode;
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

    workflowLogs?: any[] | null;

    onApprove: () => void;
    onOpenReturn: () => void;
    onMarkPhysicallyReceived: () => void;
    onDoPhysicalWorkflow: (action: string) => void;
    onOpenIntakeChecklist: () => void;
    onVerify: () => void;
    onVerifySampleIdChange?: () => void;
    onOpenAssignSampleId: () => void;
}) {
    const { sample, roleId, roleLabel } = props;
    const s: any = sample;

    const isAdmin = roleId === ROLE_ID.ADMIN;
    const isCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const isOmLh = roleId === ROLE_ID.OPERATIONAL_MANAGER || roleId === ROLE_ID.LAB_HEAD;

    function formatActor(fallbackRole: string, actorObj?: any, actorName?: string | null, actorRole?: string | null): string {
        const fallbackRolePretty = prettyRoleLabel(fallbackRole);

        const n = (actorName && String(actorName).trim()) ? String(actorName).trim() : pickName(actorObj);
        const rRaw =
            (actorRole && String(actorRole).trim()) ? String(actorRole).trim()
                : pickRoleName(actorObj) ?? fallbackRolePretty;

        const r = normalizeRoleLabel(rRaw);

        // Client special case (biar selalu "Client Name - Client")
        if (!n && fallbackRole === "Client") {
            const cn = pickName(s?.client) ?? (typeof s?.client_name === "string" ? s.client_name.trim() : null);
            if (cn) return `${cn} - Client`;
        }

        // target utama requirement: "Nama - Role"
        if (n) return `${n} - ${r || fallbackRolePretty}`;

        // fallback: minimal role (kalau backend benar-benar gak kirim nama)
        return r || fallbackRolePretty;
    }

    const requestStatus = s?.request_status ?? null;
    const requestStatusKey = String(requestStatus ?? "").trim().toLowerCase();
    const labSampleCode = String(s?.lab_sample_code ?? "").trim();
    const returnNote = String(s?.request_return_note ?? "").trim() || null;

    const sampleIdChangeObj = s?.sample_id_change ?? s?.sample_id_change_request ?? s?.sampleIdChange ?? null;

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

    const canAdminAcceptRequest =
        isAdmin && !labSampleCode && ["submitted", "returned", "needs_revision"].includes(requestStatusKey);

    const canAdminReturnRequest =
        isAdmin &&
        !labSampleCode &&
        ["submitted", "returned", "needs_revision", "returned_to_admin", "inspection_failed"].includes(requestStatusKey);

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

    const isSampleIdPendingVerification = requestStatusKey === "sample_id_pending_verification";
    const awaitingVerify = requestStatusKey === "awaiting_verification" && !labSampleCode;

    type VerifyMode = "intake" | "sample_id_change";
    const verifyMode: VerifyMode | null =
        isSampleIdChangePending || isSampleIdPendingVerification ? "sample_id_change" : awaitingVerify ? "intake" : null;

    const canVerify = isOmLh && !labSampleCode && !!verifyMode;

    const canAssignSampleId =
        isAdmin &&
        !labSampleCode &&
        !isSampleIdChangePending &&
        (requestStatusKey === "waiting_sample_id_assignment" ||
            requestStatusKey === "sample_id_approved_for_assignment" ||
            requestStatusKey === "approved_for_assignment");

    const showActions = !labSampleCode;

    const timeline = useMemo<TimelineEvent[]>(() => {
        const out: TimelineEvent[] = [];

        const logs =
            props.workflowLogs ??
            pickArr(s, ["workflow_history", "workflowHistory", "history", "audit_logs", "auditLogs", "workflow_logs", "workflowLogs"]) ??
            null;

        function resolveActor(
            cfg: { objKeys: string[]; nameKeys: string[]; roleKeys: string[] },
            logNeedles: string[],
            at?: string | null
        ) {
            const meta = pickActorMeta(s, cfg);
            const fromLogs = findActorFromLogs(logs, logNeedles, at ?? null);

            return {
                obj: meta.obj ?? fromLogs?.obj ?? null,
                name: meta.name ?? fromLogs?.name ?? null,
                role: meta.role ?? fromLogs?.role ?? null,
            };
        }

        const submittedAt = pickAt(s, ["request_submitted_at", "submitted_at", "request_created_at", "created_at"]);
        if (submittedAt && requestStatusKey !== "draft") {
            out.push({
                key: "client_submit",
                title: "Client submitted request",
                actor: "Client",
                actorObj: s?.client ?? null,
                at: submittedAt,
            });
        }

        const acceptedAt = pickAt(s, ["request_accepted_at", "accepted_at", "approved_at", "request_approved_at"]);
        const progressed =
            requestStatusKey && !["draft", "submitted", "returned", "needs_revision"].includes(requestStatusKey);

        if (progressed) {
            const adminAccept = resolveActor(
                {
                    objKeys: ["accepted_by", "acceptedBy", "request_accepted_by", "admin", "administrator"],
                    nameKeys: ["accepted_by_name", "request_accepted_by_name", "admin_name", "administrator_name"],
                    roleKeys: [
                        "accepted_by_role_name",
                        "request_accepted_by_role_name",
                        "admin_role_name",
                        "administrator_role_name",
                    ],
                },
                [
                    "admin accepted",
                    "accepted request",
                    "request accepted",
                    "accept request",
                    "request-status accept",
                    "sample request accepted",
                    "sample_request_accepted",
                    "accept",
                    "request_status",
                ],
                acceptedAt ?? null
            );

            out.push({
                key: "admin_accept",
                title: "Admin accepted request",
                actor: "Admin",
                actorObj: adminAccept.obj,
                actorName: adminAccept.name,
                actorRole: adminAccept.role,
                at: acceptedAt ?? null,
            });
        }

        if (returnNote && (requestStatusKey === "returned" || requestStatusKey === "needs_revision")) {
            const retAt = pickAt(s, ["request_returned_at", "returned_at", "request_updated_at", "updated_at"]);

            const adminReturn = resolveActor(
                {
                    objKeys: ["returned_by", "returnedBy", "request_returned_by", "admin", "administrator"],
                    nameKeys: ["returned_by_name", "request_returned_by_name", "admin_name", "administrator_name"],
                    roleKeys: [
                        "returned_by_role_name",
                        "request_returned_by_role_name",
                        "admin_role_name",
                        "administrator_role_name",
                    ],
                },
                ["admin returned", "return request", "returned to client", "request-status return", "sample_request_returned", "return"],
                retAt ?? null
            );

            out.push({
                key: "admin_return",
                title: "Admin returned request to client",
                actor: "Admin",
                actorObj: adminReturn.obj,
                actorName: adminReturn.name,
                actorRole: adminReturn.role,
                at: retAt ?? null,
                note: returnNote,
            });
        }

        if (s?.admin_received_from_client_at) {
            const at = String(s.admin_received_from_client_at);

            const adminRecv = resolveActor(
                {
                    objKeys: ["admin_received_from_client_by", "admin_received_by", "admin", "administrator"],
                    nameKeys: ["admin_received_from_client_by_name", "admin_received_by_name", "admin_name", "administrator_name"],
                    roleKeys: [
                        "admin_received_from_client_by_role_name",
                        "admin_received_by_role_name",
                        "admin_role_name",
                        "administrator_role_name",
                    ],
                },
                ["received from client", "admin received sample", "admin_received_from_client", "ADMIN_RECEIVED_FROM_CLIENT"],
                at
            );

            out.push({
                key: "admin_received",
                title: "Admin received sample from client",
                actor: "Admin",
                actorObj: adminRecv.obj,
                actorName: adminRecv.name,
                actorRole: adminRecv.role,
                at,
            });
        }

        if (s?.admin_brought_to_collector_at) {
            const at = String(s.admin_brought_to_collector_at);

            const adminHandoff = resolveActor(
                {
                    objKeys: ["admin_brought_to_collector_by", "admin_handoff_by", "admin", "administrator"],
                    nameKeys: ["admin_brought_to_collector_by_name", "admin_handoff_by_name", "admin_name", "administrator_name"],
                    roleKeys: [
                        "admin_brought_to_collector_by_role_name",
                        "admin_handoff_by_role_name",
                        "admin_role_name",
                        "administrator_role_name",
                    ],
                },
                ["brought to collector", "handoff to collector", "admin_brought_to_collector", "ADMIN_BROUGHT_TO_COLLECTOR"],
                at
            );

            out.push({
                key: "admin_handoff",
                title: "Admin brought sample to Sample Collector",
                actor: "Admin",
                actorObj: adminHandoff.obj,
                actorName: adminHandoff.name,
                actorRole: adminHandoff.role,
                at,
            });
        }

        if (s?.collector_received_at) {
            const at = String(s.collector_received_at);

            const collectorRecv = resolveActor(
                {
                    objKeys: ["collector_received_by", "collector_received_by_staff", "collector_received_by_user", "collector", "sample_collector"],
                    nameKeys: [
                        "collector_received_by_name",
                        "collector_received_by_staff_name",
                        "collector_received_by_user_name",
                        "collector_name",
                        "sample_collector_name",
                    ],
                    roleKeys: ["collector_received_by_role_name", "collector_role_name"],
                },
                ["collector received", "sample collector received", "collector_received", "COLLECTOR_RECEIVED"],
                at
            );

            out.push({
                key: "collector_received",
                title: "Sample Collector received sample from admin",
                actor: "Sample Collector",
                actorObj: collectorRecv.obj,
                actorName: collectorRecv.name,
                actorRole: collectorRecv.role,
                at,
            });
        }

        if (s?.collector_intake_completed_at) {
            const at = String(s.collector_intake_completed_at);
            const failed = requestStatusKey === "inspection_failed";

            const collectorIntake = resolveActor(
                {
                    objKeys: ["collector_intake_completed_by", "collector_intake_completed_by_staff", "collector_intake_completed_by_user", "collector", "sample_collector"],
                    nameKeys: [
                        "collector_intake_completed_by_name",
                        "collector_intake_completed_by_staff_name",
                        "collector_intake_completed_by_user_name",
                        "collector_name",
                        "sample_collector_name",
                    ],
                    roleKeys: ["collector_intake_completed_by_role_name", "collector_role_name"],
                },
                ["intake completed", "collector intake", "collector_intake_completed", "INTAKE_CHECKLIST", "COLLECTOR_INTAKE_COMPLETED"],
                at
            );

            out.push({
                key: "collector_intake",
                title: failed ? "Sample Collector intake failed" : "Sample Collector intake completed (all passed)",
                actor: "Sample Collector",
                actorObj: collectorIntake.obj,
                actorName: collectorIntake.name,
                actorRole: collectorIntake.role,
                at,
            });
        }

        if (s?.collector_returned_to_admin_at) {
            const at = String(s.collector_returned_to_admin_at);

            const collectorReturn = resolveActor(
                {
                    objKeys: ["collector_returned_to_admin_by", "collector_returned_to_admin_by_staff", "collector_returned_to_admin_by_user", "collector", "sample_collector"],
                    nameKeys: [
                        "collector_returned_to_admin_by_name",
                        "collector_returned_to_admin_by_staff_name",
                        "collector_returned_to_admin_by_user_name",
                        "collector_name",
                        "sample_collector_name",
                    ],
                    roleKeys: ["collector_returned_to_admin_by_role_name", "collector_role_name"],
                },
                ["collector returned", "returned to admin", "collector_returned_to_admin", "COLLECTOR_RETURNED_TO_ADMIN"],
                at
            );

            out.push({
                key: "collector_return",
                title: "Sample Collector returned sample to admin",
                actor: "Sample Collector",
                actorObj: collectorReturn.obj,
                actorName: collectorReturn.name,
                actorRole: collectorReturn.role,
                at,
            });
        }

        if (s?.admin_received_from_collector_at) {
            const at = String(s.admin_received_from_collector_at);

            const adminBack = resolveActor(
                {
                    objKeys: ["admin_received_from_collector_by", "admin_received_back_by", "admin", "administrator"],
                    nameKeys: ["admin_received_from_collector_by_name", "admin_received_back_by_name", "admin_name", "administrator_name"],
                    roleKeys: [
                        "admin_received_from_collector_by_role_name",
                        "admin_received_back_by_role_name",
                        "admin_role_name",
                        "administrator_role_name",
                    ],
                },
                ["received from collector", "admin received back", "admin_received_from_collector", "ADMIN_RECEIVED_FROM_COLLECTOR"],
                at
            );

            out.push({
                key: "admin_receive_back",
                title: "Admin received sample back from Sample Collector",
                actor: "Admin",
                actorObj: adminBack.obj,
                actorName: adminBack.name,
                actorRole: adminBack.role,
                at,
            });
        }

        if (verifiedAt) {
            const at = String(verifiedAt);

            const verifier = resolveActor(
                {
                    objKeys: ["verified_by", "verifiedBy", "verified_by_staff", "verified_by_user", "verifier", "verifier_staff"],
                    nameKeys: ["verified_by_name", "verified_by_staff_name", "verifier_name"],
                    roleKeys: ["verified_by_role_name", "verifier_role_name"],
                },
                ["verified intake", "omlh verified", "verify intake", "verified", "VERIFY", "INTAKE_VERIFIED"],
                at
            );

            out.push({
                key: "omlh_verify",
                title: "OM/LH verified intake from Sample Collector",
                actor: "OM/LH",
                actorObj: verifier.obj,
                actorName: verifier.name,
                actorRole: verifier.role,
                at,
            });
        }

        // ===== Sample ID Change timeline =====
        const sidReqAt = pickAt(sampleIdChangeObj, ["created_at", "requested_at", "submitted_at"]);
        const sidRequestedBy = sampleIdChangeObj?.requested_by ?? sampleIdChangeObj?.requestedBy ?? null;
        const sidReviewedBy = sampleIdChangeObj?.reviewed_by ?? sampleIdChangeObj?.reviewedBy ?? null;

        const sidRequesterName =
            pickName(sidRequestedBy) ??
            pickStr(sampleIdChangeObj, ["requested_by_name", "requestedByName", "requested_by_staff_name", "requested_by_user_name"]) ??
            null;

        const sidRequesterRole =
            pickRoleName(sidRequestedBy) ??
            pickStr(sampleIdChangeObj, ["requested_by_role_name", "requestedByRoleName"]) ??
            null;

        const sidReviewerName =
            pickName(sidReviewedBy) ??
            pickStr(sampleIdChangeObj, ["reviewed_by_name", "reviewedByName", "reviewed_by_staff_name", "reviewed_by_user_name"]) ??
            null;

        const sidReviewerRole =
            pickRoleName(sidReviewedBy) ??
            pickStr(sampleIdChangeObj, ["reviewed_by_role_name", "reviewedByRoleName"]) ??
            null;

        if (sampleIdChangeObj) {
            const fromLogs =
                (!sidRequesterName && logs)
                    ? findActorFromLogs(
                        logs,
                        ["sample id change", "propose sample id", "requested sample id change", "sample_id_change", "PROPOSE_SAMPLE_ID"],
                        sidReqAt ?? null
                    )
                    : null;

            out.push({
                key: "sid_proposed",
                title: "Admin proposed Sample ID",
                actor: "Admin",
                actorObj: sidRequestedBy ?? fromLogs?.obj ?? null,
                actorName: sidRequesterName ?? fromLogs?.name ?? null,
                actorRole: sidRequesterRole ?? fromLogs?.role ?? null,
                at: sidReqAt ?? null,
                note: sampleIdChangeObj?.proposed_sample_id ? `Proposed: ${String(sampleIdChangeObj.proposed_sample_id)}` : null,
            });
        }

        const sidDecidedAt = pickAt(sampleIdChangeObj, ["decided_at", "approved_at", "rejected_at", "updated_at"]);
        if (sampleIdChangeObj && (isSampleIdChangeApproved || isSampleIdChangeRejected)) {
            const fromLogs =
                (!sidReviewerName && logs)
                    ? findActorFromLogs(
                        logs,
                        [isSampleIdChangeApproved ? "approved sample id" : "rejected sample id", "sample id change", "sample_id_change", "REVIEW_SAMPLE_ID"],
                        sidDecidedAt ?? null
                    )
                    : null;

            out.push({
                key: "sid_decided",
                title: isSampleIdChangeApproved ? "OM/LH approved Sample ID" : "OM/LH rejected Sample ID",
                actor: "OM/LH",
                actorObj: sidReviewedBy ?? fromLogs?.obj ?? null,
                actorName: sidReviewerName ?? fromLogs?.name ?? null,
                actorRole: sidReviewerRole ?? fromLogs?.role ?? null,
                at: sidDecidedAt ?? null,
                note: sampleIdChangeObj?.review_note ? String(sampleIdChangeObj.review_note) : null,
            });
        } else if (sampleIdChangeObj && isSampleIdChangePending) {
            out.push({
                key: "sid_pending",
                title: "Sample ID change is pending verification",
                actor: "OM/LH",
                at: sidReqAt ?? null,
            });
        }

        if (labSampleCode) {
            const assignedAt = pickAt(s, ["lab_sample_code_assigned_at", "sample_id_assigned_at", "assigned_at"]);

            const assigner = resolveActor(
                {
                    objKeys: ["lab_sample_code_assigned_by", "sample_id_assigned_by", "assigned_by", "assignedBy", "admin", "administrator"],
                    nameKeys: ["lab_sample_code_assigned_by_name", "sample_id_assigned_by_name", "assigned_by_name", "admin_name", "administrator_name"],
                    roleKeys: ["lab_sample_code_assigned_by_role_name", "sample_id_assigned_by_role_name", "assigned_by_role_name", "admin_role_name", "administrator_role_name"],
                },
                ["assigned sample id", "lab sample code assigned", "assign sample id", "ASSIGN_SAMPLE_ID"],
                assignedAt ?? null
            );

            out.push({
                key: "admin_assign",
                title: "Admin assigned Sample ID",
                actor: "Admin",
                actorObj: assigner.obj,
                actorName: assigner.name,
                actorRole: assigner.role,
                at: assignedAt ?? null,
                note: `Assigned: ${labSampleCode}`,
            });
        }

        if (s?.client_picked_up_at) {
            out.push({
                key: "client_pickup",
                title: "Client picked up sample",
                actor: "Client",
                actorObj: s?.client ?? null,
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
        props.workflowLogs,
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

        if (isSampleIdChangePending || isSampleIdPendingVerification) {
            return { type: "warning" as const, message: "Sample ID change is pending OM/LH verification." };
        }

        if (isSampleIdChangeApproved) {
            return { type: "success" as const, message: "Sample ID change approved by OM/LH. Admin can assign again." };
        }

        if (isSampleIdChangeRejected) {
            return {
                type: "error" as const,
                message: "Sample ID change rejected by OM/LH. Admin can try assigning again.",
            };
        }

        return null;
    }, [
        props.assignFlash,
        labSampleCode,
        isSampleIdChangePending,
        isSampleIdPendingVerification,
        isSampleIdChangeApproved,
        isSampleIdChangeRejected,
    ]);

    const anyAction =
        canAdminAcceptRequest ||
        canAdminReturnRequest ||
        canMarkPhysicallyReceived ||
        canAdminBringToCollector ||
        canCollectorReceive ||
        canOpenIntakeChecklist ||
        canCollectorReturnToAdmin ||
        canAdminReceiveBack ||
        canAdminClientPickup ||
        canVerify ||
        (isAdmin && canAssignSampleId);

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
                        {canAdminAcceptRequest ? (
                            <ActionCard
                                title="Admin: Accept request"
                                subtitle="Client request is valid. Continue to physical workflow."
                                icon={<CheckCircle2 size={18} />}
                                onClick={props.onApprove}
                                disabled={props.wfBusy}
                                tone="primary"
                            />
                        ) : null}

                        {canAdminReturnRequest ? (
                            <ActionCard
                                title="Admin: Return request"
                                subtitle="Send back to client (note required)."
                                icon={<RotateCcw size={18} />}
                                onClick={props.onOpenReturn}
                                disabled={props.wfBusy}
                                tone="danger"
                                rightText="Open"
                            />
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
                                title={verifyMode === "sample_id_change" ? "OM/LH: Verify Sample ID change" : "OM/LH: Verify intake"}
                                subtitle={
                                    verifyMode === "sample_id_change"
                                        ? "Approve/reject the requested Sample ID change."
                                        : "Verify intake result from Sample Collector."
                                }
                                icon={<ShieldCheck size={18} />}
                                onClick={() => {
                                    if (verifyMode === "sample_id_change") return props.onVerifySampleIdChange?.();
                                    return props.onVerify();
                                }}
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

                        {!anyAction ? (
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

                                    <div className="mt-1 text-xs text-gray-600">
                                        By: {formatActor(e.actor, e.actorObj, e.actorName, e.actorRole)}
                                    </div>

                                    {e.note ? <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{e.note}</div> : null}
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    );
}
