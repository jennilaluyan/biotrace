import { ReactNode, Suspense, lazy } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";

const AdminDashboardPage = lazy(() => import("./AdminDashboardPage"));
const SampleCollectorDashboardPage = lazy(() => import("./SampleCollectorDashboardPage"));
const AnalystDashboardPage = lazy(() => import("./AnalystDashboardPage"));
const OperationalManagerDashboardPage = lazy(() => import("./OperationalManagerDashboardPage"));
const LaboratoryHeadDashboardPage = lazy(() => import("./LaboratoryHeadDashboardPage"));

export type DashboardRoleKey =
    | "admin"
    | "sampleCollector"
    | "analyst"
    | "operationalManager"
    | "laboratoryHead"
    | "client";

export type DashboardTimeOfDay = "morning" | "afternoon" | "evening" | "night";

export type DashboardAction = {
    key: string;
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    variant?: "primary" | "outline";
    disabled?: boolean;
};

export type DashboardStatItem = {
    key: string;
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: ReactNode;
    loading?: boolean;
};

export type DashboardQuickLinkItem = {
    key: string;
    title: string;
    subtitle: string;
    count: string | number;
    icon?: ReactNode;
    onClick: () => void;
    tone?: "neutral" | "warn" | "ok";
    disabled?: boolean;
};

const DEFAULT_DASHBOARD_COPY = {
    en: {
        greeting: {
            morning: "Good Morning",
            afternoon: "Good Afternoon",
            evening: "Good Evening",
            night: "Good Night",
        },
        roleSubtitle: {
            admin: "Prioritize approvals, review new requests, and keep documents moving.",
            sampleCollector: "Focus on pickup, inspection, and moving samples forward.",
            analyst: "Focus on receiving, crosschecking, testing, and keeping results moving.",
            operationalManager: "Keep approvals moving and unblock the workflow.",
            laboratoryHead: "Oversee quality, approvals, and final laboratory decisions.",
            client: "Create requests, track progress, and download released COAs.",
        },
    },
    id: {
        greeting: {
            morning: "Selamat pagi",
            afternoon: "Selamat siang",
            evening: "Selamat sore",
            night: "Selamat malam",
        },
        roleSubtitle: {
            admin: "Prioritaskan approval, tinjau request baru, dan jaga dokumen tetap berjalan.",
            sampleCollector: "Fokus pada penjemputan, inspeksi, dan melanjutkan alur sampel.",
            analyst: "Fokus pada penerimaan, crosscheck, pengujian, dan menjaga alur hasil tetap berjalan.",
            operationalManager: "Jaga approval tetap jalan dan buka hambatan workflow.",
            laboratoryHead: "Awasi mutu, approval, dan keputusan akhir laboratorium.",
            client: "Buat permintaan, pantau progres, dan unduh COA yang sudah dirilis.",
        },
    },
} as const;

export function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export function isIndonesianLanguage(locale?: string | null) {
    return String(locale ?? "").toLowerCase().startsWith("id");
}

export function localizedValue(
    locale: string | null | undefined,
    values: { en: string; id: string }
) {
    return isIndonesianLanguage(locale) ? values.id : values.en;
}

export function getDashboardTimeOfDay(date = new Date()): DashboardTimeOfDay {
    const hour = date.getHours();

    if (hour >= 6 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "afternoon";
    if (hour >= 18 && hour < 21) return "evening";
    return "night";
}

export function getDashboardHeading(
    t: any,
    locale: string | null | undefined,
    role: DashboardRoleKey,
    name?: string | null,
    now = new Date()
) {
    const language = isIndonesianLanguage(locale) ? "id" : "en";
    const timeOfDay = getDashboardTimeOfDay(now);

    const greeting = t(`dashboard.common.greeting.${timeOfDay}`, {
        defaultValue: DEFAULT_DASHBOARD_COPY[language].greeting[timeOfDay],
    });

    const title = name ? `${greeting}, ${name}` : greeting;
    const subtitle = t(`dashboard.${role}.header.subtitle`, {
        defaultValue: DEFAULT_DASHBOARD_COPY[language].roleSubtitle[role],
    });

    return { title, subtitle, timeOfDay };
}

export function formatDashboardDateTime(iso: string | null | undefined, locale: string) {
    if (!iso) return "—";

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso);

    try {
        return new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        }).format(date);
    } catch {
        return date.toLocaleString();
    }
}

export function withinLastDays(iso: string | null | undefined, days: number) {
    if (!iso) return false;

    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return false;

    const rangeMs = days * 24 * 60 * 60 * 1000;
    return Date.now() - date.getTime() <= rangeMs;
}

export function DashboardHeader(props: {
    title: string;
    subtitle: string;
    loading?: boolean;
    onRefresh?: () => void;
    refreshLabel?: string;
    actions?: DashboardAction[];
}) {
    const { title, subtitle, loading, onRefresh, refreshLabel, actions = [] } = props;

    return (
        <div className="flex flex-col gap-3 px-0 py-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
                <h1 className="text-lg font-bold text-gray-900 md:text-xl">{title}</h1>
                <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 md:justify-end">
                {onRefresh ? (
                    <button
                        type="button"
                        className={cx("lims-icon-button", loading && "cursor-not-allowed opacity-60")}
                        onClick={onRefresh}
                        disabled={loading}
                        aria-label={refreshLabel}
                        title={refreshLabel}
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    </button>
                ) : null}

                {actions.map((action) => (
                    <button
                        key={action.key}
                        type="button"
                        className={cx(
                            action.variant === "primary" ? "lims-btn-primary" : "btn-outline",
                            "inline-flex h-9 items-center gap-2 whitespace-nowrap px-4",
                            action.disabled && "cursor-not-allowed opacity-60"
                        )}
                        onClick={action.onClick}
                        disabled={action.disabled}
                    >
                        {action.icon}
                        {action.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function DashboardHero(props: {
    icon?: ReactNode;
    title: string;
    body: string;
    className?: string;
}) {
    const { icon, title, body, className } = props;

    return (
        <div className={cx("mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm", className)}>
            <div className="px-4 py-4 md:px-6">
                <div className="flex items-start gap-3">
                    {icon ? (
                        <div className="mt-0.5 shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                            {icon}
                        </div>
                    ) : null}

                    <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
                        <div className="mt-1 text-sm text-gray-700">{body}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function DashboardStatCard({
    title,
    value,
    subtitle,
    icon,
    loading,
}: DashboardStatItem) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-xs text-gray-500">{title}</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                        {loading ? <span className="text-gray-400">—</span> : value}
                    </div>
                    {subtitle ? <div className="mt-2 text-xs text-gray-500">{subtitle}</div> : null}
                </div>

                {icon ? (
                    <div className="shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                        {icon}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export function DashboardStatGrid({ items }: { items: DashboardStatItem[] }) {
    if (items.length === 0) return null;

    return (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {items.map((item) => {
                const { key, ...rest } = item;
                return <DashboardStatCard key={key} {...rest} />;
            })}
        </div>
    );
}

export function DashboardErrorBanner(props: {
    message: string;
    onRetry?: () => void;
    retryLabel?: string;
}) {
    const { message, onRetry, retryLabel } = props;

    if (!message) return null;

    return (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <div className="flex items-start gap-3">
                <Loader2 size={18} className="mt-0.5 hidden" />
                <div className="min-w-0">
                    <div className="font-semibold">{message}</div>

                    {onRetry ? (
                        <div className="mt-2">
                            <button
                                type="button"
                                className="btn-outline inline-flex items-center gap-2"
                                onClick={onRetry}
                            >
                                <RefreshCw size={16} />
                                {retryLabel}
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export function DashboardPanel(props: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    className?: string;
}) {
    const { title, subtitle, children, className } = props;

    return (
        <div className={cx("overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm", className)}>
            <div className="border-b border-gray-100 px-4 py-4 md:px-6">
                <div className="text-sm font-semibold text-gray-900">{title}</div>
                {subtitle ? <div className="mt-1 text-xs text-gray-500">{subtitle}</div> : null}
            </div>

            <div className="px-4 py-4 md:px-6">{children}</div>
        </div>
    );
}

export function DashboardQuickLinks(props: {
    items: DashboardQuickLinkItem[];
    loading?: boolean;
}) {
    const { items, loading } = props;

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((item) => {
                const toneClass =
                    item.tone === "warn"
                        ? "border-amber-200 bg-amber-50"
                        : item.tone === "ok"
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-gray-200 bg-gray-50";

                return (
                    <button
                        key={item.key}
                        type="button"
                        onClick={item.onClick}
                        disabled={loading || item.disabled}
                        className={cx(
                            "rounded-2xl border p-4 text-left transition hover:shadow-sm",
                            toneClass,
                            (loading || item.disabled) && "cursor-not-allowed opacity-60"
                        )}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs text-gray-600">{item.title}</div>
                                <div className="mt-1 text-2xl font-semibold text-gray-900">
                                    {loading ? "—" : item.count}
                                </div>
                                <div className="mt-2 text-xs text-gray-600">{item.subtitle}</div>
                            </div>

                            {item.icon ? (
                                <div className="shrink-0 rounded-2xl border border-black/5 bg-white/60 p-2 text-gray-700">
                                    {item.icon}
                                </div>
                            ) : null}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

export function DashboardEmptyState(props: {
    title: string;
    body: string;
    action?: Omit<DashboardAction, "key">;
}) {
    const { title, body, action } = props;

    return (
        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
            <div className="font-semibold text-gray-900">{title}</div>
            <div className="mt-1 text-sm text-gray-600">{body}</div>

            {action ? (
                <button
                    type="button"
                    className={cx(
                        action.variant === "primary" ? "lims-btn-primary" : "btn-outline",
                        "mt-4 inline-flex items-center gap-2"
                    )}
                    onClick={action.onClick}
                    disabled={action.disabled}
                >
                    {action.icon}
                    {action.label}
                </button>
            ) : null}
        </div>
    );
}

function DashboardRouteFallback() {
    const { t, i18n } = useTranslation();

    return (
        <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-gray-600">
            <Loader2 size={16} className="animate-spin" />
            {t("loading", {
                defaultValue: localizedValue(i18n.language, {
                    en: "Loading…",
                    id: "Memuat…",
                }),
            })}
        </div>
    );
}

function resolveDashboardComponent(roleId: number | null) {
    if (roleId === ROLE_ID.ADMIN) return AdminDashboardPage;
    if (roleId === ROLE_ID.SAMPLE_COLLECTOR) return SampleCollectorDashboardPage;
    if (roleId === ROLE_ID.ANALYST) return AnalystDashboardPage;
    if (roleId === ROLE_ID.OPERATIONAL_MANAGER) return OperationalManagerDashboardPage;
    if (roleId === ROLE_ID.LAB_HEAD) return LaboratoryHeadDashboardPage;
    return AdminDashboardPage;
}

export default function DashboardPage() {
    const { user } = useAuth();
    const roleId = getUserRoleId(user);
    const Component = resolveDashboardComponent(roleId);

    return (
        <Suspense fallback={<DashboardRouteFallback />}>
            <Component />
        </Suspense>
    );
}