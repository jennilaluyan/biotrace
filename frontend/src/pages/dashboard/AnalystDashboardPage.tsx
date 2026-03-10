import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRight,
    ClipboardCheck,
    FlaskConical,
    TestTube2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";
import { getErrorMessage } from "../../utils/errors";
import { sampleService, type Sample } from "../../services/samples";
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

function isArchivedSample(sample: any) {
    return Boolean(
        sample?.archived_at ||
        sample?.is_archived ||
        sample?.coa_generated_at ||
        sample?.coa_file_url ||
        sample?.coa_report_id ||
        sample?.report_generated_at ||
        sample?.report_pdf_url ||
        sample?.report?.pdf_url
    );
}

function getReagentRequestStatus(sample: any): string | null {
    const direct = sample?.reagent_request_status ?? sample?.reagentRequestStatus ?? null;
    if (direct) return String(direct).toLowerCase();

    const request = sample?.reagent_request ?? sample?.reagentRequest ?? sample?.reagentRequestLatest ?? null;
    const nested = request?.status ?? request?.request_status ?? null;
    if (nested) return String(nested).toLowerCase();

    return null;
}

export default function AnalystDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isAnalyst = roleId === ROLE_ID.ANALYST;
    const locale = i18n.language || "en";

    const [rows, setRows] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState("");

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setErrorMessage("");

            const response: any = await sampleService.getAll({
                page: 1,
                per_page: 250,
            } as any);

            const items = Array.isArray(response?.data) ? (response.data as Sample[]) : [];
            const filtered = items
                .filter((sample: any) => !!String(sample?.lab_sample_code ?? "").trim())
                .filter((sample: any) => !isArchivedSample(sample));

            setRows(filtered);
        } catch (error: any) {
            setRows([]);
            setErrorMessage(
                getErrorMessage(error) ||
                t("dashboard.analyst.errors.loadFailed", {
                    defaultValue: localizedValue(locale, {
                        en: "Failed to load dashboard data. Please try again.",
                        id: "Gagal memuat data dashboard. Silakan coba lagi.",
                    }),
                })
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

        if (!isAnalyst) {
            navigate("/dashboard", { replace: true });
            return;
        }

        void load();
    }, [authLoading, isAuthenticated, isAnalyst, navigate, load]);

    const counts = useMemo(() => {
        const awaitingReceive = rows.filter(
            (sample: any) => !!sample?.sc_delivered_to_analyst_at && !sample?.analyst_received_at
        ).length;

        const crosscheckPending = rows.filter((sample: any) => {
            if (!sample?.analyst_received_at) return false;
            const status = String(sample?.crosscheck_status ?? "pending").toLowerCase();
            return status !== "passed";
        }).length;

        const readyForReagent = rows.filter((sample: any) => {
            const crosscheckStatus = String(sample?.crosscheck_status ?? "pending").toLowerCase();
            if (crosscheckStatus !== "passed") return false;

            const reagentStatus = getReagentRequestStatus(sample);
            return !reagentStatus || (reagentStatus !== "submitted" && reagentStatus !== "approved");
        }).length;

        const inTesting = rows.filter((sample: any) => {
            const reagentStatus = getReagentRequestStatus(sample);
            if (reagentStatus !== "approved") return false;

            const doneFlags = [
                sample?.testing_completed_at,
                sample?.testing_done_at,
                sample?.tests_completed_at,
            ].filter(Boolean);
            if (doneFlags.length > 0) return false;

            const currentStatus = String(sample?.current_status ?? "").toLowerCase();
            if (
                currentStatus.includes("reported") ||
                currentStatus.includes("validated") ||
                currentStatus.includes("verified")
            ) {
                return false;
            }

            return true;
        }).length;

        return { awaitingReceive, crosscheckPending, readyForReagent, inTesting };
    }, [rows]);

    const recent = useMemo(() => {
        return [...rows]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.updated_at ?? a.received_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.updated_at ?? b.received_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 8);
    }, [rows]);

    const stats: DashboardStatItem[] = [
        {
            key: "awaitingReceive",
            title: t("dashboard.analyst.stats.awaitingReceive.title", {
                defaultValue: localizedValue(locale, {
                    en: "Awaiting receive",
                    id: "Menunggu diterima",
                }),
            }),
            value: counts.awaitingReceive,
            subtitle: t("dashboard.analyst.stats.awaitingReceive.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Samples delivered by collector but not received by analyst yet.",
                    id: "Sampel sudah diantar collector tetapi belum diterima analis.",
                }),
            }),
            icon: <TestTube2 size={18} />,
            loading,
        },
        {
            key: "crosscheckPending",
            title: t("dashboard.analyst.stats.crosscheckPending.title", {
                defaultValue: localizedValue(locale, {
                    en: "Crosscheck pending",
                    id: "Crosscheck belum selesai",
                }),
            }),
            value: counts.crosscheckPending,
            subtitle: t("dashboard.analyst.stats.crosscheckPending.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Received samples that still require crosscheck.",
                    id: "Sampel yang sudah diterima dan masih perlu crosscheck.",
                }),
            }),
            icon: <ClipboardCheck size={18} />,
            loading,
        },
        {
            key: "readyForReagent",
            title: t("dashboard.analyst.stats.readyForReagent.title", {
                defaultValue: localizedValue(locale, {
                    en: "Ready for reagent request",
                    id: "Siap buat permintaan reagen",
                }),
            }),
            value: counts.readyForReagent,
            subtitle: t("dashboard.analyst.stats.readyForReagent.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Crosscheck passed and ready to prepare reagent request.",
                    id: "Crosscheck lulus dan siap buat permintaan reagen.",
                }),
            }),
            icon: <FlaskConical size={18} />,
            loading,
        },
        {
            key: "inTesting",
            title: t("dashboard.analyst.stats.inTesting.title", {
                defaultValue: localizedValue(locale, {
                    en: "In testing",
                    id: "Sedang diuji",
                }),
            }),
            value: counts.inTesting,
            subtitle: t("dashboard.analyst.stats.inTesting.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Reagent approved and testing is currently in progress.",
                    id: "Reagen disetujui dan pengujian sedang berjalan.",
                }),
            }),
            icon: <TestTube2 size={18} />,
            loading,
        },
    ];

    const quickLinks: DashboardQuickLinkItem[] = [
        {
            key: "awaitingReceive",
            title: t("dashboard.analyst.queue.awaitingReceive.title", {
                defaultValue: localizedValue(locale, {
                    en: "Awaiting receive",
                    id: "Menunggu diterima",
                }),
            }),
            subtitle: t("dashboard.analyst.queue.awaitingReceive.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Confirm you have received the physical sample.",
                    id: "Konfirmasi penerimaan sampel fisik.",
                }),
            }),
            count: counts.awaitingReceive,
            icon: <TestTube2 size={18} />,
            onClick: () => navigate("/samples"),
            tone: counts.awaitingReceive > 0 ? "warn" : "neutral",
        },
        {
            key: "crosscheckPending",
            title: t("dashboard.analyst.queue.crosscheckPending.title", {
                defaultValue: localizedValue(locale, {
                    en: "Crosscheck pending",
                    id: "Crosscheck",
                }),
            }),
            subtitle: t("dashboard.analyst.queue.crosscheckPending.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Verify physical label versus lab code and submit result.",
                    id: "Cocokkan label fisik versus kode lab lalu submit hasil.",
                }),
            }),
            count: counts.crosscheckPending,
            icon: <ClipboardCheck size={18} />,
            onClick: () => navigate("/samples"),
            tone: counts.crosscheckPending > 0 ? "warn" : "neutral",
        },
        {
            key: "readyForReagent",
            title: t("dashboard.analyst.queue.readyForReagent.title", {
                defaultValue: localizedValue(locale, {
                    en: "Ready for reagent",
                    id: "Siap reagen",
                }),
            }),
            subtitle: t("dashboard.analyst.queue.readyForReagent.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Prepare reagent request after crosscheck passes.",
                    id: "Siapkan permintaan reagen setelah crosscheck lulus.",
                }),
            }),
            count: counts.readyForReagent,
            icon: <FlaskConical size={18} />,
            onClick: () => navigate("/samples"),
        },
        {
            key: "inTesting",
            title: t("dashboard.analyst.queue.inTesting.title", {
                defaultValue: localizedValue(locale, {
                    en: "In testing",
                    id: "Pengujian",
                }),
            }),
            subtitle: t("dashboard.analyst.queue.inTesting.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Continue testing workflow until completed.",
                    id: "Lanjutkan workflow uji sampai selesai.",
                }),
            }),
            count: counts.inTesting,
            icon: <TestTube2 size={18} />,
            onClick: () => navigate("/samples"),
        },
    ];

    const actions: DashboardAction[] = [
        {
            key: "openSamples",
            label: t("dashboard.analyst.actions.openSamples", {
                defaultValue: localizedValue(locale, {
                    en: "Open samples",
                    id: "Buka sampel",
                }),
            }),
            icon: <TestTube2 size={16} />,
            onClick: () => navigate("/samples"),
            variant: "outline",
        },
        {
            key: "openReports",
            label: t("dashboard.analyst.actions.openReports", {
                defaultValue: localizedValue(locale, {
                    en: "Open reports",
                    id: "Buka laporan",
                }),
            }),
            icon: <FlaskConical size={16} />,
            onClick: () => navigate("/reports"),
            variant: "primary",
        },
    ];

    const header = getDashboardHeading(t, locale, "analyst", user?.name);

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
                icon={<FlaskConical size={18} />}
                title={t("dashboard.analyst.hero.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Analyst workflow overview",
                        id: "Ringkasan alur analis",
                    }),
                })}
                body={t("dashboard.analyst.hero.body", {
                    defaultValue: localizedValue(locale, {
                        en: "Use Work Queue to jump to the next actionable step: receive, crosscheck, prepare reagents, and continue testing.",
                        id: "Pakai Work Queue untuk lompat ke langkah yang bisa dikerjakan sekarang: terima, crosscheck, siapkan reagen, lalu lanjut uji.",
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
                    title={t("dashboard.analyst.workQueue.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Work queue",
                            id: "Work queue",
                        }),
                    })}
                    subtitle={t("dashboard.analyst.workQueue.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Actionable shortcuts based on current stage.",
                            id: "Shortcut berdasarkan tahap yang sedang berjalan.",
                        }),
                    })}
                >
                    <DashboardQuickLinks items={quickLinks} loading={loading} />
                </DashboardPanel>

                <DashboardPanel
                    title={t("dashboard.analyst.recent.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent samples",
                            id: "Sampel terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.analyst.recent.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Most recently updated samples.",
                            id: "Sampel yang paling baru diupdate.",
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
                            title={t("dashboard.analyst.recent.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No samples yet",
                                    id: "Belum ada sampel",
                                }),
                            })}
                            body={t("dashboard.analyst.recent.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "Samples will appear here once they enter the lab workflow.",
                                    id: "Sampel akan muncul setelah masuk ke workflow lab.",
                                }),
                            })}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recent.map((sample: any, index) => {
                                const sampleId = Number(sample?.sample_id ?? sample?.id ?? 0) || null;
                                const code = String(sample?.lab_sample_code ?? "—");
                                const type = String(sample?.sample_type ?? "—");
                                const when = formatDashboardDateTime(
                                    sample?.updated_at ?? sample?.received_at ?? sample?.created_at ?? null,
                                    locale
                                );

                                return (
                                    <li
                                        key={String(sampleId ?? index)}
                                        className="flex items-center justify-between gap-3 py-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-xs text-gray-900">
                                                    {code}
                                                </div>
                                                <div className="truncate text-sm font-medium text-gray-900">{type}</div>
                                            </div>
                                            <div className="mt-1 truncate text-xs text-gray-500">
                                                {t("dashboard.analyst.recent.updatedAt", {
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
                                            className={cx("lims-icon-button", !sampleId && "cursor-not-allowed opacity-50")}
                                            onClick={() => sampleId && navigate(`/samples/${sampleId}`)}
                                            disabled={!sampleId}
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