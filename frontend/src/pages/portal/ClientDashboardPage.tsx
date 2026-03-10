import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Clock,
    Download,
    FilePlus2,
    List,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { apiGet } from "../../services/api";
import type { PaginatedResponse, Sample } from "../../services/samples";
import { useClientAuth } from "../../hooks/useClientAuth";
import ClientCoaPreviewModal from "../../components/portal/ClientCoaPreviewModal";
import {
    DashboardEmptyState,
    DashboardErrorBanner,
    DashboardHeader,
    DashboardHero,
    DashboardPanel,
    DashboardStatGrid,
    formatDashboardDateTime,
    getDashboardHeading,
    isIndonesianLanguage,
    localizedValue,
    type DashboardAction,
    type DashboardStatItem,
    cx,
} from "../dashboard/DashboardPage";

function getSampleId(item: any): number | null {
    const raw = item?.sample_id ?? item?.id ?? item?.request_id;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function unwrapClientSamples(response: any): PaginatedResponse<Sample> {
    if (response && typeof response === "object" && "data" in response && "meta" in response) {
        return response as PaginatedResponse<Sample>;
    }

    const inner = response?.data ?? response;

    if (inner && typeof inner === "object" && "data" in inner && "meta" in inner) {
        return inner as PaginatedResponse<Sample>;
    }

    if (Array.isArray(inner)) {
        return {
            data: inner as Sample[],
            meta: {
                current_page: 1,
                last_page: 1,
                per_page: inner.length,
                total: inner.length,
            },
        };
    }

    return {
        data: [],
        meta: {
            current_page: 1,
            last_page: 1,
            per_page: 10,
            total: 0,
        },
    };
}

function buildClientRequestNumberMap(items: Sample[]) {
    const rows = items
        .map((item) => ({
            id: getSampleId(item),
            createdAt: (item as any)?.created_at ?? null,
        }))
        .filter((row): row is { id: number; createdAt: string | null } => row.id !== null && Number.isFinite(row.id) && row.id > 0);

    rows.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : Number.NaN;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : Number.NaN;

        if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
        return a.id - b.id;
    });

    const map = new Map<number, number>();
    rows.forEach((row, index) => map.set(row.id, index + 1));
    return map;
}

function shortRequestStatusLabel(raw?: string | null, locale = "en") {
    const key = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    const isId = isIndonesianLanguage(locale);

    const map: Record<string, { en: string; id: string }> = {
        draft: { en: "draft", id: "draf" },
        submitted: { en: "submitted", id: "terkirim" },
        needs_revision: { en: "revision", id: "revisi" },
        returned: { en: "revision", id: "revisi" },
        ready_for_delivery: { en: "delivery", id: "pengantaran" },
        physically_received: { en: "received", id: "diterima" },
    };

    if (map[key]) return (isId ? map[key].id : map[key].en).toLowerCase();
    return (key || "unknown").replace(/_/g, " ").toLowerCase();
}

type StatusChip = {
    label: string;
    cls: string;
};

function getStatusChip(raw: string | null | undefined, locale: string): StatusChip {
    const status = String(raw ?? "").trim().toLowerCase();
    const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

    if (status === "draft") {
        return {
            label: shortRequestStatusLabel("draft", locale),
            cls: `${base} bg-slate-100 text-slate-700`,
        };
    }

    if (status === "submitted") {
        return {
            label: shortRequestStatusLabel("submitted", locale),
            cls: `${base} bg-primary-soft/10 text-primary`,
        };
    }

    if (status === "needs_revision" || status === "returned") {
        return {
            label: shortRequestStatusLabel("needs_revision", locale),
            cls: `${base} bg-amber-50 text-amber-800`,
        };
    }

    if (status === "ready_for_delivery") {
        return {
            label: shortRequestStatusLabel("ready_for_delivery", locale),
            cls: `${base} bg-indigo-50 text-indigo-700`,
        };
    }

    if (status === "physically_received") {
        return {
            label: shortRequestStatusLabel("physically_received", locale),
            cls: `${base} bg-emerald-50 text-emerald-700`,
        };
    }

    return {
        label: shortRequestStatusLabel(raw ?? "unknown", locale),
        cls: `${base} bg-slate-100 text-slate-700`,
    };
}

export default function ClientDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const locale = i18n.language || "en";

    const { client, loading: authLoading, isClientAuthenticated } = useClientAuth() as any;

    const [items, setItems] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const [coaPreviewOpen, setCoaPreviewOpen] = useState(false);
    const [coaPreviewSampleId, setCoaPreviewSampleId] = useState<number | null>(null);

    const openCoaPreview = useCallback((sampleId: number) => {
        setCoaPreviewSampleId(sampleId);
        setCoaPreviewOpen(true);
    }, []);

    const load = useCallback(async () => {
        try {
            setErrorKey(null);
            setLoading(true);

            const response = await apiGet<any>("/v1/client/samples", {
                params: { page: 1, per_page: 200 },
            });

            const paginated = unwrapClientSamples(response);
            setItems(paginated.data ?? []);
        } catch {
            setItems([]);
            setErrorKey("dashboard.client.errors.loadFailed");
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

    const requestNoBySampleId = useMemo(() => buildClientRequestNumberMap(items), [items]);

    const stats = useMemo(() => {
        const total = items.length;

        const byStatus = items.reduce<Record<string, number>>((acc, item) => {
            const key = String((item as any).request_status ?? "unknown").toLowerCase();
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});

        const drafts = byStatus["draft"] ?? 0;
        const submitted = byStatus["submitted"] ?? 0;
        const needsAction = (byStatus["returned"] ?? 0) + (byStatus["needs_revision"] ?? 0);
        const coaAvailable = items.filter((item: any) => !!item?.coa_released_to_client_at).length;

        return { total, drafts, submitted, needsAction, coaAvailable };
    }, [items]);

    const recent = useMemo(() => {
        return [...items]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 5);
    }, [items]);

    const header = getDashboardHeading(t, locale, "client", client?.name);

    const actions: DashboardAction[] = [
        {
            key: "createRequest",
            label: t("dashboard.client.actions.createRequest", {
                defaultValue: localizedValue(locale, {
                    en: "New request",
                    id: "Permintaan baru",
                }),
            }),
            icon: <FilePlus2 size={16} />,
            onClick: () => navigate("/portal/requests", { state: { openCreate: true } }),
            variant: "primary",
        },
    ];

    const statItems: DashboardStatItem[] = [
        {
            key: "total",
            title: t("dashboard.client.stats.total.title", {
                defaultValue: localizedValue(locale, {
                    en: "Total requests",
                    id: "Total permintaan",
                }),
            }),
            value: stats.total,
            subtitle: t("dashboard.client.stats.total.sub", {
                defaultValue: localizedValue(locale, {
                    en: "All requests you have created.",
                    id: "Semua permintaan yang Anda buat.",
                }),
            }),
            icon: <List size={18} />,
            loading,
        },
        {
            key: "drafts",
            title: t("dashboard.client.stats.drafts.title", {
                defaultValue: localizedValue(locale, {
                    en: "Draft",
                    id: "Draf",
                }),
            }),
            value: stats.drafts,
            subtitle: t("dashboard.client.stats.drafts.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Requests you can still edit.",
                    id: "Permintaan yang masih bisa Anda edit.",
                }),
            }),
            icon: <FilePlus2 size={18} />,
            loading,
        },
        {
            key: "submitted",
            title: t("dashboard.client.stats.submitted.title", {
                defaultValue: localizedValue(locale, {
                    en: "Submitted",
                    id: "Terkirim",
                }),
            }),
            value: stats.submitted,
            subtitle: t("dashboard.client.stats.submitted.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Waiting for admin review.",
                    id: "Menunggu review admin.",
                }),
            }),
            icon: <Clock size={18} />,
            loading,
        },
        {
            key: "needsAction",
            title: t("dashboard.client.stats.needsAction.title", {
                defaultValue: localizedValue(locale, {
                    en: "Needs action",
                    id: "Perlu tindakan",
                }),
            }),
            value: stats.needsAction,
            subtitle: t("dashboard.client.stats.needsAction.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Returned for revision.",
                    id: "Dikembalikan untuk revisi.",
                }),
            }),
            icon: <AlertTriangle size={18} />,
            loading,
        },
    ];

    const errorMessage = errorKey
        ? t(errorKey, {
            defaultValue: localizedValue(locale, {
                en: "We could not load your requests. Please try again.",
                id: "Kami tidak bisa memuat permintaan Anda. Silakan coba lagi.",
            }),
        })
        : "";

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
                icon={<Clock size={18} />}
                title={t("dashboard.client.hero.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Workflow at a glance",
                        id: "Ringkasan alur",
                    }),
                })}
                body={t("dashboard.client.hero.body", {
                    defaultValue: localizedValue(locale, {
                        en: "Draft → Submitted → Admin review → Delivery → Physically received.",
                        id: "Draf → Terkirim → Review admin → Pengantaran → Diterima fisik.",
                    }),
                })}
            />

            <DashboardStatGrid items={statItems} />

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                <div className="xl:col-span-1">
                    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-xs text-gray-500">
                                    {t("dashboard.client.stats.coaAvailable.title", {
                                        defaultValue: localizedValue(locale, {
                                            en: "COA available",
                                            id: "COA tersedia",
                                        }),
                                    })}
                                </div>
                                <div className="mt-1 text-2xl font-semibold text-gray-900">
                                    {loading ? <span className="text-gray-400">—</span> : stats.coaAvailable}
                                </div>
                                <div className="mt-2 text-xs text-gray-500">
                                    {t("dashboard.client.stats.coaAvailable.sub", {
                                        defaultValue: localizedValue(locale, {
                                            en: "COAs that are ready to preview or download.",
                                            id: "COA yang sudah siap dipratinjau atau diunduh.",
                                        }),
                                    })}
                                </div>
                            </div>

                            <div className="shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                                <Download size={18} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
                    title={t("dashboard.client.recent.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent requests",
                            id: "Permintaan terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.client.recent.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Jump back into what you worked on recently.",
                            id: "Lanjutkan dari yang terakhir Anda kerjakan.",
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
                            title={t("dashboard.client.recent.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No requests yet",
                                    id: "Belum ada permintaan",
                                }),
                            })}
                            body={t("dashboard.client.recent.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "Create your first request to start the workflow.",
                                    id: "Buat permintaan pertama untuk memulai alur kerja.",
                                }),
                            })}
                            action={{
                                label: t("dashboard.client.actions.createRequest", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Create request",
                                        id: "Buat permintaan",
                                    }),
                                }),
                                icon: <FilePlus2 size={16} />,
                                onClick: () => navigate("/portal/requests", { state: { openCreate: true } }),
                                variant: "primary",
                            }}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recent.map((item: any, index: number) => {
                                const sampleId = getSampleId(item);
                                const requestNo = sampleId ? requestNoBySampleId.get(sampleId) : null;
                                const chip = getStatusChip(item.request_status ?? null, locale);
                                const updatedAt = formatDashboardDateTime(item.updated_at ?? item.created_at, locale);
                                const coaSampleId = Number(item?.sample_id ?? sampleId);

                                return (
                                    <li
                                        key={String(sampleId ?? index)}
                                        className="flex items-center justify-between gap-3 py-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <div className="font-medium text-gray-900">
                                                    {t("portal.requestDetail.title", {
                                                        defaultValue: localizedValue(locale, {
                                                            en: "Request #{{id}}",
                                                            id: "Permintaan #{{id}}",
                                                        }),
                                                        id: requestNo ?? "—",
                                                    })}
                                                </div>
                                                <span className={chip.cls}>{chip.label}</span>
                                            </div>
                                            <div className="mt-1 text-xs text-gray-500">
                                                {t("dashboard.client.recent.updated", {
                                                    defaultValue: localizedValue(locale, {
                                                        en: "Updated",
                                                        id: "Diperbarui",
                                                    }),
                                                })}
                                                : {updatedAt}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {item?.coa_released_to_client_at && Number.isFinite(coaSampleId) ? (
                                                <button
                                                    type="button"
                                                    className="lims-icon-button"
                                                    onClick={() => openCoaPreview(coaSampleId)}
                                                    aria-label={t("portal.actions.downloadCoa", {
                                                        defaultValue: localizedValue(locale, {
                                                            en: "Download COA",
                                                            id: "Unduh COA",
                                                        }),
                                                    })}
                                                    title={t("portal.actions.downloadCoa", {
                                                        defaultValue: localizedValue(locale, {
                                                            en: "Download COA",
                                                            id: "Unduh COA",
                                                        }),
                                                    })}
                                                >
                                                    <Download size={16} />
                                                </button>
                                            ) : null}

                                            <button
                                                type="button"
                                                className={cx("lims-icon-button", !sampleId && "cursor-not-allowed opacity-50")}
                                                onClick={() => sampleId && navigate(`/portal/requests/${sampleId}`)}
                                                disabled={!sampleId}
                                                aria-label={t("dashboard.client.recent.openAria", {
                                                    defaultValue: localizedValue(locale, {
                                                        en: "Open request",
                                                        id: "Buka permintaan",
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
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </DashboardPanel>

                <DashboardPanel
                    title={t("dashboard.client.tips.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Tips to avoid delays",
                            id: "Tips agar tidak terlambat",
                        }),
                    })}
                    subtitle={t("dashboard.client.tips.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Small habits that keep your request moving.",
                            id: "Kebiasaan kecil yang bikin proses lancar.",
                        }),
                    })}
                >
                    <div className="space-y-3 text-sm text-gray-700">
                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <CheckCircle2 size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">
                                {t("dashboard.client.tips.requiredFields", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Fill required fields before submitting.",
                                        id: "Isi kolom wajib sebelum mengirim.",
                                    }),
                                })}
                            </div>
                        </div>

                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <AlertTriangle size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">
                                {t("dashboard.client.tips.revise", {
                                    defaultValue: localizedValue(locale, {
                                        en: "If your request is returned, revise it and submit again.",
                                        id: "Jika permintaan dikembalikan, revisi lalu kirim lagi.",
                                    }),
                                })}
                            </div>
                        </div>

                        <div className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <Clock size={18} className="mt-0.5 text-gray-700" />
                            <div className="min-w-0">
                                {t("dashboard.client.tips.timezone", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Times shown here follow your local timezone.",
                                        id: "Waktu yang ditampilkan mengikuti zona waktu lokal Anda.",
                                    }),
                                })}
                            </div>
                        </div>
                    </div>
                </DashboardPanel>
            </div>

            <ClientCoaPreviewModal
                open={coaPreviewOpen}
                onClose={() => {
                    setCoaPreviewOpen(false);
                    setCoaPreviewSampleId(null);
                }}
                sampleId={coaPreviewSampleId}
                title={t("portal.coa.previewTitle", {
                    defaultValue: localizedValue(locale, {
                        en: "COA Preview",
                        id: "Pratinjau COA",
                    }),
                })}
            />
        </div>
    );
}