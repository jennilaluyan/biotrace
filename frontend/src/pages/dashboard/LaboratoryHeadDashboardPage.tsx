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
    UserCheck,
    Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getRoleLabelById, getUserRoleId } from "../../utils/roles";
import { staffApprovalsService, type PendingStaff } from "../../services/staffApprovals";
import { fetchSampleRequestsQueue, type SampleRequestQueueRow } from "../../services/sampleRequestQueue";
import { getReagentApproverInbox, type ApproverInboxRow } from "../../services/reagentRequests";
import { listLhInbox, type QualityCoverInboxItem } from "../../services/qualityCovers";
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
    for (let i = 0; i < 6; i += 1) {
        if (value && typeof value === "object" && "data" in value && (value as any).data != null) {
            value = (value as any).data;
            continue;
        }
        break;
    }
    return value;
}

function extractArray<T>(input: any): T[] {
    const value = unwrapApi(input);

    if (Array.isArray(value)) return value;

    if (value && typeof value === "object") {
        const candidates = [
            (value as any).data,
            (value as any).items,
            (value as any).rows,
            (value as any).results,
            (value as any).pendingStaffs,
            (value as any).pending_staffs,
            (value as any).pending,
        ];

        for (const candidate of candidates) {
            if (Array.isArray(candidate)) return candidate;
            if (candidate && typeof candidate === "object" && Array.isArray((candidate as any).data)) {
                return (candidate as any).data;
            }
        }
    }

    return [];
}

function normalizeQueueRows(rows: SampleRequestQueueRow[]) {
    return (rows ?? []).filter((row: any) => {
        const status = String(row?.request_status ?? "").toLowerCase();
        if (status === "draft") return false;
        return !row?.lab_sample_code;
    });
}

type QueueCard = {
    key: string;
    title: string;
    subtitle: string;
    count: number;
    icon: React.ReactNode;
    onClick: () => void;
    tone?: "neutral" | "warn" | "ok";
};

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

export default function LaboratoryHeadDashboardPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user, loading: authLoading, isAuthenticated } = useAuth();

    const roleId = getUserRoleId(user);
    const isLH = roleId === ROLE_ID.LAB_HEAD;
    const locale = i18n.language || "en";

    const [pendingStaffs, setPendingStaffs] = useState<PendingStaff[]>([]);
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
            const [staffsRes, queue, reagents, qc, allDocs, looRes] = await Promise.all([
                staffApprovalsService.fetchPendingStaffs(),
                fetchSampleRequestsQueue({ page: 1, per_page: 250, date: "30d" }),
                getReagentApproverInbox({ status: "submitted", page: 1, per_page: 200 }),
                listLhInbox({ page: 1, per_page: 200 }),
                listReportDocuments(),
                apiGet<any>("/v1/samples/requests", { params: { mode: "loo_candidates" } }),
            ]);

            setPendingStaffs(extractArray<PendingStaff>(staffsRes));
            setQueueRows(normalizeQueueRows(queue?.data ?? []));

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
            setPendingStaffs([]);
            setQueueRows([]);
            setReagentRows([]);
            setQcRows([]);
            setDocs([]);
            setLooCandidates([]);
            setErrorKey("dashboard.laboratoryHead.errors.loadFailed");
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

        if (!isLH) {
            navigate("/samples", { replace: true });
            return;
        }

        void load();
    }, [authLoading, isAuthenticated, isLH, navigate, load]);

    const queueCounts = useMemo(() => {
        const by = queueRows.reduce<Record<string, number>>((acc, row: any) => {
            const key = String(row?.request_status ?? "unknown").trim().toLowerCase();
            acc[key] = (acc[key] ?? 0) + 1;
            return acc;
        }, {});

        return {
            submitted: by["submitted"] ?? 0,
            awaitingVerification: by["awaiting_verification"] ?? 0,
            needsAttention:
                (by["returned"] ?? 0) +
                (by["needs_revision"] ?? 0) +
                (by["inspection_failed"] ?? 0) +
                (by["returned_to_admin"] ?? 0),
        };
    }, [queueRows]);

    const recentStaffs = useMemo(() => {
        return [...pendingStaffs]
            .sort((a: any, b: any) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
            .slice(0, 6);
    }, [pendingStaffs]);

    const recentQc = useMemo(() => {
        return [...qcRows]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.verified_at ?? a.updated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.verified_at ?? b.updated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 6);
    }, [qcRows]);

    const recentReagent = useMemo(() => {
        return [...reagentRows]
            .sort((a: any, b: any) => {
                const aTime = new Date(a.submitted_at ?? a.updated_at ?? a.created_at ?? 0).getTime();
                const bTime = new Date(b.submitted_at ?? b.updated_at ?? b.created_at ?? 0).getTime();
                return bTime - aTime;
            })
            .slice(0, 6);
    }, [reagentRows]);

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
    const staffPendingCount = pendingStaffs.length;
    const reagentPendingCount = reagentRows.length;
    const qcToValidateCount = qcRows.length;

    const stats: DashboardStatItem[] = [
        {
            key: "pendingStaff",
            title: t("dashboard.laboratoryHead.stats.pendingStaff.title", {
                defaultValue: localizedValue(locale, {
                    en: "Pending staff approvals",
                    id: "Persetujuan staf tertunda",
                }),
            }),
            value: staffPendingCount,
            subtitle: t("dashboard.laboratoryHead.stats.pendingStaff.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Waiting for your decision.",
                    id: "Menunggu keputusan Anda.",
                }),
            }),
            icon: <Users size={18} />,
            loading,
        },
        {
            key: "qcToValidate",
            title: t("dashboard.laboratoryHead.stats.qcToValidate.title", {
                defaultValue: localizedValue(locale, {
                    en: "QC to validate",
                    id: "QC untuk divalidasi",
                }),
            }),
            value: qcToValidateCount,
            subtitle: t("dashboard.laboratoryHead.stats.qcToValidate.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Verified by OM, waiting for LH validation.",
                    id: "Sudah diverifikasi OM, menunggu validasi LH.",
                }),
            }),
            icon: <ShieldCheck size={18} />,
            loading,
        },
        {
            key: "reagentPending",
            title: t("dashboard.laboratoryHead.stats.reagentPending.title", {
                defaultValue: localizedValue(locale, {
                    en: "Reagent approvals",
                    id: "Persetujuan reagen",
                }),
            }),
            value: reagentPendingCount,
            subtitle: t("dashboard.laboratoryHead.stats.reagentPending.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Submitted requests waiting approval.",
                    id: "Pengajuan menunggu approval.",
                }),
            }),
            icon: <Beaker size={18} />,
            loading,
        },
        {
            key: "docs7d",
            title: t("dashboard.laboratoryHead.stats.docs7d.title", {
                defaultValue: localizedValue(locale, {
                    en: "Documents (7d)",
                    id: "Dokumen (7h)",
                }),
            }),
            value: docs.filter((doc) => withinLastDays(doc.generated_at ?? doc.created_at ?? null, 7)).length,
            subtitle: t("dashboard.laboratoryHead.stats.docs7d.sub", {
                defaultValue: localizedValue(locale, {
                    en: "Generated in the last 7 days.",
                    id: "Terbit dalam 7 hari terakhir.",
                }),
            }),
            icon: <BarChart3 size={18} />,
            loading,
        },
    ];

    const quickLinks: DashboardQuickLinkItem[] = [
        {
            key: "staffApprovals",
            title: t("dashboard.laboratoryHead.queue.staffApprovals.title", {
                defaultValue: localizedValue(locale, {
                    en: "Staff approvals",
                    id: "Persetujuan staf",
                }),
            }),
            subtitle: t("dashboard.laboratoryHead.queue.staffApprovals.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Pending registrations.",
                    id: "Pendaftaran menunggu persetujuan.",
                }),
            }),
            count: staffPendingCount,
            icon: <Users size={18} />,
            onClick: () => navigate("/staff/approvals"),
            tone: staffPendingCount > 0 ? "warn" : "neutral",
        },
        {
            key: "qualityCovers",
            title: t("dashboard.laboratoryHead.queue.qualityCovers.title", {
                defaultValue: localizedValue(locale, {
                    en: "Quality Cover validation",
                    id: "Validasi Quality Cover",
                }),
            }),
            subtitle: t("dashboard.laboratoryHead.queue.qualityCovers.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Validate verified QC.",
                    id: "Validasi QC yang sudah diverifikasi.",
                }),
            }),
            count: qcToValidateCount,
            icon: <ShieldCheck size={18} />,
            onClick: () => navigate("/quality-covers/inbox/lh"),
            tone: qcToValidateCount > 0 ? "warn" : "neutral",
        },
        {
            key: "reagentApprovals",
            title: t("dashboard.laboratoryHead.queue.reagentApprovals.title", {
                defaultValue: localizedValue(locale, {
                    en: "Reagent approvals",
                    id: "Persetujuan reagen",
                }),
            }),
            subtitle: t("dashboard.laboratoryHead.queue.reagentApprovals.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Approve or reject requests.",
                    id: "Approve atau reject pengajuan.",
                }),
            }),
            count: reagentPendingCount,
            icon: <Beaker size={18} />,
            onClick: () => navigate("/reagents/approvals"),
            tone: reagentPendingCount > 0 ? "warn" : "neutral",
        },
        {
            key: "looWorkspace",
            title: t("dashboard.laboratoryHead.queue.looWorkspace.title", {
                defaultValue: localizedValue(locale, {
                    en: "LOO workspace",
                    id: "Ruang LOO",
                }),
            }),
            subtitle: t("dashboard.laboratoryHead.queue.looWorkspace.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Review approvals and generate LOO.",
                    id: "Review approval dan generate LOO.",
                }),
            }),
            count: looCount,
            icon: <FileText size={18} />,
            onClick: () => navigate("/loo"),
            tone: looCount > 0 ? "warn" : "neutral",
        },
        {
            key: "awaitingVerification",
            title: t("dashboard.laboratoryHead.queue.awaitingVerification.title", {
                defaultValue: localizedValue(locale, {
                    en: "Requests awaiting verification",
                    id: "Permintaan menunggu verifikasi",
                }),
            }),
            subtitle: t("dashboard.laboratoryHead.queue.awaitingVerification.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Monitor the request queue.",
                    id: "Pantau antrian permintaan.",
                }),
            }),
            count: queueCounts.awaitingVerification,
            icon: <Inbox size={18} />,
            onClick: () => navigate("/samples/requests?request_status=awaiting_verification"),
            tone: queueCounts.awaitingVerification > 0 ? "warn" : "neutral",
        },
        {
            key: "needsAttention",
            title: t("dashboard.laboratoryHead.queue.needsAttention.title", {
                defaultValue: localizedValue(locale, {
                    en: "Needs attention",
                    id: "Perlu perhatian",
                }),
            }),
            subtitle: t("dashboard.laboratoryHead.queue.needsAttention.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "Returned, revision, or failed inspection items.",
                    id: "Returned, revisi, atau gagal inspeksi.",
                }),
            }),
            count: queueCounts.needsAttention,
            icon: <AlertTriangle size={18} />,
            onClick: () => navigate("/samples/requests?request_status=returned"),
            tone: queueCounts.needsAttention > 0 ? "warn" : "neutral",
        },
        {
            key: "reports",
            title: t("dashboard.laboratoryHead.queue.reports.title", {
                defaultValue: localizedValue(locale, {
                    en: "Reports",
                    id: "Laporan",
                }),
            }),
            subtitle: t("dashboard.laboratoryHead.queue.reports.subtitle", {
                defaultValue: localizedValue(locale, {
                    en: "All generated documents.",
                    id: "Semua dokumen yang dihasilkan.",
                }),
            }),
            count: docs.length,
            icon: <BarChart3 size={18} />,
            onClick: () => navigate("/reports"),
        },
    ];

    const actions: DashboardAction[] = [
        {
            key: "openStaffApprovals",
            label: t("dashboard.laboratoryHead.actions.openStaffApprovals", {
                defaultValue: localizedValue(locale, {
                    en: "Staff approvals",
                    id: "Persetujuan staf",
                }),
            }),
            icon: <Users size={16} />,
            onClick: () => navigate("/staff/approvals"),
            variant: "outline",
        },
        {
            key: "openQualityCovers",
            label: t("dashboard.laboratoryHead.actions.openQualityCovers", {
                defaultValue: localizedValue(locale, {
                    en: "Quality Covers",
                    id: "Quality Cover",
                }),
            }),
            icon: <ShieldCheck size={16} />,
            onClick: () => navigate("/quality-covers/inbox/lh"),
            variant: "outline",
        },
        {
            key: "openLoo",
            label: t("dashboard.laboratoryHead.actions.openLoo", {
                defaultValue: localizedValue(locale, {
                    en: "LOO workspace",
                    id: "Ruang LOO",
                }),
            }),
            icon: <FileText size={16} />,
            onClick: () => navigate("/loo"),
            variant: "primary",
        },
    ];

    const header = getDashboardHeading(t, locale, "laboratoryHead", user?.name);
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
                title={t("dashboard.laboratoryHead.hero.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Quality and approvals",
                        id: "Mutu dan persetujuan",
                    }),
                })}
                body={t("dashboard.laboratoryHead.hero.body", {
                    defaultValue: localizedValue(locale, {
                        en: "Monitor pending approvals and validate Quality Covers efficiently.",
                        id: "Pantau persetujuan yang tertunda dan lakukan validasi Quality Cover dengan cepat.",
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
                    title={t("dashboard.laboratoryHead.workQueue.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Work queue",
                            id: "Antrian kerja",
                        }),
                    })}
                    subtitle={t("dashboard.laboratoryHead.workQueue.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Jump to the most important work items.",
                            id: "Akses cepat ke tugas terpenting.",
                        }),
                    })}
                >
                    <DashboardQuickLinks items={quickLinks} loading={loading} />
                </DashboardPanel>

                <DashboardPanel
                    title={t("dashboard.laboratoryHead.recentStaff.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent staff requests",
                            id: "Permintaan staf terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.laboratoryHead.recentStaff.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Latest pending staff registrations.",
                            id: "Pendaftaran staf terbaru yang masih pending.",
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
                    ) : recentStaffs.length === 0 ? (
                        <DashboardEmptyState
                            title={t("dashboard.laboratoryHead.recentStaff.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No pending staff approvals",
                                    id: "Tidak ada persetujuan staf",
                                }),
                            })}
                            body={t("dashboard.laboratoryHead.recentStaff.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "You are all caught up.",
                                    id: "Sudah aman, tidak ada yang tertunda.",
                                }),
                            })}
                            action={{
                                label: t("dashboard.laboratoryHead.actions.openStaffApprovals", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Staff approvals",
                                        id: "Persetujuan staf",
                                    }),
                                }),
                                icon: <UserCheck size={16} />,
                                onClick: () => navigate("/staff/approvals"),
                                variant: "outline",
                            }}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recentStaffs.map((staff: any, index: number) => {
                                const when = formatDashboardDateTime(staff.created_at ?? null, locale);
                                const roleName = staff.role?.name || getRoleLabelById(staff.role_id) || String(staff.role_id ?? "—");

                                return (
                                    <li key={`${staff.staff_id}-${index}`} className="flex items-center justify-between gap-3 py-3">
                                        <div className="min-w-0">
                                            <div className="truncate font-medium text-gray-900">{staff.name ?? "—"}</div>
                                            <div className="mt-1 truncate text-xs text-gray-500">
                                                {roleName} • {when}
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className="lims-icon-button"
                                            onClick={() => navigate("/staff/approvals")}
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
                    title={t("dashboard.laboratoryHead.recentQc.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent Quality Covers",
                            id: "Quality Cover terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.laboratoryHead.recentQc.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Latest items waiting validation.",
                            id: "Item terbaru yang menunggu validasi.",
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
                            title={t("dashboard.laboratoryHead.recentQc.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No Quality Covers to validate",
                                    id: "Tidak ada QC untuk divalidasi",
                                }),
                            })}
                            body={t("dashboard.laboratoryHead.recentQc.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "Nothing is waiting for LH validation.",
                                    id: "Tidak ada item yang menunggu validasi LH.",
                                }),
                            })}
                            action={{
                                label: t("dashboard.laboratoryHead.actions.openQualityCovers", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Quality Covers",
                                        id: "Quality Cover",
                                    }),
                                }),
                                icon: <ShieldCheck size={16} />,
                                onClick: () => navigate("/quality-covers/inbox/lh"),
                                variant: "outline",
                            }}
                        />
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {recentQc.map((qc: any, index: number) => {
                                const qcId = Number(qc.quality_cover_id ?? 0);
                                const sampleCode = qc.sample?.lab_sample_code ?? `#${qc.sample_id ?? "—"}`;
                                const when = formatDashboardDateTime(
                                    qc.verified_at ?? qc.updated_at ?? qc.created_at ?? null,
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
                                                navigate("/quality-covers/inbox/lh", {
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
                    title={t("dashboard.laboratoryHead.recentReagent.title", {
                        defaultValue: localizedValue(locale, {
                            en: "Recent reagent approvals",
                            id: "Persetujuan reagen terbaru",
                        }),
                    })}
                    subtitle={t("dashboard.laboratoryHead.recentReagent.subtitle", {
                        defaultValue: localizedValue(locale, {
                            en: "Latest submitted requests.",
                            id: "Pengajuan terbaru berstatus submitted.",
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
                            title={t("dashboard.laboratoryHead.recentReagent.emptyTitle", {
                                defaultValue: localizedValue(locale, {
                                    en: "No submitted reagent requests",
                                    id: "Tidak ada pengajuan reagen submitted",
                                }),
                            })}
                            body={t("dashboard.laboratoryHead.recentReagent.emptyBody", {
                                defaultValue: localizedValue(locale, {
                                    en: "No pending approvals found.",
                                    id: "Tidak ada approval yang tertunda.",
                                }),
                            })}
                            action={{
                                label: t("dashboard.laboratoryHead.actions.openReagentApprovals", {
                                    defaultValue: localizedValue(locale, {
                                        en: "Reagent approvals",
                                        id: "Persetujuan reagen",
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

            <DashboardPanel
                className="mt-4"
                title={t("dashboard.laboratoryHead.recentDocs.title", {
                    defaultValue: localizedValue(locale, {
                        en: "Recent documents",
                        id: "Dokumen terbaru",
                    }),
                })}
                subtitle={t("dashboard.laboratoryHead.recentDocs.subtitle", {
                    defaultValue: localizedValue(locale, {
                        en: "Latest generated PDFs.",
                        id: "PDF yang paling baru dihasilkan.",
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
                        title={t("dashboard.laboratoryHead.recentDocs.emptyTitle", {
                            defaultValue: localizedValue(locale, {
                                en: "No documents yet",
                                id: "Belum ada dokumen",
                            }),
                        })}
                        body={t("dashboard.laboratoryHead.recentDocs.emptyBody", {
                            defaultValue: localizedValue(locale, {
                                en: "Generated documents will appear here.",
                                id: "Dokumen yang dihasilkan akan muncul di sini.",
                            }),
                        })}
                        action={{
                            label: t("dashboard.laboratoryHead.actions.openReports", {
                                defaultValue: localizedValue(locale, {
                                    en: "Reports",
                                    id: "Laporan",
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
    );
}