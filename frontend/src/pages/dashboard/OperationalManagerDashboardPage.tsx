import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Beaker,
    FileText,
    Inbox,
    Shield,
    ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { getUserRoleId, ROLE_ID } from "../../utils/roles";
import { fetchSampleRequestsQueue, type SampleRequestQueueRow } from "../../services/sampleRequestQueue";
import { getReagentApproverInbox, type ApproverInboxRow } from "../../services/reagentRequests";
import { listOmInbox, type QualityCoverInboxItem } from "../../services/qualityCovers";
import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";
import { apiGet } from "../../services/api";
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

function unwrapApi(res: any) {
    let value = res?.data ?? res;
    for (let i = 0; i < 5; i += 1) {
        if (value && typeof value === "object" && "data" in value && (value as any).data != null) {
            value = (value as any).data;
            continue;
        }
        break;
    }
    return value;
}

type LooCandidate = {
    sample_id: number;
    lab_sample_code?: string | null;
    sample_type?: string | null;
    client?: { name?: string | null; organization?: string | null } | null;
    verified_at?: string | null;
    received_at?: string | null;
    physically_received_at?: string | null;
    admin_received_from_client_at?: string | null;
};

export default function OperationalManagerDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isOM = roleId === ROLE_ID.OPERATIONAL_MANAGER;
    const locale = i18n.language || "en";

    const [queueRows, setQueueRows] = useState<SampleRequestQueueRow[]>([]);
    const [reagentRows, setReagentRows] = useState<ApproverInboxRow[]>([]);
    const [qcRows, setQcRows] = useState<QualityCoverInboxItem[]>([]);
    const [docs, setDocs] = useState<ReportDocumentRow[]>([]);
    const [looCandidates, setLooCandidates] = useState<LooCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorKey, setErrorKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrorKey(null);

        try {
            const [queue, reagents, qc, allDocs, looRes] = await Promise.all([
                fetchSampleRequestsQueue({ page: 1, per_page: 250, date: "30d" }),
                getReagentApproverInbox({ status: "submitted", page: 1, per_page: 200 }),
                listOmInbox({ page: 1, per_page: 200 }),
                listReportDocuments(),
                apiGet<any>("/v1/samples/requests", { params: { mode: "loo_candidates" } }),
            ]);

            setQueueRows(queue?.data ?? []);

            const reagentPayload = unwrapApi(reagents);
            const reagentData: ApproverInboxRow[] = Array.isArray(reagentPayload?.data)
                ? reagentPayload.data
                : Array.isArray(reagentPayload)
                    ? reagentPayload
                    : [];
            setReagentRows(reagentData);

            setQcRows(qc?.data ?? []);
            setDocs(allDocs ?? []);

            const looData = (looRes?.data?.data ?? looRes?.data ?? looRes) as any[];
            setLooCandidates(Array.isArray(looData) ? (looData as LooCandidate[]) : []);
        } catch {
            setQueueRows([]);
            setReagentRows([]);
            setQcRows([]);
            setDocs([]);
            setLooCandidates([]);
            setErrorKey("dashboard.operationalManager.errors.loadFailed");
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

        if (!isOM) {
            navigate("/samples", { replace: true });
            return;
        }

        void load();
    }, [authLoading, isAuthenticated, isOM, navigate, load]);

    const queueCounts = useMemo(() => {
        const by = queueRows.reduce<Record<string, number>>((acc, row: any) => {
            const key = String(row?.request_status ?? "unknown").trim().toLowerCase();
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});

        return {
            submitted: by["submitted"] ?? 0,
            physicallyReceived: by["physically_received"] ?? 0,
            needsAttention:
                (by["returned"] ?? 0) +
                (by["needs_revision"] ?? 0) +
                (by["inspection_failed"] ?? 0) +
                (by["returned_to_admin"] ?? 0),
        };
    }, [queueRows]);

    const recentReagent = useMemo(() => {
        return [...reagentRows]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.submitted_at ?? a.updated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.submitted_at ?? b.updated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 6);
    }, [reagentRows]);

    const recentQc = useMemo(() => {
        return [...qcRows]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.submitted_at ?? a.updated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.submitted_at ?? b.updated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 6);
    }, [qcRows]);

    const recentDocs = useMemo(() => {
        return [...docs]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.generated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.generated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 6);
    }, [docs]);

    const looCount = looCandidates.length;
    const reagentPendingCount = reagentRows.length;
    const qcToVerifyCount = qcRows.length;

    const stats: DashboardStatItem[] = [
        {
            key: "looCandidates",
            title: t("dashboard.operationalManager.stats.looCandidates.title", {
                defaultValue: localizedValue(locale, {
                    en: "LOO candidates",
                    id: "Kandidat LOO",
                }),
            }),
            value: looCount,
            subtitle: t("dashboard.operationalManager.stats.looCandidates.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Eligible samples listed in the LOO workspace.",
                    id: "Sampel eligible yang tampil di LOO workspace.",
                }),
            }),
            icon: <FileText size={18} />,
            loading,
        },
        {
            key: "reagentPending",
            title: t("dashboard.operationalManager.stats.reagentPending.title", {
                defaultValue: localizedValue(locale, {
                    en: "Reagent approvals (pending)",
                    id: "Approval reagen (pending)",
                }),
            }),
            value: reagentPendingCount,
            subtitle: t("dashboard.operationalManager.stats.reagentPending.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Submitted requests waiting for your decision.",
                    id: "Request submitted yang menunggu keputusan OM.",
                }),
            }),
            icon: <Beaker size={18} />,
            loading,
        },
        {
            key: "qcToVerify",
            title: t("dashboard.operationalManager.stats.qcToVerify.title", {
                defaultValue: localizedValue(locale, {
                    en: "Quality covers to verify",
                    id: "Quality cover untuk diverifikasi",
                }),
            }),
            value: qcToVerifyCount,
            subtitle: t("dashboard.operationalManager.stats.qcToVerify.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Submitted QC drafts awaiting OM verification.",
                    id: "Draft QC yang sudah disubmit dan menunggu verifikasi OM.",
                }),
            }),
            icon: <ShieldCheck size={18} />,
            loading,
        },
        {
            key: "docs7d",
            title: t("dashboard.operationalManager.stats.docs7d.title", {
                defaultValue: localizedValue(locale, {
                    en: "Docs generated (7d)",
                    id: "Dokumen dibuat (7h)",
                }),
            }),
            value: docs.filter((doc) => withinLastDays(doc.generated_at ?? doc.created_at ?? null, 7)).length,
            subtitle: t("dashboard.operationalManager.stats.docs7d.sub", {
                defaultValue: localizedValue(locale, {
                    en: "How many PDFs were generated in the last 7 days.",
                    id: "Jumlah PDF yang digenerate dalam 7 hari terakhir.",
                }),
            }),
            icon: <BarChart3 size={18} />,
            loading,
        },
    ];

    const quickLinks: DashboardQuickLinkItem[] = [
        {
            key: "requestSubmissions",
            title: t("dashboard.operationalManager.queue.requestSubmissions.title", {
                defaultValue: localizedValue(locale, {
                    en: "Request submissions",
                    id: "Submission request",
                }),
            }),
            subtitle: t("dashboard.operationalManager.queue.requestSubmissions.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "New submissions in the queue.",
                    id: "Submission baru di antrian.",
                }),
            }),
            count: queueCounts.submitted,
            icon: <Inbox size={18} />,
            onClick: () => navigate("/samples/requests?request_status=submitted"),
            tone: queueCounts.submitted > 0 ? "warn" : "neutral",
        },
        {
            key: "looWorkspace",
            title: t("dashboard.operationalManager.queue.looWorkspace.title", {
                defaultValue: localizedValue(locale, {
                    en: "LOO workspace",
                    id: "LOO workspace",
                }),
            }),
            subtitle: t("dashboard.operationalManager.queue.looWorkspace.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Approve and generate Letters of Order.",
                    id: "Approval dan generate Letter of Order.",
                }),
            }),
            count: looCount,
            icon: <FileText size={18} />,
            onClick: () => navigate("/loo"),
            tone: looCount > 0 ? "warn" : "neutral",
        },
        {
            key: "reagentApprovals",
            title: t("dashboard.operationalManager.queue.reagentApprovals.title", {
                defaultValue: localizedValue(locale, {
                    en: "Reagent approvals",
                    id: "Approval reagen",
                }),
            }),
            subtitle: t("dashboard.operationalManager.queue.reagentApprovals.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Approve or reject submitted reagent requests.",
                    id: "Approve atau reject request reagen yang submitted.",
                }),
            }),
            count: reagentPendingCount,
            icon: <Beaker size={18} />,
            onClick: () => navigate("/reagents/approvals"),
            tone: reagentPendingCount > 0 ? "warn" : "neutral",
        },
        {
            key: "qualityCovers",
            title: t("dashboard.operationalManager.queue.qualityCovers.title", {
                defaultValue: localizedValue(locale, {
                    en: "Quality covers",
                    id: "Quality cover",
                }),
            }),
            subtitle: t("dashboard.operationalManager.queue.qualityCovers.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Verify submitted quality covers.",
                    id: "Verifikasi quality cover yang sudah disubmit.",
                }),
            }),
            count: qcToVerifyCount,
            icon: <ShieldCheck size={18} />,
            onClick: () => navigate("/quality-covers/inbox/om"),
            tone: qcToVerifyCount > 0 ? "warn" : "neutral",
        },
        {
            key: "needsAttention",
            title: t("dashboard.operationalManager.queue.needsAttention.title", {
                defaultValue: localizedValue(locale, {
                    en: "Needs attention",
                    id: "Perlu perhatian",
                }),
            }),
            subtitle: t("dashboard.operationalManager.queue.needsAttention.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Returned or revision items blocking progress.",
                    id: "Item returned atau revisi yang menghambat workflow.",
                }),
            }),
            count: queueCounts.needsAttention,
            icon: <AlertTriangle size={18} />,
            onClick: () => navigate("/samples/requests?request_status=returned"),
            tone: queueCounts.needsAttention > 0 ? "warn" : "neutral",
        },
        {
            key: "reports",
            title: t("dashboard.operationalManager.queue.reports.title", {
                defaultValue: localizedValue(locale, {
                    en: "Reports",
                    id: "Laporan",
                }),
            }),
            subtitle: t("dashboard.operationalManager.queue.reports.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Browse generated PDFs.",
                    id: "Lihat PDF yang sudah digenerate.",
                }),
            }),
            count: docs.length,
            icon: <BarChart3 size={18} />,
            onClick: () => navigate("/reports"),
        },
    ];

    const actions: DashboardAction[] = [
        {
            key: "openReagentApprovals",
            label: t("dashboard.operationalManager.actions.openReagentApprovals", {
                defaultValue: localizedValue(locale, {
                    en: "Reagent approvals",
                    id: "Approval reagen",
                }),
            }),
            icon: <Beaker size={16} />,
            onClick: () => navigate("/reagents/approvals"),
            variant: "outline",
        },
        {
            key: "openQualityCovers",
            label: t("dashboard.operationalManager.actions.openQualityCovers", {
                defaultValue: localizedValue(locale, {
                    en: "Quality cover (verify)",
                    id: "Quality cover (verifikasi)",
                }),
            }),
            icon: <ShieldCheck size={16} />,
            onClick: () => navigate("/quality-covers/inbox/om"),
            variant: "outline",
        },
        {
            key: "openLoo",
            label: t("dashboard.operationalManager.actions.openLoo", {
                defaultValue: localizedValue(locale, {
                    en: "Open LOO workspace",
                    id: "Buka LOO workspace",
                }),
            }),
            icon: <FileText size={16} />,
            onClick: () => navigate("/loo"),
            variant: "primary",
        },
    ];

    const header = getDashboardHeading(t, locale, "operationalManager", user?.name);
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
                title={t("dashboard.operationalManager.hero.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Operations overview",
                        id: "Ringkasan operasional",
                    }),
                })}
                body={t("dashboard.operationalManager.hero.body", {
                    defaultValue: localizedValue(locale, {
                        en: "Focus on LOO approvals, reagent approvals, and Quality Cover verification. Queue counts reflect the last 30 days and recent generated documents.",
                        id: "Fokus pada approval LOO, approval reagen, dan verifikasi Quality Cover. Angka antrian dihitung dari 30 hari terakhir dan dokumen menampilkan hasil terbaru.",
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
                    title={t("dashboard.operationalManager.workQueue.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Work queue",
                            id: "Work queue",
                        }),
                    })}
                    subtitle={t("dashboard.operationalManager.workQueue.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Shortcuts based on what needs attention now.",
                            id: "Shortcut berdasarkan yang perlu ditangani sekarang.",
                        }),
                    })}
                >
                    <DashboardQuickLinks items={quickLinks} loading={loading} />
                </DashboardPanel>

                <DashboardPanel
                    title={t("dashboard.operationalManager.recentReagent.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent reagent approvals",
                            id: "Approval reagen terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.operationalManager.recentReagent.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Latest submitted requests waiting for approval.",
                            id: "Request submitted terbaru yang menunggu approval.",
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
                    ) : recentReagent.length === 0 ? (
                        <DashboardEmptyState
                            title={t("dashboard.operationalManager.recentReagent.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No pending approvals",
                                    id: "Belum ada approval pending",
                                }),
                            })}
                            body={t("dashboard.operationalManager.recentReagent.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "Submitted reagent requests will appear here.",
                                    id: "Request reagen yang disubmit akan muncul di sini.",
                                }),
                            })}
                            action={{
                                label: t("dashboard.operationalManager.actions.openReagentApprovals", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Reagent approvals",
                                        id: "Approval reagen",
                                    }),
                                }),
                                icon: <Beaker size={16} />,
                                onClick: () => navigate("/reagents/approvals"),
                                variant: "outline",
                            }}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recentReagent.map((row: any, index: number) => {
                                const loId = Number(row.lo_id ?? 0);
                                const when = formatDashboardDateTime(
                                    row.submitted_at ?? row.updated_at ?? row.created_at ?? null,
                                    locale
                                );
                                const loo = row.loo_number ?? (loId > 0 ? `LOO #${loId}` : "LOO");
                                const client = row.client_name ?? "—";

                                return (
                                    <li key={`${row.reagent_request_id}-${index}`} className="flex items-center justify-between gap-3 py-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-gray-900">{loo}</div>
                                            <div className="mt-1 truncate text-xs text-gray-500">
                                                {client} • {when}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className={cx("lims-icon-button", !(loId > 0) && "cursor-not-allowed opacity-50")}
                                            onClick={() => loId > 0 && navigate(`/reagents/approvals/loo/${loId}`)}
                                            disabled={!(loId > 0)}
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

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <DashboardPanel
                    title={t("dashboard.operationalManager.recentQc.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent quality covers",
                            id: "Quality cover terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.operationalManager.recentQc.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Latest submitted QC drafts waiting for verification.",
                            id: "Draft QC terbaru yang menunggu verifikasi.",
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
                    ) : recentQc.length === 0 ? (
                        <DashboardEmptyState
                            title={t("dashboard.operationalManager.recentQc.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No quality covers in inbox",
                                    id: "Belum ada quality cover di inbox",
                                }),
                            })}
                            body={t("dashboard.operationalManager.recentQc.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "Submitted quality covers will appear here.",
                                    id: "Quality cover yang disubmit akan muncul di sini.",
                                }),
                            })}
                            action={{
                                label: t("dashboard.operationalManager.actions.openQualityCovers", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Quality cover (verify)",
                                        id: "Quality cover (verifikasi)",
                                    }),
                                }),
                                icon: <ShieldCheck size={16} />,
                                onClick: () => navigate("/quality-covers/inbox/om"),
                                variant: "outline",
                            }}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recentQc.map((qc: any, index: number) => {
                                const qcId = Number(qc.quality_cover_id ?? 0);
                                const sampleCode = qc.sample?.lab_sample_code ?? `#${qc.sample_id ?? "—"}`;
                                const when = formatDashboardDateTime(
                                    qc.submitted_at ?? qc.updated_at ?? qc.created_at ?? null,
                                    locale
                                );

                                return (
                                    <li key={`${qcId}-${index}`} className="flex items-center justify-between gap-3 py-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-gray-900">{sampleCode}</div>
                                            <div className="mt-1 truncate text-xs text-gray-500">
                                                QC #{qcId} • {when}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className={cx("lims-icon-button", !(qcId > 0) && "cursor-not-allowed opacity-50")}
                                            onClick={() =>
                                                qcId > 0 &&
                                                navigate("/quality-covers/inbox/om", {
                                                    state: { preselectId: qcId },
                                                })
                                            }
                                            disabled={!(qcId > 0)}
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

                <DashboardPanel
                    title={t("dashboard.operationalManager.recentDocs.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent documents",
                            id: "Dokumen terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.operationalManager.recentDocs.subtitle", {
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
                            title={t("dashboard.operationalManager.recentDocs.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No documents yet",
                                    id: "Belum ada dokumen",
                                }),
                            })}
                            body={t("dashboard.operationalManager.recentDocs.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "Generated PDFs will appear here when available.",
                                    id: "PDF yang digenerate akan muncul di sini saat tersedia.",
                                }),
                            })}
                            action={{
                                label: t("dashboard.operationalManager.actions.openReports", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Open reports",
                                        id: "Buka laporan",
                                    }),
                                }),
                                icon: <BarChart3 size={16} />,
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
                                    <li key={`${doc.type}-${doc.id}-${index}`} className="flex items-center justify-between gap-3 py-3">
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
        </div>
    );
}