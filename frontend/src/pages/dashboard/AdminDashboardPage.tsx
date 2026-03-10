import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Clock,
    FileText,
    Inbox,
    Shield,
    Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";
import { clientApprovalsService, type ClientApplication } from "../../services/clientApprovals";
import { fetchSampleRequestsQueue, type SampleRequestQueueRow } from "../../services/sampleRequestQueue";
import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";
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
    withinLastDays,
    type DashboardAction,
    type DashboardQuickLinkItem,
    type DashboardStatItem,
    cx,
} from "./DashboardPage";

function getRequestId(row: any): number | null {
    const raw = row?.sample_id ?? row?.id ?? row?.request_id;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
}

export default function AdminDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isAdmin = roleId === ROLE_ID.ADMIN;
    const locale = i18n.language || "en";

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
            navigate("/samples", { replace: true });
            return;
        }

        void load();
    }, [authLoading, isAuthenticated, isAdmin, navigate, load]);

    const queueCounts = useMemo(() => {
        const by = queueRows.reduce<Record<string, number>>((acc, row: any) => {
            const key = String(row?.request_status ?? "unknown").trim().toLowerCase();
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});

        return {
            submitted: by["submitted"] ?? 0,
            readyForDelivery: by["ready_for_delivery"] ?? 0,
            physicallyReceived: by["physically_received"] ?? 0,
            needsAttention:
                (by["returned"] ?? 0) +
                (by["needs_revision"] ?? 0) +
                (by["inspection_failed"] ?? 0) +
                (by["returned_to_admin"] ?? 0),
        };
    }, [queueRows]);

    const recentDocs = useMemo(() => {
        return [...docs]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.generated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.generated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 6);
    }, [docs]);

    const recentRequests = useMemo(() => {
        return [...queueRows]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 6);
    }, [queueRows]);

    const stats: DashboardStatItem[] = useMemo(
        () => [
            {
                key: "pendingClients",
                title: t("dashboard.admin.stats.pendingClients.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Pending client approvals",
                        id: "Persetujuan klien tertunda",
                    }),
                }),
                value: pendingClients.length,
                subtitle: t("dashboard.admin.stats.pendingClients.sub", {
                    defaultValue: localizedValue(locale, {
                        en: "New client registrations waiting for your decision.",
                        id: "Pendaftaran klien baru yang menunggu keputusan admin.",
                    }),
                }),
                icon: <Users size={18} />,
                loading,
            },
            {
                key: "submitted",
                title: t("dashboard.admin.stats.submitted.title", {
                    defaultValue: localizedValue(locale, {
                        en: "New submissions",
                        id: "Request baru",
                    }),
                }),
                value: queueCounts.submitted,
                subtitle: t("dashboard.admin.stats.submitted.sub", {
                    defaultValue: localizedValue(locale, {
                        en: "Client requests submitted and ready to be reviewed.",
                        id: "Permintaan klien yang sudah dikirim dan siap ditinjau.",
                    }),
                }),
                icon: <Inbox size={18} />,
                loading,
            },
            {
                key: "needsAttention",
                title: t("dashboard.admin.stats.needsAttention.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Needs attention",
                        id: "Perlu perhatian",
                    }),
                }),
                value: queueCounts.needsAttention,
                subtitle: t("dashboard.admin.stats.needsAttention.sub", {
                    defaultValue: localizedValue(locale, {
                        en: "Returned or revision items that may block the workflow.",
                        id: "Item returned atau revisi yang bisa menghambat workflow.",
                    }),
                }),
                icon: <AlertTriangle size={18} />,
                loading,
            },
            {
                key: "docs7d",
                title: t("dashboard.admin.stats.docs7d.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Docs generated (7d)",
                        id: "Dokumen dibuat (7h)",
                    }),
                }),
                value: docs.filter((doc) => withinLastDays(doc.generated_at ?? doc.created_at ?? null, 7)).length,
                subtitle: t("dashboard.admin.stats.docs7d.sub", {
                    defaultValue: localizedValue(locale, {
                        en: "How many PDFs were generated in the last 7 days.",
                        id: "Jumlah PDF yang digenerate dalam 7 hari terakhir.",
                    }),
                }),
                icon: <FileText size={18} />,
                loading,
            },
        ],
        [docs, loading, locale, pendingClients.length, queueCounts.needsAttention, queueCounts.submitted, t]
    );

    const quickLinks: DashboardQuickLinkItem[] = useMemo(
        () => [
            {
                key: "clientApprovals",
                title: t("dashboard.admin.queue.clientApprovals.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Client Approvals",
                        id: "Persetujuan Klien",
                    }),
                }),
                subtitle: t("dashboard.admin.queue.clientApprovals.subtitle", {
                    defaultValue: localizedValue(locale, {
                        en: "Review pending registrations.",
                        id: "Tinjau pendaftaran yang menunggu.",
                    }),
                }),
                count: pendingClients.length,
                icon: <Users size={18} />,
                onClick: () => navigate("/clients/approvals"),
                tone: pendingClients.length > 0 ? "warn" : "neutral",
            },
            {
                key: "newSubmissions",
                title: t("dashboard.admin.queue.newSubmissions.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Request Queue",
                        id: "Antrian permintaan",
                    }),
                }),
                subtitle: t("dashboard.admin.queue.newSubmissions.subtitle", {
                    defaultValue: localizedValue(locale, {
                        en: "New submissions to be reviewed.",
                        id: "Submission baru untuk ditinjau.",
                    }),
                }),
                count: queueCounts.submitted,
                icon: <Inbox size={18} />,
                onClick: () => navigate("/samples/requests?request_status=submitted"),
                tone: queueCounts.submitted > 0 ? "warn" : "neutral",
            },
            {
                key: "readyForDelivery",
                title: t("dashboard.admin.queue.readyForDelivery.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Ready for delivery",
                        id: "Siap diantar",
                    }),
                }),
                subtitle: t("dashboard.admin.queue.readyForDelivery.subtitle", {
                    defaultValue: localizedValue(locale, {
                        en: "Requests that are ready to be delivered.",
                        id: "Request yang sudah siap untuk pengantaran.",
                    }),
                }),
                count: queueCounts.readyForDelivery,
                icon: <Clock size={18} />,
                onClick: () => navigate("/samples/requests?request_status=ready_for_delivery"),
            },
            {
                key: "physicallyReceived",
                title: t("dashboard.admin.queue.physicallyReceived.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Physically received",
                        id: "Diterima fisik",
                    }),
                }),
                subtitle: t("dashboard.admin.queue.physicallyReceived.subtitle", {
                    defaultValue: localizedValue(locale, {
                        en: "Requests already received at admin desk.",
                        id: "Request yang sudah diterima di meja admin.",
                    }),
                }),
                count: queueCounts.physicallyReceived,
                icon: <CheckCircle2 size={18} />,
                onClick: () => navigate("/samples/requests?request_status=physically_received"),
            },
            {
                key: "needsAttention",
                title: t("dashboard.admin.queue.needsAttention.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Needs attention",
                        id: "Perlu perhatian",
                    }),
                }),
                subtitle: t("dashboard.admin.queue.needsAttention.subtitle", {
                    defaultValue: localizedValue(locale, {
                        en: "Returned or revision items to unblock progress.",
                        id: "Item returned atau revisi untuk membuka hambatan.",
                    }),
                }),
                count: queueCounts.needsAttention,
                icon: <AlertTriangle size={18} />,
                onClick: () => navigate("/samples/requests?request_status=returned"),
                tone: queueCounts.needsAttention > 0 ? "warn" : "neutral",
            },
            {
                key: "documents",
                title: t("dashboard.admin.queue.documents.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Documents",
                        id: "Dokumen",
                    }),
                }),
                subtitle: t("dashboard.admin.queue.documents.subtitle", {
                    defaultValue: localizedValue(locale, {
                        en: "Browse generated PDFs.",
                        id: "Lihat PDF yang sudah digenerate.",
                    }),
                }),
                count: docs.length,
                icon: <FileText size={18} />,
                onClick: () => navigate("/reports"),
            },
        ],
        [
            docs.length,
            locale,
            navigate,
            pendingClients.length,
            queueCounts.needsAttention,
            queueCounts.physicallyReceived,
            queueCounts.readyForDelivery,
            queueCounts.submitted,
            t,
        ]
    );

    const actions: DashboardAction[] = [
        {
            key: "clientApprovals",
            label: t("dashboard.admin.actions.clientApprovals", {
                defaultValue: localizedValue(locale, {
                    en: "Client Approvals",
                    id: "Persetujuan Klien",
                }),
            }),
            icon: <Users size={16} />,
            onClick: () => navigate("/clients/approvals"),
            variant: "outline",
        },
        {
            key: "openQueue",
            label: t("dashboard.admin.actions.openQueue", {
                defaultValue: localizedValue(locale, {
                    en: "Open queue",
                    id: "Buka antrian",
                }),
            }),
            icon: <Inbox size={16} />,
            onClick: () => navigate("/samples/requests"),
            variant: "primary",
        },
    ];

    const header = getDashboardHeading(t, locale, "admin", user?.name);
    const errorMessage = errorKey
        ? t(errorKey, {
            defaultValue: localizedValue(locale, {
                en: "Failed to load dashboard data. Please try again.",
                id: "Gagal memuat data dashboard. Silakan coba lagi.",
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
                icon={<Shield size={18} />}
                title={t("dashboard.admin.hero.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Workflow overview",
                        id: "Ringkasan alur",
                    }),
                })}
                body={t("dashboard.admin.hero.body", {
                    defaultValue: localizedValue(locale, {
                        en: "Use Work Queue to jump to the next actionable step. Counts reflect the last 30 days for requests and recent generated documents.",
                        id: "Pakai Work Queue untuk lompat ke langkah yang bisa dikerjakan sekarang. Angka request dihitung dari 30 hari terakhir dan dokumen menampilkan hasil terbaru.",
                    }),
                })}
            />

            <DashboardStatGrid items={stats} />

            <DashboardErrorBanner
                message={errorMessage}
                onRetry={errorKey ? () => void load() : undefined}
                retryLabel={t("retry", {
                    defaultValue: localizedValue(locale, {
                        en: "Retry",
                        id: "Coba lagi",
                    }),
                })}
            />

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DashboardPanel
                    title={t("dashboard.admin.workQueue.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Work queue",
                            id: "Work queue",
                        }),
                    })}
                    subtitle={t("dashboard.admin.workQueue.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Actionable shortcuts based on current status.",
                            id: "Shortcut berdasarkan status yang bisa dieksekusi.",
                        }),
                    })}
                >
                    <DashboardQuickLinks items={quickLinks} loading={loading} />
                </DashboardPanel>

                <DashboardPanel
                    title={t("dashboard.admin.recentDocs.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent documents",
                            id: "Dokumen terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.admin.recentDocs.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Latest generated PDFs across the system.",
                            id: "PDF yang paling baru digenerate di sistem.",
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
                    ) : recentDocs.length === 0 ? (
                        <DashboardEmptyState
                            title={t("dashboard.admin.recentDocs.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No documents yet",
                                    id: "Belum ada dokumen",
                                }),
                            })}
                            body={t("dashboard.admin.recentDocs.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "Generated PDFs will appear here when available.",
                                    id: "PDF yang digenerate akan muncul di sini saat tersedia.",
                                }),
                            })}
                            action={{
                                label: t("dashboard.admin.actions.openReports", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Open reports",
                                        id: "Buka laporan",
                                    }),
                                }),
                                icon: <FileText size={16} />,
                                onClick: () => navigate("/reports"),
                                variant: "outline",
                            }}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recentDocs.map((doc, index) => {
                                const when = formatDashboardDateTime(
                                    doc.generated_at ?? doc.created_at ?? null,
                                    locale
                                );
                                const name =
                                    doc.document_name ||
                                    doc.document_code ||
                                    (doc.type
                                        ? String(doc.type)
                                        : localizedValue(locale, {
                                            en: "Document",
                                            id: "Dokumen",
                                        }));
                                const code = doc.number || doc.document_code || "—";
                                const href = doc.download_url || doc.file_url || null;

                                return (
                                    <li
                                        key={`${doc.type}-${doc.id}-${index}`}
                                        className="flex items-center justify-between gap-3 py-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-gray-900">{name}</div>
                                            <div className="mt-1 text-xs text-gray-500">
                                                {code} • {when}
                                            </div>
                                        </div>

                                        {href ? (
                                            <a
                                                className="lims-icon-button"
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
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
                                            </a>
                                        ) : (
                                            <button
                                                type="button"
                                                className="lims-icon-button cursor-not-allowed opacity-50"
                                                disabled
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
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </DashboardPanel>
            </div>

            <DashboardPanel
                className="mt-4"
                title={t("dashboard.admin.recentRequests.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Recent requests",
                        id: "Request terbaru",
                    }),
                })}
                subtitle={t("dashboard.admin.recentRequests.subtitle", {
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
                ) : recentRequests.length === 0 ? (
                    <DashboardEmptyState
                        title={t("dashboard.admin.recentRequests.emptyTitle", {
                            defaultValue: localizedValue(locale, {
                                en: "No requests yet",
                                id: "Belum ada request",
                            }),
                        })}
                        body={t("dashboard.admin.recentRequests.emptyBody", {
                            defaultValue: localizedValue(locale, {
                                en: "New client submissions will appear here after they submit a request.",
                                id: "Submission klien akan muncul di sini setelah mereka mengirim request.",
                            }),
                        })}
                        action={{
                            label: t("dashboard.admin.actions.openQueue", {
                                defaultValue: localizedValue(locale, {
                                    en: "Open queue",
                                    id: "Buka antrian",
                                }),
                            }),
                            icon: <Inbox size={16} />,
                            onClick: () => navigate("/samples/requests"),
                            variant: "outline",
                        }}
                    />
                ) : (
                    <ul className="divide-y divide-gray-100">
                        {recentRequests.map((row: any, index) => {
                            const requestId = getRequestId(row);
                            const when = formatDashboardDateTime(
                                row.updated_at ?? row.created_at ?? null,
                                locale
                            );
                            const status = String(row.request_status ?? "—");
                            const client = row.client_name ?? row.client_email ?? "—";

                            return (
                                <li
                                    key={String(requestId ?? index)}
                                    className="flex items-center justify-between gap-3 py-3"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <div className="font-medium text-gray-900">
                                                {t("dashboard.admin.recentRequests.requestLabel", {
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
                                            {t("dashboard.admin.recentRequests.updatedAt", {
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
    );
}