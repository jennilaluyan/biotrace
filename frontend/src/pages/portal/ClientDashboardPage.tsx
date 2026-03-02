import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Download, FilePlus2, List, Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { clientSampleRequestService } from "../../services/sampleRequests";
import type { Sample } from "../../services/samples";
import { useClientAuth } from "../../hooks/useClientAuth";
import ClientCoaPreviewModal from "../../components/portal/ClientCoaPreviewModal";

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
    const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

    if (s === "draft") return { label: t("portal.status.draft", "Draft"), cls: `${base} bg-slate-100 text-slate-700` };
    if (s === "submitted") return { label: t("portal.status.submitted", "Submitted"), cls: `${base} bg-primary-soft/10 text-primary` };
    if (s === "needs_revision" || s === "returned")
        return { label: t("portal.status.needsRevision", "Needs revision"), cls: `${base} bg-amber-50 text-amber-800` };
    if (s === "ready_for_delivery")
        return { label: t("portal.status.readyForDelivery", "Ready for delivery"), cls: `${base} bg-indigo-50 text-indigo-700` };
    if (s === "physically_received")
        return { label: t("portal.status.physicallyReceived", "Physically received"), cls: `${base} bg-emerald-50 text-emerald-700` };

    return { label: raw ? String(raw) : t("portal.status.unknown", "Unknown"), cls: `${base} bg-slate-100 text-slate-700` };
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

export default function ClientDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { client, loading: authLoading, isClientAuthenticated } = useClientAuth() as any;

    const [items, setItems] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    // ✅ COA preview modal (client)
    const [coaPreviewOpen, setCoaPreviewOpen] = useState(false);
    const [coaPreviewSampleId, setCoaPreviewSampleId] = useState<number | null>(null);

    const openCoaPreview = (sampleId: number) => {
        setCoaPreviewSampleId(sampleId);
        setCoaPreviewOpen(true);
    };

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

        // COA released count (if backend attaches this field)
        const coaAvailable = items.filter((it: any) => !!it?.coa_released_to_client_at).length;

        return { total, drafts, submitted, needsAction, coaAvailable };
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
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="min-w-0">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        {t("portal.dashboardPage.title", "Dashboard")}
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">{t("portal.dashboardPage.subtitle", { name: greetingName })}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        type="button"
                        className={cx("lims-icon-button", loading && "opacity-60 cursor-not-allowed")}
                        onClick={load}
                        disabled={loading}
                        aria-label={t("refresh", "Refresh")}
                        title={t("refresh", "Refresh")}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary inline-flex items-center gap-2"
                        onClick={() => navigate("/portal/requests", { state: { openCreate: true } })}
                    >
                        <FilePlus2 size={16} />
                        {t("portal.dashboardPage.cta.createRequest", "New request")}
                    </button>

                    <button
                        type="button"
                        className="btn-outline inline-flex items-center gap-2"
                        onClick={() => navigate("/portal/requests")}
                    >
                        <List size={16} />
                        {t("portal.dashboardPage.cta.viewAll", "View all")}
                    </button>
                </div>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4">
                    <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                            <Clock size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                {t("portal.dashboardPage.flowTitle", "Workflow at a glance")}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">
                                {t("portal.dashboardPage.flowHint", "Draft → Submitted → Admin review → Delivery → Physically received.")}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                <StatCard
                    title={t("portal.dashboardPage.stats.totalTitle", "Total requests")}
                    value={stats.total}
                    subtitle={t("portal.dashboardPage.stats.totalSub", "All requests you’ve created.")}
                    icon={<List size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("portal.dashboardPage.stats.draftTitle", "Draft")}
                    value={stats.drafts}
                    subtitle={t("portal.dashboardPage.stats.draftSub", "Requests you can still edit.")}
                    icon={<FilePlus2 size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("portal.dashboardPage.stats.submittedTitle", "Submitted")}
                    value={stats.submitted}
                    subtitle={t("portal.dashboardPage.stats.submittedSub", "Waiting for admin review.")}
                    icon={<Clock size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("portal.dashboardPage.stats.needsActionTitle", "Needs action")}
                    value={stats.needsAction}
                    subtitle={t("portal.dashboardPage.stats.needsActionSub", "Returned for revision.")}
                    icon={<AlertTriangle size={18} />}
                    loading={loading}
                />
                <StatCard
                    title={t("portal.dashboardPage.stats.coaTitle", "COA tersedia")}
                    value={stats.coaAvailable}
                    subtitle={t("portal.dashboardPage.stats.coaSub", "COA yang sudah bisa diunduh.")}
                    icon={<Download size={18} />}
                    loading={loading}
                />
            </div>

            {errorKey ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <div className="flex items-start gap-3">
                        <AlertTriangle size={18} className="mt-0.5" />
                        <div className="min-w-0">
                            <div className="font-semibold">{t(errorKey)}</div>
                            <div className="mt-2">
                                <button type="button" className="btn-outline inline-flex items-center gap-2" onClick={load}>
                                    <RefreshCw size={16} />
                                    {t("retry", "Retry")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">
                            {t("portal.dashboardPage.recent.title", "Recent requests")}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            {t("portal.dashboardPage.recent.subtitle", "Jump back into what you worked on recently.")}
                        </div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">{t("loading", "Loading…")}</div>
                        ) : recent.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">
                                    {t("portal.dashboardPage.recent.emptyTitle", "No requests yet")}
                                </div>
                                <div className="text-sm text-gray-600 mt-1">
                                    {t("portal.dashboardPage.recent.emptyBody", "Create your first request to start the workflow.")}
                                </div>

                                <button
                                    type="button"
                                    className="lims-btn-primary mt-4 inline-flex items-center gap-2"
                                    onClick={() => navigate("/portal/requests", { state: { openCreate: true } })}
                                >
                                    <FilePlus2 size={16} />
                                    {t("portal.requestsPage.empty.cta", "Create request")}
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recent.map((it: any, idx: number) => {
                                    const rid = getRequestId(it);
                                    const chip = getStatusChip(it.request_status ?? null, t);
                                    const updated = fmtDate(it.updated_at ?? it.created_at, i18n.language || "en");

                                    const coaSampleId = Number((it as any).sample_id ?? rid);

                                    return (
                                        <li key={String(rid ?? idx)} className="py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="font-medium text-gray-900">{t("portal.requestDetail.title", { id: rid ?? "—" })}</div>
                                                    <span className={chip.cls}>{chip.label}</span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    {t("portal.dashboardPage.recent.updated", "Updated")}: {updated}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {(it as any)?.coa_released_to_client_at && Number.isFinite(coaSampleId) ? (
                                                    <button
                                                        type="button"
                                                        className="lims-icon-button"
                                                        onClick={() => openCoaPreview(coaSampleId)}
                                                        aria-label={t("portal.actions.downloadCoa", "Download COA")}
                                                        title={t("portal.actions.downloadCoa", "Download COA")}
                                                    >
                                                        <Download size={16} />
                                                    </button>
                                                ) : null}

                                                <button
                                                    type="button"
                                                    className={cx("lims-icon-button", !rid && "opacity-50 cursor-not-allowed")}
                                                    onClick={() => rid && navigate(`/portal/requests/${rid}`)}
                                                    disabled={!rid}
                                                    aria-label={t("portal.dashboardPage.recent.openAria", "Open request")}
                                                    title={t("open", "Open")}
                                                >
                                                    <ArrowRight size={16} />
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">
                            {t("portal.dashboardPage.tips.title", "Tips to avoid delays")}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                            {t("portal.dashboardPage.tips.subtitle", "Small habits that keep your request moving.")}
                        </div>
                    </div>

                    <div className="px-4 md:px-6 py-4 space-y-3 text-sm text-gray-700">
                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <CheckCircle2 size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">{t("portal.dashboardPage.tips.items.requiredFields", "Fill required fields before submitting.")}</div>
                        </div>

                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <AlertTriangle size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">{t("portal.dashboardPage.tips.items.revise", "If returned, revise then submit again.")}</div>
                        </div>

                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <Clock size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">{t("portal.dashboardPage.tips.items.timezone", "Times shown in your local timezone.")}</div>
                        </div>
                    </div>
                </div>
            </div>

            <ClientCoaPreviewModal
                open={coaPreviewOpen}
                onClose={() => {
                    setCoaPreviewOpen(false);
                    setCoaPreviewSampleId(null);
                }}
                sampleId={coaPreviewSampleId}
                title={t("portal.coa.previewTitle", "COA Preview")}
            />
        </div>
    );
}