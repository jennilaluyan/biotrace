import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Clock, Inbox, Loader2, RefreshCw, Shield, TestTube2 } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";
import { fetchSampleRequestsQueue, type SampleRequestQueueRow } from "../../services/sampleRequestQueue";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
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

function normalizeToken(raw?: string | null) {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function getRequestId(it: any): number | null {
    const raw = it?.sample_id ?? it?.id ?? it?.request_id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
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
                <div className="shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">{icon}</div>
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
    href: string;
    tone?: "neutral" | "warn";
};

export default function SampleCollectorDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isSC = roleId === ROLE_ID.SAMPLE_COLLECTOR;

    const [rows, setRows] = useState<SampleRequestQueueRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await fetchSampleRequestsQueue({ page: 1, per_page: 250, date: "30d" });

            // samakan rule queue page: bukan draft + belum punya lab code
            const raw = (res?.data ?? []) as SampleRequestQueueRow[];
            const filtered = raw.filter((r) => {
                const st = normalizeToken(r.request_status ?? "");
                if (st === "draft") return false;
                return !r.lab_sample_code;
            });

            setRows(filtered);
        } catch (e: any) {
            setRows([]);
            setError(
                safeApiMessage(e, t("dashboard.sampleCollector.errors.loadFailed", { defaultValue: "Failed to load dashboard." }))
            );
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        if (authLoading) return;

        if (!isAuthenticated) {
            navigate("/login", { replace: true });
            return;
        }

        if (!isSC) {
            navigate("/samples/requests", { replace: true });
            return;
        }

        void load();
    }, [authLoading, isAuthenticated, isSC, navigate, load]);

    const counts = useMemo(() => {
        const by = rows.reduce<Record<string, number>>((acc, r) => {
            const k = normalizeToken(r.request_status ?? "unknown");
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
        }, {});

        const inTransit = by["in_transit_to_collector"] ?? 0;
        const underInspection = by["under_inspection"] ?? 0;
        const returnedToAdmin = by["returned_to_admin"] ?? 0;

        // “needs attention” SC: inspection_failed / returned_to_admin / returned / needs_revision (kalau muncul)
        const needsAttention =
            (by["inspection_failed"] ?? 0) +
            (by["returned_to_admin"] ?? 0) +
            (by["returned"] ?? 0) +
            (by["needs_revision"] ?? 0);

        const intakePassed = by["intake_checklist_passed"] ?? 0;

        return { by, inTransit, underInspection, returnedToAdmin, needsAttention, intakePassed };
    }, [rows]);

    const recent = useMemo(() => {
        const arr = [...rows];
        arr.sort((a: any, b: any) => {
            const da = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
            const db = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 8);
    }, [rows]);

    const greetingName = user?.name ? `, ${user.name}` : "";

    const queueCards: QueueCard[] = useMemo(
        () => [
            {
                key: "inTransit",
                title: t("dashboard.sampleCollector.queue.inTransit.title"),
                subtitle: t("dashboard.sampleCollector.queue.inTransit.subtitle"),
                count: counts.inTransit,
                icon: <Clock size={18} />,
                href: "/samples/requests?request_status=in_transit_to_collector",
                tone: counts.inTransit > 0 ? "warn" : "neutral",
            },
            {
                key: "underInspection",
                title: t("dashboard.sampleCollector.queue.underInspection.title"),
                subtitle: t("dashboard.sampleCollector.queue.underInspection.subtitle"),
                count: counts.underInspection,
                icon: <Shield size={18} />,
                href: "/samples/requests?request_status=under_inspection",
                tone: counts.underInspection > 0 ? "warn" : "neutral",
            },
            {
                key: "returnedToAdmin",
                title: t("dashboard.sampleCollector.queue.returnedToAdmin.title"),
                subtitle: t("dashboard.sampleCollector.queue.returnedToAdmin.subtitle"),
                count: counts.returnedToAdmin,
                icon: <AlertTriangle size={18} />,
                href: "/samples/requests?request_status=returned_to_admin",
                tone: counts.returnedToAdmin > 0 ? "warn" : "neutral",
            },
            {
                key: "intakePassed",
                title: t("dashboard.sampleCollector.queue.intakePassed.title"),
                subtitle: t("dashboard.sampleCollector.queue.intakePassed.subtitle"),
                count: counts.intakePassed,
                icon: <TestTube2 size={18} />,
                href: "/samples/requests?request_status=intake_checklist_passed",
            },
            {
                key: "allQueue",
                title: t("dashboard.sampleCollector.queue.allQueue.title"),
                subtitle: t("dashboard.sampleCollector.queue.allQueue.subtitle"),
                count: rows.length,
                icon: <Inbox size={18} />,
                href: "/samples/requests",
            },
        ],
        [t, counts, rows.length]
    );

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("dashboard.sampleCollector.title")}</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {t("dashboard.sampleCollector.subtitle", { name: greetingName })}
                    </p>
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

                    <button
                        type="button"
                        className="btn-outline h-9 px-4 inline-flex items-center gap-2 whitespace-nowrap"
                        onClick={() => navigate("/samples/requests")}
                    >
                        <Inbox size={16} />
                        {t("dashboard.sampleCollector.actions.openQueue")}
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary h-9 px-4 inline-flex items-center gap-2 whitespace-nowrap"
                        onClick={() => navigate("/samples")}
                    >
                        <TestTube2 size={16} />
                        {t("dashboard.sampleCollector.actions.openSamples")}
                    </button>
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
                                {t("dashboard.sampleCollector.hero.title")}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">{t("dashboard.sampleCollector.hero.body")}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    title={t("dashboard.sampleCollector.stats.inTransit.title")}
                    value={counts.inTransit}
                    subtitle={t("dashboard.sampleCollector.stats.inTransit.sub")}
                    icon={<Clock size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.sampleCollector.stats.underInspection.title")}
                    value={counts.underInspection}
                    subtitle={t("dashboard.sampleCollector.stats.underInspection.sub")}
                    icon={<Shield size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.sampleCollector.stats.needsAttention.title")}
                    value={counts.needsAttention}
                    subtitle={t("dashboard.sampleCollector.stats.needsAttention.sub")}
                    icon={<AlertTriangle size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.sampleCollector.stats.intakePassed.title")}
                    value={counts.intakePassed}
                    subtitle={t("dashboard.sampleCollector.stats.intakePassed.sub")}
                    icon={<TestTube2 size={18} />}
                    loading={loading}
                />
            </div>

            {/* Error */}
            {error ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="mt-0.5" />
                        <div className="min-w-0">
                            <div className="font-semibold">{error}</div>
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

            {/* Work queue + Recent */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Work queue */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.sampleCollector.workQueue.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.sampleCollector.workQueue.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {queueCards.map((c) => {
                                const toneCls =
                                    c.tone === "warn" ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50";

                                return (
                                    <button
                                        key={c.key}
                                        type="button"
                                        onClick={() => navigate(c.href)}
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

                {/* Recent */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.sampleCollector.recent.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.sampleCollector.recent.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">{t("loading")}</div>
                        ) : recent.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">{t("dashboard.sampleCollector.recent.emptyTitle")}</div>
                                <div className="text-sm text-gray-600 mt-1">{t("dashboard.sampleCollector.recent.emptyBody")}</div>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recent.map((r: any, idx) => {
                                    const rid = getRequestId(r);
                                    const when = fmtDate(r.updated_at ?? r.created_at ?? null, i18n.language || "en");
                                    const status = String(r.request_status ?? "—");
                                    const client = r.client_name ?? r.client_email ?? "—";

                                    return (
                                        <li key={String(rid ?? idx)} className="py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="font-medium text-gray-900">
                                                        {t("dashboard.sampleCollector.recent.requestLabel", { id: rid ?? "—" })}
                                                    </div>
                                                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700">
                                                        {status}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1 truncate">
                                                    {client} • {t("dashboard.sampleCollector.recent.updatedAt")}: {when}
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
        </div>
    );
}