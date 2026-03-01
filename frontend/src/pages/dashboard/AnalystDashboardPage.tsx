import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, ClipboardCheck, FlaskConical, Loader2, RefreshCw, TestTube2 } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";
import { getErrorMessage } from "../../utils/errors";
import { sampleService, type Sample } from "../../services/samples";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

// Same idea as SamplesPage: archived/completed should not pollute dashboard
function isArchivedSample(s: any) {
    return Boolean(
        s?.archived_at ||
        s?.is_archived ||
        s?.coa_generated_at ||
        s?.coa_file_url ||
        s?.coa_report_id ||
        s?.report_generated_at ||
        s?.report_pdf_url ||
        s?.report?.pdf_url
    );
}

// robust reagent status extractor (same spirit as SamplesPage / SampleDetailPage)
function getReagentRequestStatus(s: any): string | null {
    const direct = s?.reagent_request_status ?? s?.reagentRequestStatus ?? null;
    if (direct) return String(direct).toLowerCase();

    const rr = s?.reagent_request ?? s?.reagentRequest ?? s?.reagentRequestLatest ?? null;
    const nested = rr?.status ?? rr?.request_status ?? null;
    if (nested) return String(nested).toLowerCase();

    return null;
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
                <div className="text-2xl font-semibold text-gray-900 mt-1">{loading ? <span className="text-gray-400">—</span> : value}</div>
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

export default function AnalystDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isAnalyst = roleId === ROLE_ID.ANALYST;

    const [rows, setRows] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // Try to fetch a larger slice (backend may ignore per_page; harmless)
            const res: any = await sampleService.getAll({
                page: 1,
                per_page: 250,
            } as any);

            const items = Array.isArray(res?.data) ? (res.data as Sample[]) : [];

            // Analyst dashboard focuses on active lab samples
            const filtered = items
                .filter((s: any) => !!String(s?.lab_sample_code ?? "").trim())
                .filter((s: any) => !isArchivedSample(s));

            setRows(filtered);
        } catch (e: any) {
            setRows([]);
            setError(getErrorMessage(e) || t("dashboard.analyst.errors.loadFailed", { defaultValue: "Failed to load dashboard data. Please try again." }));
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

        if (!isAnalyst) {
            navigate("/dashboard", { replace: true });
            return;
        }

        void load();
    }, [authLoading, isAuthenticated, isAnalyst, navigate, load]);

    const counts = useMemo(() => {
        const awaitingReceive = rows.filter((s: any) => !!s?.sc_delivered_to_analyst_at && !s?.analyst_received_at).length;

        const crosscheckPending = rows.filter((s: any) => {
            const received = !!s?.analyst_received_at;
            if (!received) return false;
            const cs = String(s?.crosscheck_status ?? "pending").toLowerCase();
            return cs !== "passed";
        }).length;

        const readyForReagent = rows.filter((s: any) => {
            const cs = String(s?.crosscheck_status ?? "pending").toLowerCase();
            if (cs !== "passed") return false;
            const rr = getReagentRequestStatus(s);
            return !rr || (rr !== "submitted" && rr !== "approved");
        }).length;

        const inTesting = rows.filter((s: any) => {
            const rr = getReagentRequestStatus(s);
            if (rr !== "approved") return false;

            const doneFlags = [s?.testing_completed_at, (s as any)?.testing_done_at, (s as any)?.tests_completed_at].filter(Boolean);
            if (doneFlags.length > 0) return false;

            const cur = String((s as any)?.current_status ?? "").toLowerCase();
            if (cur.includes("reported") || cur.includes("validated") || cur.includes("verified")) return false;

            return true;
        }).length;

        return { awaitingReceive, crosscheckPending, readyForReagent, inTesting };
    }, [rows]);

    const recent = useMemo(() => {
        const arr = [...rows];
        arr.sort((a: any, b: any) => {
            const da = new Date((a as any)?.updated_at ?? (a as any)?.received_at ?? (a as any)?.created_at ?? 0).getTime();
            const db = new Date((b as any)?.updated_at ?? (b as any)?.received_at ?? (b as any)?.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 8);
    }, [rows]);

    const greetingName = user?.name ? `, ${user.name}` : "";

    const queueCards: QueueCard[] = useMemo(
        () => [
            {
                key: "awaitingReceive",
                title: t("dashboard.analyst.queue.awaitingReceive.title"),
                subtitle: t("dashboard.analyst.queue.awaitingReceive.subtitle"),
                count: counts.awaitingReceive,
                icon: <TestTube2 size={18} />,
                href: "/samples",
                tone: counts.awaitingReceive > 0 ? "warn" : "neutral",
            },
            {
                key: "crosscheckPending",
                title: t("dashboard.analyst.queue.crosscheckPending.title"),
                subtitle: t("dashboard.analyst.queue.crosscheckPending.subtitle"),
                count: counts.crosscheckPending,
                icon: <ClipboardCheck size={18} />,
                href: "/samples",
                tone: counts.crosscheckPending > 0 ? "warn" : "neutral",
            },
            {
                key: "readyForReagent",
                title: t("dashboard.analyst.queue.readyForReagent.title"),
                subtitle: t("dashboard.analyst.queue.readyForReagent.subtitle"),
                count: counts.readyForReagent,
                icon: <FlaskConical size={18} />,
                href: "/samples",
            },
            {
                key: "inTesting",
                title: t("dashboard.analyst.queue.inTesting.title"),
                subtitle: t("dashboard.analyst.queue.inTesting.subtitle"),
                count: counts.inTesting,
                icon: <TestTube2 size={18} />,
                href: "/samples",
            },
        ],
        [t, counts]
    );

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("dashboard.analyst.title")}</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {t("dashboard.analyst.subtitle", { name: greetingName })}
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
                        onClick={() => navigate("/samples")}
                    >
                        <TestTube2 size={16} />
                        {t("dashboard.analyst.actions.openSamples")}
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary h-9 px-4 inline-flex items-center gap-2 whitespace-nowrap"
                        onClick={() => navigate("/reports")}
                    >
                        <FlaskConical size={16} />
                        {t("dashboard.analyst.actions.openReports")}
                    </button>
                </div>
            </div>

            {/* Hero */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                            <FlaskConical size={18} />
                        </div>

                        <div className="min-w-0">
                            <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                {t("dashboard.analyst.hero.title")}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">{t("dashboard.analyst.hero.body")}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    title={t("dashboard.analyst.stats.awaitingReceive.title")}
                    value={counts.awaitingReceive}
                    subtitle={t("dashboard.analyst.stats.awaitingReceive.sub")}
                    icon={<TestTube2 size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.analyst.stats.crosscheckPending.title")}
                    value={counts.crosscheckPending}
                    subtitle={t("dashboard.analyst.stats.crosscheckPending.sub")}
                    icon={<ClipboardCheck size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.analyst.stats.readyForReagent.title")}
                    value={counts.readyForReagent}
                    subtitle={t("dashboard.analyst.stats.readyForReagent.sub")}
                    icon={<FlaskConical size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("dashboard.analyst.stats.inTesting.title")}
                    value={counts.inTesting}
                    subtitle={t("dashboard.analyst.stats.inTesting.sub")}
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
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.analyst.workQueue.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.analyst.workQueue.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {queueCards.map((c) => {
                                const toneCls = c.tone === "warn" ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50";

                                return (
                                    <button
                                        key={c.key}
                                        type="button"
                                        onClick={() => navigate(c.href)}
                                        className={cx("text-left rounded-2xl border p-4 transition hover:shadow-sm", toneCls, loading && "opacity-60 cursor-not-allowed")}
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
                        <div className="text-sm font-semibold text-gray-900">{t("dashboard.analyst.recent.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("dashboard.analyst.recent.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">{t("loading")}</div>
                        ) : recent.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">{t("dashboard.analyst.recent.emptyTitle")}</div>
                                <div className="text-sm text-gray-600 mt-1">{t("dashboard.analyst.recent.emptyBody")}</div>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recent.map((s: any, idx) => {
                                    const sid = Number(s?.sample_id ?? s?.id ?? 0) || null;
                                    const code = String(s?.lab_sample_code ?? "—");
                                    const type = String(s?.sample_type ?? "—");
                                    const when = fmtDate(s?.updated_at ?? s?.received_at ?? s?.created_at ?? null, i18n.language || "en");

                                    return (
                                        <li key={String(sid ?? idx)} className="py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1 text-gray-900">
                                                        {code}
                                                    </div>
                                                    <div className="text-sm font-medium text-gray-900 truncate">{type}</div>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1 truncate">
                                                    {t("dashboard.analyst.recent.updatedAt")}: {when}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className={cx("lims-icon-button", !sid && "opacity-50 cursor-not-allowed")}
                                                onClick={() => sid && navigate(`/samples/${sid}`)}
                                                disabled={!sid}
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