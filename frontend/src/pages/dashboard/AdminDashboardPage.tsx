import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Clock,
    FileText,
    Inbox,
    Loader2,
    RefreshCw,
    Shield,
    Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { getUserRoleId, ROLE_ID } from "../../utils/roles";

import { clientApprovalsService, type ClientApplication } from "../../services/clientApprovals";
import { fetchSampleRequestsQueue, type SampleRequestQueueRow } from "../../services/sampleRequestQueue";
import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function getRequestId(it: any): number | null {
    const raw = it?.sample_id ?? it?.id ?? it?.request_id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
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

export default function AdminDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isAdmin = roleId === ROLE_ID.ADMIN;

    const [pendingClients, setPendingClients] = useState<ClientApplication[]>([]);
    const [queueRows, setQueueRows] = useState<SampleRequestQueueRow[]>([]);
    const [docs, setDocs] = useState<ReportDocumentRow[]>([]);

    const [loading, setLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorKey(null);

        try {
            const [clients, queue, allDocs] = await Promise.all([
                clientApprovalsService.listPending(),
                fetchSampleRequestsQueue({ page: 1, per_page: 200, date: "30d" }),
                listReportDocuments(),
            ]);

            setPendingClients(clients ?? []);
            setQueueRows(queue?.data ?? []);
            setDocs(allDocs ?? []);
        } catch {
            setPendingClients([]);
            setQueueRows([]);
            setDocs([]);
            setErrorKey("dashboard.admin.errors.loadFailed");
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
        if (!isAdmin) {
            // biar konsisten dengan RoleGuard 403, tapi dashboard tetap aman kalau kebuka accidental
            navigate("/samples", { replace: true });
            return;
        }
        void load();
    }, [authLoading, isAuthenticated, isAdmin, navigate, load]);

    const queueCounts = useMemo(() => {
        const by = queueRows.reduce<Record<string, number>>((acc, r: any) => {
            const k = String(r?.request_status ?? "unknown").trim().toLowerCase();
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
        }, {});

        const submitted = by["submitted"] ?? 0;
        const readyForDelivery = by["ready_for_delivery"] ?? 0;
        const physicallyReceived = by["physically_received"] ?? 0;

        // “needs attention” untuk admin: returned / needs_revision / inspection_failed / returned_to_admin (kalau dipakai backend)
        const needsAttention =
            (by["returned"] ?? 0) +
            (by["needs_revision"] ?? 0) +
            (by["inspection_failed"] ?? 0) +
            (by["returned_to_admin"] ?? 0);

        return { by, submitted, readyForDelivery, physicallyReceived, needsAttention };
    }, [queueRows]);

    const docStats = useMemo(() => {
        const generated7d = docs.filter((d) => withinLastDays(d.generated_at ?? d.created_at ?? null, 7)).length;
        return { generated7d };
    }, [docs]);

    const recentDocs = useMemo(() => {
        const arr = [...docs];
        arr.sort((a: any, b: any) => {
            const da = new Date(a.generated_at ?? a.created_at ?? 0).getTime();
            const db = new Date(b.generated_at ?? b.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 6);
    }, [docs]);

    const recentRequests = useMemo(() => {
        const arr = [...queueRows];
        arr.sort((a: any, b: any) => {
            const da = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
            const db = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 6);
    }, [queueRows]);

    const greetingName = user?.name ? `, ${user.name}` : "";

    const queueCards: QueueCard[] = useMemo(
        () => [
            {
                key: "clientApprovals",
                title: t("dashboard.admin.queue.clientApprovals.title"),
                subtitle: t("dashboard.admin.queue.clientApprovals.subtitle"),
                count: pendingClients.length,
                icon: <Users size={18} />,
                onOpen: () => navigate("/clients/approvals"),
                tone: pendingClients.length > 0 ? "warn" : "neutral",
            },
            {
                key: "newSubmissions",
                title: t("dashboard.admin.queue.newSubmissions.title"),
                subtitle: t("dashboard.admin.queue.newSubmissions.subtitle"),
                count: queueCounts.submitted,
                icon: <Inbox size={18} />,
                onOpen: () => navigate("/samples/requests?request_status=submitted"),
                tone: queueCounts.submitted > 0 ? "warn" : "neutral",
            },
            {
                key: "readyForDelivery",
                title: t("dashboard.admin.queue.readyForDelivery.title"),
                subtitle: t("dashboard.admin.queue.readyForDelivery.subtitle"),
                count: queueCounts.readyForDelivery,
                icon: <Clock size={18} />,
                onOpen: () => navigate("/samples/requests?request_status=ready_for_delivery"),
            },
            {
                key: "physicallyReceived",
                title: t("dashboard.admin.queue.physicallyReceived.title"),
                subtitle: t("dashboard.admin.queue.physicallyReceived.subtitle"),
                count: queueCounts.physicallyReceived,
                icon: <CheckCircle2 size={18} />,
                onOpen: () => navigate("/samples/requests?request_status=physically_received"),
                tone: "ok",
            },
            {
                key: "needsAttention",
                title: t("dashboard.admin.queue.needsAttention.title"),
                subtitle: t("dashboard.admin.queue.needsAttention.subtitle"),
                count: queueCounts.needsAttention,
                icon: <AlertTriangle size={18} />,
                onOpen: () => navigate("/samples/requests?request_status=returned"),
                tone: queueCounts.needsAttention > 0 ? "warn" : "neutral",
            },
            {
                key: "documents",
                title: t("dashboard.admin.queue.documents.title"),
                subtitle: t("dashboard.admin.queue.documents.subtitle"),
                count: docs.length,
                icon: <FileText size={18} />,
                onOpen: () => navigate("/reports"),
            },
        ],
        [t, navigate, pendingClients.length, queueCounts, docs.length]
    );

    return (
        <div className="min-h-[60vh]">
            {/* Page header (match ClientDashboard/SamplesPage rhythm) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("dashboard.admin.title")}</h1>
                    <p className="text-sm text-gray-600 mt-1">{t("dashboard.admin.subtitle", { name: greetingName })}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
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

                    <button
                        type="button"
                        className="btn-outline inline-flex items-center gap-2"
                        onClick={() => navigate("/clients/approvals")}
                    >
                        <Users size={16} />
                        {t("dashboard.admin.actions.clientApprovals")}
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary inline-flex items-center gap-2"
                        onClick={() => navigate("/samples/requests")}
                    >
                        <Inbox size={16} />
                        {t("dashboard.admin.actions.openQueue")}
                    </button>
                </div>
            </div>

            {/* Hero / Guidance */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                            <Shield size={18} />
                        </div>

                        <div className="min-w-0">
                            <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                {t("dashboard.admin.hero.title")}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">{t("dashboard.admin.hero.body")}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    title={t("dashboard.admin.stats.pendingClients.title")}
                    value={pendingClients.length}
                    subtitle={t("dashboard.admin.stats.pendingClients.sub")}
                    icon={<Users size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.admin.stats.submitted.title")}
                    value={queueCounts.submitted}
                    subtitle={t("dashboard.admin.stats.submitted.sub")}
                    icon={<Inbox size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.admin.stats.needsAttention.title")}
                    value={queueCounts.needsAttention}
                    subtitle={t("dashboard.admin.stats.needsAttention.sub")}
                    icon={<AlertTriangle size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.admin.stats.docs7d.title")}
                    value={docStats.generated7d}
                    subtitle={t("dashboard.admin.stats.docs7d.sub")}
                    icon={<FileText size={18} />}
                    loading={loading}
                />
            </div>

            {/* Error banner */}
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

            {/* Work queue + Recent docs */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Work queue */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.admin.workQueue.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.admin.workQueue.subtitle")}</div>
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
                                                <div className="text-2xl font-semibold text-gray-900 mt-1">
                                                    {loading ? "—" : c.count}
                                                </div>
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

                {/* Recent docs */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.admin.recentDocs.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.admin.recentDocs.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">{t("loading")}</div>
                        ) : recentDocs.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">{t("dashboard.admin.recentDocs.emptyTitle")}</div>
                                <div className="text-sm text-gray-600 mt-1">{t("dashboard.admin.recentDocs.emptyBody")}</div>

                                <button
                                    type="button"
                                    className="btn-outline mt-4 inline-flex items-center gap-2"
                                    onClick={() => navigate("/reports")}
                                >
                                    <FileText size={16} />
                                    {t("dashboard.admin.actions.openReports")}
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recentDocs.map((d, idx) => {
                                    const when = fmtDate(d.generated_at ?? d.created_at ?? null, i18n.language || "en");
                                    const name =
                                        d.document_name ||
                                        d.document_code ||
                                        (d.type ? String(d.type) : t("reports.types.other"));

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

            {/* Recent requests */}
            <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                    <div className="text-sm font-semibold text-gray-900">{t("dashboard.admin.recentRequests.title")}</div>
                    <div className="text-xs text-gray-500 mt-1">{t("dashboard.admin.recentRequests.subtitle")}</div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading ? (
                        <div className="text-sm text-gray-600">{t("loading")}</div>
                    ) : recentRequests.length === 0 ? (
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                            <div className="font-semibold text-gray-900">{t("dashboard.admin.recentRequests.emptyTitle")}</div>
                            <div className="text-sm text-gray-600 mt-1">{t("dashboard.admin.recentRequests.emptyBody")}</div>

                            <button
                                type="button"
                                className="btn-outline mt-4 inline-flex items-center gap-2"
                                onClick={() => navigate("/samples/requests")}
                            >
                                <Inbox size={16} />
                                {t("dashboard.admin.actions.openQueue")}
                            </button>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recentRequests.map((r: any, idx: number) => {
                                const rid = getRequestId(r);
                                const when = fmtDate(r.updated_at ?? r.created_at ?? null, i18n.language || "en");
                                const status = String(r.request_status ?? "—");
                                const client = r.client_name ?? r.client_email ?? "—";

                                return (
                                    <li key={String(rid ?? idx)} className="py-3 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <div className="font-medium text-gray-900">
                                                    {t("dashboard.admin.recentRequests.requestLabel", { id: rid ?? "—" })}
                                                </div>
                                                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700">
                                                    {status}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1 truncate">
                                                {client} • {t("dashboard.admin.recentRequests.updatedAt")}: {when}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className={cx("lims-icon-button", !rid && "opacity-50 cursor-not-allowed")}
                                            onClick={() => rid && navigate(`/samples/requests/${rid}`)}
                                            disabled={!rid}
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
    );
}