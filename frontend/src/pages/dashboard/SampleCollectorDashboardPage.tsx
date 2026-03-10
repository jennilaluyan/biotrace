import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArrowRight, Clock, Inbox, Shield, TestTube2 } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";
import { fetchSampleRequestsQueue, type SampleRequestQueueRow } from "../../services/sampleRequestQueue";
import {
    DashboardEmptyState,
    DashboardErrorBanner,
    DashboardHeader,
    DashboardHero,
    DashboardPanel,
    DashboardQuickLinks,
    DashboardStatGrid,
    formatDashboardDateTime,
    getDashboardHeading,
    localizedValue,
    type DashboardAction,
    type DashboardQuickLinkItem,
    type DashboardStatItem,
    cx,
} from "./DashboardPage";

function normalizeToken(raw?: string | null) {
    return String(raw ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");
}

function getRequestId(row: any): number | null {
    const raw = row?.sample_id ?? row?.id ?? row?.request_id;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function safeApiMessage(error: any, fallback: string) {
    const data = error?.response?.data ?? error?.data ?? null;
    if (data && typeof data === "object") {
        const message = (data as any).message ?? (data as any).error ?? null;
        if (typeof message === "string" && message.trim()) return message.trim();
    }
    if (typeof error?.message === "string" && error.message.trim()) return error.message.trim();
    return fallback;
}

export default function SampleCollectorDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isSC = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const locale = i18n.language || "en";

    const [rows, setRows] = useState<SampleRequestQueueRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage("");

            const response = await fetchSampleRequestsQueue({ page: 1, per_page: 250, date: "30d" });
            const raw = (response?.data ?? []) as SampleRequestQueueRow[];

            const filtered = raw.filter((row) => {
                const status = normalizeToken(row.request_status ?? "");
                if (status === "draft") return false;
                return !row.lab_sample_code;
            });

            setRows(filtered);
        } catch (error: any) {
            setRows([]);
            setErrorMessage(
                safeApiMessage(
                    error,
                    t("dashboard.sampleCollector.errors.loadFailed", {
                        defaultValue: localizedValue(locale, {
                            en: "Failed to load dashboard data. Please try again.",
                            id: "Gagal memuat data dashboard. Silakan coba lagi.",
                        }),
                    })
                )
            );
        } finally {
            setLoading(false);
        }
    }, [locale, t]);

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
        const by = rows.reduce<Record<string, number>>((acc, row) => {
            const key = normalizeToken(row.request_status ?? "unknown");
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});

        return {
            inTransit: by["in_transit_to_collector"] ?? 0,
            underInspection: by["under_inspection"] ?? 0,
            returnedToAdmin: by["returned_to_admin"] ?? 0,
            intakePassed: by["intake_checklist_passed"] ?? 0,
            needsAttention:
                (by["inspection_failed"] ?? 0) +
                (by["returned_to_admin"] ?? 0) +
                (by["returned"] ?? 0) +
                (by["needs_revision"] ?? 0),
        };
    }, [rows]);

    const recent = useMemo(() => {
        return [...rows]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 8);
    }, [rows]);

    const stats: DashboardStatItem[] = [
        {
            key: "inTransit",
            title: t("dashboard.sampleCollector.stats.inTransit.title", {
                defaultValue: localizedValue(locale, {
                    en: "In transit to collector",
                    id: "Dalam perjalanan ke collector",
                }),
            }),
            value: counts.inTransit,
            subtitle: t("dashboard.sampleCollector.stats.inTransit.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Items that should be received by the collector.",
                    id: "Item yang perlu diterima oleh collector.",
                }),
            }),
            icon: <Clock size={18} />,
            loading,
        },
        {
            key: "underInspection",
            title: t("dashboard.sampleCollector.stats.underInspection.title", {
                defaultValue: localizedValue(locale, {
                    en: "Under inspection",
                    id: "Dalam inspeksi",
                }),
            }),
            value: counts.underInspection,
            subtitle: t("dashboard.sampleCollector.stats.underInspection.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Requests currently in the inspection stage.",
                    id: "Request yang sedang berada pada tahap inspeksi.",
                }),
            }),
            icon: <Shield size={18} />,
            loading,
        },
        {
            key: "needsAttention",
            title: t("dashboard.sampleCollector.stats.needsAttention.title", {
                defaultValue: localizedValue(locale, {
                    en: "Needs attention",
                    id: "Perlu perhatian",
                }),
            }),
            value: counts.needsAttention,
            subtitle: t("dashboard.sampleCollector.stats.needsAttention.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Returned or failed items that may block progress.",
                    id: "Item returned atau failed yang bisa menghambat workflow.",
                }),
            }),
            icon: <AlertTriangle size={18} />,
            loading,
        },
        {
            key: "intakePassed",
            title: t("dashboard.sampleCollector.stats.intakePassed.title", {
                defaultValue: localizedValue(locale, {
                    en: "Intake passed",
                    id: "Intake lulus",
                }),
            }),
            value: counts.intakePassed,
            subtitle: t("dashboard.sampleCollector.stats.intakePassed.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Requests that passed the intake checklist.",
                    id: "Request yang sudah lulus intake checklist.",
                }),
            }),
            icon: <TestTube2 size={18} />,
            loading,
        },
    ];

    const quickLinks: DashboardQuickLinkItem[] = [
        {
            key: "inTransit",
            title: t("dashboard.sampleCollector.queue.inTransit.title", {
                defaultValue: localizedValue(locale, {
                    en: "In transit",
                    id: "Dalam perjalanan",
                }),
            }),
            subtitle: t("dashboard.sampleCollector.queue.inTransit.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Receive the item and continue the workflow.",
                    id: "Terima barang dan lanjutkan workflow.",
                }),
            }),
            count: counts.inTransit,
            icon: <Clock size={18} />,
            onClick: () => navigate("/samples/requests?request_status=in_transit_to_collector"),
            tone: counts.inTransit > 0 ? "warn" : "neutral",
        },
        {
            key: "underInspection",
            title: t("dashboard.sampleCollector.queue.underInspection.title", {
                defaultValue: localizedValue(locale, {
                    en: "Under inspection",
                    id: "Dalam inspeksi",
                }),
            }),
            subtitle: t("dashboard.sampleCollector.queue.underInspection.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Complete inspection steps.",
                    id: "Selesaikan langkah inspeksi.",
                }),
            }),
            count: counts.underInspection,
            icon: <Shield size={18} />,
            onClick: () => navigate("/samples/requests?request_status=under_inspection"),
            tone: counts.underInspection > 0 ? "warn" : "neutral",
        },
        {
            key: "returnedToAdmin",
            title: t("dashboard.sampleCollector.queue.returnedToAdmin.title", {
                defaultValue: localizedValue(locale, {
                    en: "Returned to admin",
                    id: "Kembali ke admin",
                }),
            }),
            subtitle: t("dashboard.sampleCollector.queue.returnedToAdmin.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Items that need coordination or handback.",
                    id: "Item yang perlu koordinasi atau handback.",
                }),
            }),
            count: counts.returnedToAdmin,
            icon: <AlertTriangle size={18} />,
            onClick: () => navigate("/samples/requests?request_status=returned_to_admin"),
            tone: counts.returnedToAdmin > 0 ? "warn" : "neutral",
        },
        {
            key: "intakePassed",
            title: t("dashboard.sampleCollector.queue.intakePassed.title", {
                defaultValue: localizedValue(locale, {
                    en: "Intake passed",
                    id: "Intake lulus",
                }),
            }),
            subtitle: t("dashboard.sampleCollector.queue.intakePassed.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Ready for the next stage.",
                    id: "Siap ke tahap berikutnya.",
                }),
            }),
            count: counts.intakePassed,
            icon: <TestTube2 size={18} />,
            onClick: () => navigate("/samples/requests?request_status=intake_checklist_passed"),
        },
        {
            key: "allQueue",
            title: t("dashboard.sampleCollector.queue.allQueue.title", {
                defaultValue: localizedValue(locale, {
                    en: "All requests",
                    id: "Semua request",
                }),
            }),
            subtitle: t("dashboard.sampleCollector.queue.allQueue.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Browse the full queue.",
                    id: "Lihat seluruh antrian.",
                }),
            }),
            count: rows.length,
            icon: <Inbox size={18} />,
            onClick: () => navigate("/samples/requests"),
        },
    ];

    const actions: DashboardAction[] = [
        {
            key: "openQueue",
            label: t("dashboard.sampleCollector.actions.openQueue", {
                defaultValue: localizedValue(locale, {
                    en: "Open queue",
                    id: "Buka antrian",
                }),
            }),
            icon: <Inbox size={16} />,
            onClick: () => navigate("/samples/requests"),
            variant: "outline",
        },
        {
            key: "openSamples",
            label: t("dashboard.sampleCollector.actions.openSamples", {
                defaultValue: localizedValue(locale, {
                    en: "Open samples",
                    id: "Buka sampel",
                }),
            }),
            icon: <TestTube2 size={16} />,
            onClick: () => navigate("/samples"),
            variant: "primary",
        },
    ];

    const header = getDashboardHeading(t, locale, "sampleCollector", user?.name);

    return (
        <div className="min-h-[60vh]">
            <DashboardHeader
                title={header.title}
                subtitle={header.subtitle}
                loading={loading}
                onRefresh={() => void load()}
                refreshLabel={t("refresh", {
                    defaultValue: localizedValue(locale, {
                        en: "Refresh",
                        id: "Segarkan",
                    }),
                })}
                actions={actions}
            />

            <DashboardHero
                icon={<Shield size={18} />}
                title={t("dashboard.sampleCollector.hero.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Collector workflow overview",
                        id: "Ringkasan alur collector",
                    }),
                })}
                body={t("dashboard.sampleCollector.hero.body", {
                    defaultValue: localizedValue(locale, {
                        en: "Use Work Queue to jump to actionable requests such as in transit, under inspection, and returned items. Data reflects the last 30 days.",
                        id: "Pakai Work Queue untuk lompat ke request yang bisa dikerjakan sekarang seperti dalam perjalanan, inspeksi, dan item yang dikembalikan. Data dihitung dari 30 hari terakhir.",
                    }),
                })}
            />

            <DashboardStatGrid items={stats} />

            <DashboardErrorBanner
                message={errorMessage}
                onRetry={errorMessage ? () => void load() : undefined}
                retryLabel={t("retry", {
                    defaultValue: localizedValue(locale, {
                        en: "Retry",
                        id: "Coba lagi",
                    }),
                })}
            />

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DashboardPanel
                    title={t("dashboard.sampleCollector.workQueue.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Work queue",
                            id: "Work queue",
                        }),
                    })}
                    subtitle={t("dashboard.sampleCollector.workQueue.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Shortcuts based on request status.",
                            id: "Shortcut berdasarkan status request.",
                        }),
                    })}
                >
                    <DashboardQuickLinks items={quickLinks} loading={loading} />
                </DashboardPanel>

                <DashboardPanel
                    title={t("dashboard.sampleCollector.recent.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent requests",
                            id: "Request terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.sampleCollector.recent.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Most recently updated requests in the queue.",
                            id: "Request yang paling baru diupdate di antrian.",
                        }),
                    })}
                >
                    {loading ? (
                        <div className="text-sm text-gray-600">
                            {t("loading", {
                                defaultValue: localizedValue(locale, {
                                    en: "Loading…",
                                    id: "Memuat…",
                                }),
                            })}
                        </div>
                    ) : recent.length === 0 ? (
                        <DashboardEmptyState
                            title={t("dashboard.sampleCollector.recent.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No requests yet",
                                    id: "Belum ada request",
                                }),
                            })}
                            body={t("dashboard.sampleCollector.recent.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "Requests will appear here after clients submit them.",
                                    id: "Request akan muncul di sini setelah klien mengirim permintaan.",
                                }),
                            })}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recent.map((row: any, index) => {
                                const requestId = getRequestId(row);
                                const when = formatDashboardDateTime(
                                    row.updated_at ?? row.created_at ?? null,
                                    locale
                                );
                                const status = String(row.request_status ?? "—");
                                const client = row.client_name ?? row.client_email ?? "—";

                                return (
                                    <li key={String(requestId ?? index)} className="flex items-center justify-between gap-3 py-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-medium text-gray-900">
                                                    {t("dashboard.sampleCollector.recent.requestLabel", {
                                                        defaultValue: localizedValue(locale, {
                                                            en: "Request #{{id}}",
                                                            id: "Request #{{id}}",
                                                        }),
                                                        id: requestId ?? "—",
                                                    })}
                                                </div>
                                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                                                    {status}
                                                </span>
                                            </div>
                                            <div className="mt-1 truncate text-xs text-gray-500">
                                                {client} •{" "}
                                                {t("dashboard.sampleCollector.recent.updatedAt", {
                                                    defaultValue: localizedValue(locale, {
                                                        en: "Updated",
                                                        id: "Diperbarui",
                                                    }),
                                                })}
                                                : {when}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className={cx("lims-icon-button", !requestId && "cursor-not-allowed opacity-50")}
                                            onClick={() => requestId && navigate(`/samples/requests/${requestId}`)}
                                            disabled={!requestId}
                                            aria-label={t("open", {
                                                defaultValue: localizedValue(locale, {
                                                    en: "Open",
                                                    id: "Buka",
                                                }),
                                            })}
                                            title={t("open", {
                                                defaultValue: localizedValue(locale, {
                                                    en: "Open",
                                                    id: "Buka",
                                                }),
                                            })}
                                        >
                                            <ArrowRight size={16} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </DashboardPanel>
            </div>
        </div>
    );
}