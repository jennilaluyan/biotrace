import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Beaker,
    FileText,
    Inbox,
    Loader2,
    RefreshCw,
    Shield,
    ShieldCheck,
    UserCheck,
    Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getRoleLabelById, getUserRoleId } from "../../utils/roles";

import { staffApprovalsService, type PendingStaff } from "../../services/staffApprovals";
import { fetchSampleRequestsQueue, type SampleRequestQueueRow } from "../../services/sampleRequestQueue";
import { getReagentApproverInbox, type ApproverInboxRow } from "../../services/reagentRequests";
import { listLhInbox, type QualityCoverInboxItem } from "../../services/qualityCovers";
import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";
import { apiGet } from "../../services/api";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

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

function fmtDate(iso: string | null | undefined, locale: string) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);

    try {
        return new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(d);
    } catch {
        return d.toLocaleString();
    }
}

function withinLastDays(iso: string | null | undefined, days: number) {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const ms = days * 24 * 60 * 60 * 1000;
    return Date.now() - d.getTime() <= ms;
}

// Keep consistent with SampleRequestsQueuePage: queue = no lab code + not draft
function normalizeQueueRows(rows: SampleRequestQueueRow[]) {
    return (rows ?? []).filter((r: any) => {
        const st = String(r?.request_status ?? "").toLowerCase();
        if (st === "draft") return false;
        return !r?.lab_sample_code;
    });
}

const StatCard = ({
    title,
    value,
    subtitle,
    icon,
    loading,
}: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ReactNode;
    loading?: boolean;
}) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <div className="text-xs text-gray-500">{title}</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">
                    {loading ? <span className="text-gray-400">—</span> : value}
                </div>
                {subtitle ? <div className="text-xs text-gray-500 mt-2">{subtitle}</div> : null}
            </div>

            {icon ? (
                <div className="shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                    {icon}
                </div>
            ) : null}
        </div>
    </div>
);

type QueueCard = {
    key: string;
    title: string;
    subtitle: string;
    count: number;
    icon: React.ReactNode;
    onOpen: () => void;
    tone?: "neutral" | "warn" | "ok";
};

type LooCandidate = {
    sample_id: number;
    lab_sample_code?: string | null;
    sample_type?: string | null;
    client?: { name?: string | null; organization?: string | null } | null;
    verified_at?: string | null;
    received_at?: string | null;
    physically_received_at?: string | null;
    admin_received_from_client_at?: string | null;
};

export default function LaboratoryHeadDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isLH = roleId === ROLE_ID.LAB_HEAD;

    const [pendingStaffs, setPendingStaffs] = useState<PendingStaff[]>([]);
    const [queueRows, setQueueRows] = useState<SampleRequestQueueRow[]>([]);
    const [reagentRows, setReagentRows] = useState<ApproverInboxRow[]>([]);
    const [qcRows, setQcRows] = useState<QualityCoverInboxItem[]>([]);
    const [docs, setDocs] = useState<ReportDocumentRow[]>([]);
    const [looCandidates, setLooCandidates] = useState<LooCandidate[]>([]);

    const [loading, setLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorKey(null);

        try {
            const [staffs, queue, reagents, qc, allDocs, looRes] = await Promise.all([
                staffApprovalsService.listPending(),
                fetchSampleRequestsQueue({ page: 1, per_page: 250, date: "30d" }),

                // focus: pending approvals
                getReagentApproverInbox({ status: "submitted", page: 1, per_page: 200 }),

                // QC inbox for LH (waiting validate)
                listLhInbox({ page: 1, per_page: 200 }),

                listReportDocuments(),

                // LOO candidates (count only; readiness in LOO workspace)
                apiGet<any>("/v1/samples/requests", { params: { mode: "loo_candidates" } }),
            ]);

            setPendingStaffs(Array.isArray(staffs) ? staffs : []);

            setQueueRows(normalizeQueueRows(queue?.data ?? []));

            const reagentPayload = unwrapApi(reagents);
            const reagentData: ApproverInboxRow[] = Array.isArray(reagentPayload?.data)
                ? reagentPayload.data
                : Array.isArray(reagentPayload)
                    ? reagentPayload
                    : [];
            setReagentRows(reagentData);

            setQcRows(qc?.data ?? []);
            setDocs(allDocs ?? []);

            const looData = (looRes?.data?.data ?? looRes?.data ?? looRes) as any[];
            setLooCandidates(Array.isArray(looData) ? (looData as LooCandidate[]) : []);
        } catch {
            setPendingStaffs([]);
            setQueueRows([]);
            setReagentRows([]);
            setQcRows([]);
            setDocs([]);
            setLooCandidates([]);
            setErrorKey("dashboard.laboratoryHead.errors.loadFailed");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading) return;

        if (!isAuthenticated) {
            navigate("/login", { replace: true });
            return;
        }

        if (!isLH) {
            navigate("/samples", { replace: true });
            return;
        }

        void load();
    }, [authLoading, isAuthenticated, isLH, navigate, load]);

    const greetingName = user?.name ? `, ${user.name}` : "";

    const queueCounts = useMemo(() => {
        const by = queueRows.reduce<Record<string, number>>((acc, r: any) => {
            const k = String(r?.request_status ?? "unknown").trim().toLowerCase();
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
        }, {});

        const submitted = by["submitted"] ?? 0;
        const awaitingVerification = by["awaiting_verification"] ?? 0;

        const needsAttention =
            (by["returned"] ?? 0) +
            (by["needs_revision"] ?? 0) +
            (by["inspection_failed"] ?? 0) +
            (by["returned_to_admin"] ?? 0);

        return { by, submitted, awaitingVerification, needsAttention };
    }, [queueRows]);

    const docStats = useMemo(() => {
        const generated7d = docs.filter((d) => withinLastDays(d.generated_at ?? d.created_at ?? null, 7)).length;
        return { generated7d };
    }, [docs]);

    const recentStaffs = useMemo(() => {
        const arr = [...pendingStaffs];
        arr.sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
        return arr.slice(0, 6);
    }, [pendingStaffs]);

    const recentQc = useMemo(() => {
        const arr = [...qcRows];
        arr.sort((a: any, b: any) => {
            const da = new Date(a.verified_at ?? a.updated_at ?? a.created_at ?? 0).getTime();
            const db = new Date(b.verified_at ?? b.updated_at ?? b.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 6);
    }, [qcRows]);

    const recentReagent = useMemo(() => {
        const arr = [...reagentRows];
        arr.sort((a: any, b: any) => {
            const da = new Date(a.submitted_at ?? a.updated_at ?? a.created_at ?? 0).getTime();
            const db = new Date(b.submitted_at ?? b.updated_at ?? b.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 6);
    }, [reagentRows]);

    const recentDocs = useMemo(() => {
        const arr = [...docs];
        arr.sort((a: any, b: any) => {
            const da = new Date(a.generated_at ?? a.created_at ?? 0).getTime();
            const db = new Date(b.generated_at ?? b.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 6);
    }, [docs]);

    const looCount = looCandidates.length;
    const staffPendingCount = pendingStaffs.length;
    const reagentPendingCount = reagentRows.length;
    const qcToValidateCount = qcRows.length;

    const queueCards: QueueCard[] = useMemo(
        () => [
            {
                key: "staffApprovals",
                title: t("dashboard.laboratoryHead.queue.staffApprovals.title"),
                subtitle: t("dashboard.laboratoryHead.queue.staffApprovals.subtitle"),
                count: staffPendingCount,
                icon: <Users size={18} />,
                onOpen: () => navigate("/staff/approvals"),
                tone: staffPendingCount > 0 ? "warn" : "neutral",
            },
            {
                key: "qualityCovers",
                title: t("dashboard.laboratoryHead.queue.qualityCovers.title"),
                subtitle: t("dashboard.laboratoryHead.queue.qualityCovers.subtitle"),
                count: qcToValidateCount,
                icon: <ShieldCheck size={18} />,
                onOpen: () => navigate("/quality-covers/inbox/lh"),
                tone: qcToValidateCount > 0 ? "warn" : "neutral",
            },
            {
                key: "reagentApprovals",
                title: t("dashboard.laboratoryHead.queue.reagentApprovals.title"),
                subtitle: t("dashboard.laboratoryHead.queue.reagentApprovals.subtitle"),
                count: reagentPendingCount,
                icon: <Beaker size={18} />,
                onOpen: () => navigate("/reagents/approvals"),
                tone: reagentPendingCount > 0 ? "warn" : "neutral",
            },
            {
                key: "looWorkspace",
                title: t("dashboard.laboratoryHead.queue.looWorkspace.title"),
                subtitle: t("dashboard.laboratoryHead.queue.looWorkspace.subtitle"),
                count: looCount,
                icon: <FileText size={18} />,
                onOpen: () => navigate("/loo"),
                tone: looCount > 0 ? "warn" : "neutral",
            },
            {
                key: "awaitingVerification",
                title: t("dashboard.laboratoryHead.queue.awaitingVerification.title"),
                subtitle: t("dashboard.laboratoryHead.queue.awaitingVerification.subtitle"),
                count: queueCounts.awaitingVerification,
                icon: <Inbox size={18} />,
                onOpen: () => navigate("/samples/requests?request_status=awaiting_verification"),
                tone: queueCounts.awaitingVerification > 0 ? "warn" : "neutral",
            },
            {
                key: "needsAttention",
                title: t("dashboard.laboratoryHead.queue.needsAttention.title"),
                subtitle: t("dashboard.laboratoryHead.queue.needsAttention.subtitle"),
                count: queueCounts.needsAttention,
                icon: <AlertTriangle size={18} />,
                onOpen: () => navigate("/samples/requests?request_status=returned"),
                tone: queueCounts.needsAttention > 0 ? "warn" : "neutral",
            },
            {
                key: "reports",
                title: t("dashboard.laboratoryHead.queue.reports.title"),
                subtitle: t("dashboard.laboratoryHead.queue.reports.subtitle"),
                count: docs.length,
                icon: <BarChart3 size={18} />,
                onOpen: () => navigate("/reports"),
            },
        ],
        [t, navigate, staffPendingCount, qcToValidateCount, reagentPendingCount, looCount, queueCounts, docs.length]
    );

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("dashboard.laboratoryHead.title")}</h1>
                    <p className="text-sm text-gray-600 mt-1">{t("dashboard.laboratoryHead.subtitle", { name: greetingName })}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap md:flex-nowrap md:justify-end">
                    <button
                        type="button"
                        className={cx("lims-icon-button", loading && "opacity-60 cursor-not-allowed")}
                        onClick={load}
                        disabled={loading}
                        aria-label={t("refresh")}
                        title={t("refresh")}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    </button>

                    <div className="flex items-center gap-2 flex-wrap md:flex-nowrap">
                        <button
                            type="button"
                            className="btn-outline h-9 px-4 inline-flex items-center gap-2 whitespace-nowrap w-auto"
                            onClick={() => navigate("/staff/approvals")}
                        >
                            <Users size={16} />
                            {t("dashboard.laboratoryHead.actions.openStaffApprovals")}
                        </button>

                        <button
                            type="button"
                            className="btn-outline h-9 px-4 inline-flex items-center gap-2 whitespace-nowrap w-auto"
                            onClick={() => navigate("/quality-covers/inbox/lh")}
                        >
                            <ShieldCheck size={16} />
                            {t("dashboard.laboratoryHead.actions.openQualityCovers")}
                        </button>

                        <button
                            type="button"
                            className="lims-btn-primary h-9 px-4 inline-flex items-center gap-2 whitespace-nowrap w-auto"
                            onClick={() => navigate("/loo")}
                        >
                            <FileText size={16} />
                            {t("dashboard.laboratoryHead.actions.openLoo")}
                        </button>
                    </div>
                </div>
            </div>

            {/* Hero */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                            <Shield size={18} />
                        </div>

                        <div className="min-w-0">
                            <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                {t("dashboard.laboratoryHead.hero.title")}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">{t("dashboard.laboratoryHead.hero.body")}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    title={t("dashboard.laboratoryHead.stats.pendingStaff.title")}
                    value={staffPendingCount}
                    subtitle={t("dashboard.laboratoryHead.stats.pendingStaff.sub")}
                    icon={<Users size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.laboratoryHead.stats.qcToValidate.title")}
                    value={qcToValidateCount}
                    subtitle={t("dashboard.laboratoryHead.stats.qcToValidate.sub")}
                    icon={<ShieldCheck size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.laboratoryHead.stats.reagentPending.title")}
                    value={reagentPendingCount}
                    subtitle={t("dashboard.laboratoryHead.stats.reagentPending.sub")}
                    icon={<Beaker size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.laboratoryHead.stats.docs7d.title")}
                    value={docStats.generated7d}
                    subtitle={t("dashboard.laboratoryHead.stats.docs7d.sub")}
                    icon={<BarChart3 size={18} />}
                    loading={loading}
                />
            </div>

            {/* Error */}
            {errorKey ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="mt-0.5" />
                        <div className="min-w-0">
                            <div className="font-semibold">{t(errorKey)}</div>
                            <div className="mt-2">
                                <button type="button" className="btn-outline inline-flex items-center gap-2" onClick={load}>
                                    <RefreshCw size={16} />
                                    {t("retry")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Work queue + Recent staff approvals */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Work queue */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.laboratoryHead.workQueue.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.laboratoryHead.workQueue.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {queueCards.map((c) => {
                                const toneCls =
                                    c.tone === "warn"
                                        ? "border-amber-200 bg-amber-50"
                                        : c.tone === "ok"
                                            ? "border-emerald-200 bg-emerald-50"
                                            : "border-gray-200 bg-gray-50";

                                return (
                                    <button
                                        key={c.key}
                                        type="button"
                                        onClick={c.onOpen}
                                        className={cx(
                                            "text-left rounded-2xl border p-4 transition hover:shadow-sm",
                                            toneCls,
                                            loading && "opacity-60 cursor-not-allowed"
                                        )}
                                        disabled={loading}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="text-xs text-gray-600">{c.title}</div>
                                                <div className="text-2xl font-semibold text-gray-900 mt-1">{loading ? "—" : c.count}</div>
                                                <div className="text-xs text-gray-600 mt-2">{c.subtitle}</div>
                                            </div>

                                            <div className="shrink-0 rounded-2xl border border-black/5 bg-white/60 p-2 text-gray-700">
                                                {c.icon}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Recent staff approvals */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.laboratoryHead.recentStaff.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.laboratoryHead.recentStaff.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">{t("loading")}</div>
                        ) : recentStaffs.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">{t("dashboard.laboratoryHead.recentStaff.emptyTitle")}</div>
                                <div className="text-sm text-gray-600 mt-1">{t("dashboard.laboratoryHead.recentStaff.emptyBody")}</div>

                                <button
                                    type="button"
                                    className="btn-outline mt-4 inline-flex items-center gap-2"
                                    onClick={() => navigate("/staff/approvals")}
                                >
                                    <UserCheck size={16} />
                                    {t("dashboard.laboratoryHead.actions.openStaffApprovals")}
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recentStaffs.map((s: any, idx: number) => {
                                    const when = fmtDate(s.created_at ?? null, i18n.language || "en");
                                    const roleName = s.role?.name || getRoleLabelById(s.role_id) || String(s.role_id ?? "—");

                                    return (
                                        <li key={`${s.staff_id}-${idx}`} className="py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 truncate">{s.name ?? "—"}</div>
                                                <div className="text-xs text-gray-500 mt-1 truncate">
                                                    {roleName} • {when}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className="lims-icon-button"
                                                onClick={() => navigate("/staff/approvals")}
                                                aria-label={t("open")}
                                                title={t("open")}
                                            >
                                                <ArrowRight size={16} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Recent QC + Recent reagent approvals */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent QC */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.laboratoryHead.recentQc.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.laboratoryHead.recentQc.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">{t("loading")}</div>
                        ) : recentQc.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">{t("dashboard.laboratoryHead.recentQc.emptyTitle")}</div>
                                <div className="text-sm text-gray-600 mt-1">{t("dashboard.laboratoryHead.recentQc.emptyBody")}</div>

                                <button
                                    type="button"
                                    className="btn-outline mt-4 inline-flex items-center gap-2"
                                    onClick={() => navigate("/quality-covers/inbox/lh")}
                                >
                                    <ShieldCheck size={16} />
                                    {t("dashboard.laboratoryHead.actions.openQualityCovers")}
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recentQc.map((qc: any, idx: number) => {
                                    const qcId = Number(qc.quality_cover_id ?? 0);
                                    const sampleCode = qc.sample?.lab_sample_code ?? `#${qc.sample_id ?? "—"}`;
                                    const when = fmtDate(qc.verified_at ?? qc.updated_at ?? qc.created_at ?? null, i18n.language || "en");

                                    return (
                                        <li key={`${qcId}-${idx}`} className="py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 truncate">{sampleCode}</div>
                                                <div className="text-xs text-gray-500 mt-1 truncate">
                                                    QC #{qcId} • {when}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className={cx("lims-icon-button", !(qcId > 0) && "opacity-50 cursor-not-allowed")}
                                                onClick={() =>
                                                    qcId > 0 &&
                                                    navigate("/quality-covers/inbox/lh", {
                                                        state: { preselectId: qcId },
                                                    })
                                                }
                                                disabled={!(qcId > 0)}
                                                aria-label={t("open")}
                                                title={t("open")}
                                            >
                                                <ArrowRight size={16} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Recent reagent approvals */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.laboratoryHead.recentReagent.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.laboratoryHead.recentReagent.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">{t("loading")}</div>
                        ) : recentReagent.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">{t("dashboard.laboratoryHead.recentReagent.emptyTitle")}</div>
                                <div className="text-sm text-gray-600 mt-1">{t("dashboard.laboratoryHead.recentReagent.emptyBody")}</div>

                                <button
                                    type="button"
                                    className="btn-outline mt-4 inline-flex items-center gap-2"
                                    onClick={() => navigate("/reagents/approvals")}
                                >
                                    <Beaker size={16} />
                                    {t("dashboard.laboratoryHead.actions.openReagentApprovals")}
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recentReagent.map((r: any, idx: number) => {
                                    const loId = Number(r.lo_id ?? 0);
                                    const when = fmtDate(r.submitted_at ?? r.updated_at ?? r.created_at ?? null, i18n.language || "en");
                                    const loo = r.loo_number ?? (loId > 0 ? `LOO #${loId}` : "LOO");
                                    const client = r.client_name ?? "—";

                                    return (
                                        <li key={`${r.reagent_request_id}-${idx}`} className="py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-medium text-gray-900 truncate">{loo}</div>
                                                <div className="text-xs text-gray-500 mt-1 truncate">
                                                    {client} • {when}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className={cx("lims-icon-button", !(loId > 0) && "opacity-50 cursor-not-allowed")}
                                                onClick={() => loId > 0 && navigate(`/reagents/approvals/loo/${loId}`)}
                                                disabled={!(loId > 0)}
                                                aria-label={t("open")}
                                                title={t("open")}
                                            >
                                                <ArrowRight size={16} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {/* Recent docs */}
            <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-900">{t("dashboard.laboratoryHead.recentDocs.title")}</div>
                    <div className="text-xs text-gray-500 mt-1">{t("dashboard.laboratoryHead.recentDocs.subtitle")}</div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading ? (
                        <div className="text-sm text-gray-600">{t("loading")}</div>
                    ) : recentDocs.length === 0 ? (
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                            <div className="font-semibold text-gray-900">{t("dashboard.laboratoryHead.recentDocs.emptyTitle")}</div>
                            <div className="text-sm text-gray-600 mt-1">{t("dashboard.laboratoryHead.recentDocs.emptyBody")}</div>

                            <button
                                type="button"
                                className="btn-outline mt-4 inline-flex items-center gap-2"
                                onClick={() => navigate("/reports")}
                            >
                                <BarChart3 size={16} />
                                {t("dashboard.laboratoryHead.actions.openReports")}
                            </button>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recentDocs.map((d, idx) => {
                                const when = fmtDate(d.generated_at ?? d.created_at ?? null, i18n.language || "en");
                                const name =
                                    d.document_name ||
                                    d.document_code ||
                                    (d.type ? String(d.type) : t(["document", "common.document"], "Document"));
                                const codeNum = d.number || d.document_code || "—";
                                const href = d.download_url || d.file_url || null;

                                return (
                                    <li key={`${d.type}-${d.id}-${idx}`} className="py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="font-medium text-gray-900 truncate">{name}</div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {codeNum} • {when}
                                            </div>
                                        </div>

                                        {href ? (
                                            <a
                                                className="lims-icon-button"
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                                aria-label={t("open")}
                                                title={t("open")}
                                            >
                                                <ArrowRight size={16} />
                                            </a>
                                        ) : (
                                            <button
                                                type="button"
                                                className="lims-icon-button opacity-50 cursor-not-allowed"
                                                disabled
                                                aria-label={t("open")}
                                                title={t("open")}
                                            >
                                                <ArrowRight size={16} />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}