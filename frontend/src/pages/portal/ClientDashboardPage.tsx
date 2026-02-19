// L:\Campus\Final Countdown\biotrace\frontend\src\pages\portal\ClientDashboardPage.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Clock,
    FilePlus2,
    List,
    Loader2,
    RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { clientSampleRequestService } from "../../services/sampleRequests";
import type { Sample } from "../../services/samples";
import { useClientAuth } from "../../hooks/useClientAuth";

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

type StatusChip = { label: string; cls: string };

function getStatusChip(raw: string | null | undefined, t: (k: string, opt?: any) => string): StatusChip {
    const s = String(raw ?? "").trim().toLowerCase();

    // Palette consistent with SamplesPage chips (soft, readable, calm)
    const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

    if (s === "draft") return { label: t("portal.status.draft"), cls: `${base} bg-slate-100 text-slate-700` };
    if (s === "submitted") return { label: t("portal.status.submitted"), cls: `${base} bg-primary-soft/10 text-primary` };

    if (s === "needs_revision")
        return { label: t("portal.status.needsRevision"), cls: `${base} bg-amber-50 text-amber-800` };
    if (s === "returned") return { label: t("portal.status.returned"), cls: `${base} bg-amber-50 text-amber-800` };

    if (s === "ready_for_delivery")
        return { label: t("portal.status.readyForDelivery"), cls: `${base} bg-indigo-50 text-indigo-700` };
    if (s === "physically_received")
        return { label: t("portal.status.physicallyReceived"), cls: `${base} bg-emerald-50 text-emerald-700` };

    if (s === "pickup_required")
        return { label: t("portal.status.pickupRequired"), cls: `${base} bg-rose-50 text-rose-700` };
    if (s === "picked_up") return { label: t("portal.status.pickedUp"), cls: `${base} bg-slate-100 text-slate-700` };

    return { label: raw ? String(raw) : t("portal.status.unknown"), cls: `${base} bg-slate-100 text-slate-700` };
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

export default function ClientDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const { client, loading: authLoading, isClientAuthenticated } = useClientAuth() as any;

    const [items, setItems] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setErrorKey(null);
            setLoading(true);
            const res = await clientSampleRequestService.list({ page: 1, per_page: 100 });
            setItems(res.data ?? []);
        } catch {
            setItems([]);
            setErrorKey("portal.dashboardPage.errors.loadFailed");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authLoading) return;
        if (!isClientAuthenticated) {
            navigate("/login", { replace: true });
            return;
        }
        void load();
    }, [authLoading, isClientAuthenticated, navigate, load]);

    const stats = useMemo(() => {
        const total = items.length;

        const byStatus = items.reduce<Record<string, number>>((acc, s) => {
            const k = String((s as any).request_status ?? "unknown").toLowerCase();
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
        }, {});

        const drafts = byStatus["draft"] ?? 0;
        const submitted = byStatus["submitted"] ?? 0;
        const needsAction = (byStatus["returned"] ?? 0) + (byStatus["needs_revision"] ?? 0);

        return { total, drafts, submitted, needsAction };
    }, [items]);

    const recent = useMemo(() => {
        const arr = [...items];
        arr.sort((a: any, b: any) => {
            const da = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
            const db = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 5);
    }, [items]);

    const greetingName = client?.name ? `, ${client.name}` : "";

    return (
        <div className="min-h-[60vh]">
            {/* Page header (match SamplesPage rhythm) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("portal.dashboardPage.title")}</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {t("portal.dashboardPage.subtitle", { name: greetingName })}
                    </p>
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
                        className="lims-btn-primary inline-flex items-center gap-2"
                        onClick={() => navigate("/portal/requests", { state: { openCreate: true } })}
                    >
                        <FilePlus2 size={16} />
                        {t("portal.dashboardPage.cta.createRequest")}
                    </button>

                    <button
                        type="button"
                        className="btn-outline inline-flex items-center gap-2"
                        onClick={() => navigate("/portal/requests")}
                    >
                        <List size={16} />
                        {t("portal.dashboardPage.cta.viewAll")}
                    </button>
                </div>
            </div>

            {/* Hero / Guidance */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                            <Clock size={18} />
                        </div>

                        <div className="min-w-0">
                            <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                {t("portal.dashboardPage.flowTitle")}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">{t("portal.dashboardPage.flowHint")}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    title={t("portal.dashboardPage.stats.totalTitle")}
                    value={stats.total}
                    subtitle={t("portal.dashboardPage.stats.totalSub")}
                    icon={<List size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("portal.dashboardPage.stats.draftTitle")}
                    value={stats.drafts}
                    subtitle={t("portal.dashboardPage.stats.draftSub")}
                    icon={<FilePlus2 size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("portal.dashboardPage.stats.submittedTitle")}
                    value={stats.submitted}
                    subtitle={t("portal.dashboardPage.stats.submittedSub")}
                    icon={<Clock size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("portal.dashboardPage.stats.needsActionTitle")}
                    value={stats.needsAction}
                    subtitle={t("portal.dashboardPage.stats.needsActionSub")}
                    icon={<AlertTriangle size={18} />}
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
                                <button
                                    type="button"
                                    className="btn-outline inline-flex items-center gap-2"
                                    onClick={load}
                                >
                                    <RefreshCw size={16} />
                                    {t("retry")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Recent + Tips */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recent */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("portal.dashboardPage.recent.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("portal.dashboardPage.recent.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">{t("loading")}</div>
                        ) : recent.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">{t("portal.dashboardPage.recent.emptyTitle")}</div>
                                <div className="text-sm text-gray-600 mt-1">{t("portal.dashboardPage.recent.emptyBody")}</div>

                                <button
                                    type="button"
                                    className="lims-btn-primary mt-4 inline-flex items-center gap-2"
                                    onClick={() => navigate("/portal/requests", { state: { openCreate: true } })}
                                >
                                    <FilePlus2 size={16} />
                                    {t("portal.requestsPage.empty.cta")}
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recent.map((it: any, idx: number) => {
                                    const rid = getRequestId(it);
                                    const chip = getStatusChip(it.request_status ?? null, t);
                                    const updated = fmtDate(it.updated_at ?? it.created_at, i18n.language || "en");

                                    return (
                                        <li key={String(rid ?? idx)} className="py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="font-medium text-gray-900">
                                                        {t("portal.requestDetail.title", { id: rid ?? "—" })}
                                                    </div>
                                                    <span className={chip.cls}>{chip.label}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {t("portal.dashboardPage.recent.updated")}: {updated}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                className={cx(
                                                    "lims-icon-button",
                                                    !rid && "opacity-50 cursor-not-allowed"
                                                )}
                                                onClick={() => rid && navigate(`/portal/requests/${rid}`)}
                                                disabled={!rid}
                                                aria-label={t("portal.dashboardPage.recent.openAria")}
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

                {/* Tips */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">{t("portal.dashboardPage.tips.title")}</div>
                        <div className="text-xs text-gray-500 mt-1">{t("portal.dashboardPage.tips.subtitle")}</div>
                    </div>

                    <div className="px-4 md:px-6 py-4 space-y-3 text-sm text-gray-700">
                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <CheckCircle2 size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">{t("portal.dashboardPage.tips.items.requiredFields")}</div>
                        </div>

                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <AlertTriangle size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">{t("portal.dashboardPage.tips.items.revise")}</div>
                        </div>

                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <Clock size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">{t("portal.dashboardPage.tips.items.timezone")}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
