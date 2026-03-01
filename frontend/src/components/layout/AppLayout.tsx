import { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
    BarChart3,
    Beaker,
    ClipboardCheck,
    FileText,
    Files,
    Inbox,
    Shield,
    ShieldCheck,
    TestTube2,
    Users,
    ClipboardList
} from "lucide-react";

import BiotraceLogo from "../../assets/biotrace-logo.png";
import { useAuth } from "../../hooks/useAuth";
import { getUserRoleId, ROLE_ID } from "../../utils/roles";
import { Topbar } from "./Topbar";

type NavIcon =
    | "users"
    | "samples"
    | "inbox"
    | "approval"
    | "loo"
    | "reagents"
    | "qc"
    | "reports"
    | "audit"
    | "docs";

type NavItem = {
    label: string;
    path: string;
    icon?: NavIcon;
};

export const AppLayout = () => {
    const { t } = useTranslation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const { user } = useAuth();
    const roleId = getUserRoleId(user);

    const isClient = roleId === ROLE_ID.CLIENT;
    const isStaff = !!roleId && roleId !== ROLE_ID.CLIENT;

    const isAdmin = roleId === ROLE_ID.ADMIN;
    const isSampleCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const isOperationalManager = roleId === ROLE_ID.OPERATIONAL_MANAGER;
    const isLabHead = roleId === ROLE_ID.LAB_HEAD;

    const isOmOrLh = isOperationalManager || isLabHead;

    const canSeeAuditLogs =
        roleId === ROLE_ID.ADMIN ||
        roleId === ROLE_ID.SAMPLE_COLLECTOR ||
        roleId === ROLE_ID.ANALYST ||
        roleId === ROLE_ID.OPERATIONAL_MANAGER ||
        roleId === ROLE_ID.LAB_HEAD;

    const canSeeReports = isStaff;

    const portalItems: NavItem[] = isClient
        ? [{ label: t("nav.myRequests"), path: "/portal/requests", icon: "inbox" as const }]
        : [];

    const isAnalyst = roleId === ROLE_ID.ANALYST;

    const canSeeClients = isAdmin || isLabHead || isOperationalManager;

    const staffBaseItems: NavItem[] = isStaff
        ? [
            ...(canSeeClients ? [{ label: t("nav.clients"), path: "/clients", icon: "users" as const }] : []),
            { label: t("nav.samples"), path: "/samples", icon: "samples" as const },
            { label: t("nav.parameters"), path: "/parameters", icon: "samples" as const },
        ]
        : [];

    const staffDashboardItem: NavItem[] =
        isStaff && !isClient && !isAdmin && !isSampleCollector
            ? [{ label: t("nav.dashboard"), path: "/dashboard", icon: "reports" as const }]
            : [];

    const scOnlyItems: NavItem[] = isSampleCollector
        ? [
            { label: t("nav.dashboard"), path: "/dashboard", icon: "reports" as const },

            { label: t("nav.requestQueue"), path: "/samples/requests", icon: "inbox" as const },
            { label: t("nav.samples"), path: "/samples", icon: "samples" as const },
        ]
        : [];

    const omLhItems: NavItem[] = isOmOrLh
        ? [
            { label: t("nav.requestQueue"), path: "/samples/requests", icon: "inbox" as const },
            { label: t("nav.looWorkspace"), path: "/loo", icon: "loo" as const },
            { label: t("nav.reagentApprovals"), path: "/reagents/approvals", icon: "reagents" as const },

            ...(isOperationalManager
                ? [
                    {
                        label: t("nav.qualityCoverVerify"),
                        path: "/quality-covers/inbox/om",
                        icon: "qc" as const,
                    },
                ]
                : []),

            ...(isLabHead
                ? [
                    {
                        label: t("nav.qualityCoverValidate"),
                        path: "/quality-covers/inbox/lh",
                        icon: "qc" as const,
                    },
                ]
                : []),
        ]
        : [];

    const archiveItems: NavItem[] =
        isAdmin || isOperationalManager || isLabHead
            ? [{ label: t("nav.samplesArchive"), path: "/samples/archive", icon: "reports" as const }]
            : [];

    const adminItems: NavItem[] = isAdmin
        ? [
            { label: t("nav.dashboard"), path: "/dashboard", icon: "reports" as const },

            { label: t("nav.clientApprovals"), path: "/clients/approvals", icon: "approval" as const },
            { label: t("nav.requestQueue"), path: "/samples/requests", icon: "inbox" as const },
        ]
        : [];

    const labHeadItems: NavItem[] = isLabHead
        ? [{ label: t("nav.staffApprovals"), path: "/staff/approvals", icon: "approval" as const }]
        : [];

    const reportItems: NavItem[] = canSeeReports
        ? [{ label: t("nav.reports"), path: "/reports", icon: "reports" as const }]
        : [];

    const auditItems: NavItem[] = canSeeAuditLogs
        ? [{ label: t("nav.auditLogs"), path: "/audit-logs", icon: "audit" as const }]
        : [];

    const settingsItems: NavItem[] =
        isAdmin || isLabHead
            ? [{ label: t("nav.documentTemplates"), path: "/settings/docs/templates", icon: "docs" as const }]
            : [];

    const navItems: NavItem[] = (() => {
        if (isClient) return portalItems;

        // Sample Collector: (dashboard belum ada untuk SC saat ini)
        if (isSampleCollector) return [...scOnlyItems, ...auditItems];

        if (isStaff) {
            return [
                ...adminItems,
                ...staffDashboardItem,
                ...staffBaseItems,
                ...omLhItems,
                ...archiveItems,
                ...reportItems,
                ...auditItems,
                ...settingsItems,
                ...labHeadItems,
            ];
        }

        return [];
    })();

    const iconClass = "h-4 w-4";

    const renderIcon = (icon?: NavIcon) => {
        switch (icon) {
            case "users":
                return <Users className={iconClass} />;
            case "samples":
                return <TestTube2 className={iconClass} />;
            case "inbox":
                return <Inbox className={iconClass} />;
            case "approval":
                return <ClipboardCheck className={iconClass} />;
            case "loo":
                return <FileText className={iconClass} />;
            case "reagents":
                return <Beaker className={iconClass} />;
            case "qc":
                return <ShieldCheck className={iconClass} />;
            case "reports":
                return <BarChart3 className={iconClass} />;
            case "audit":
                return <Shield className={iconClass} />;
            case "docs":
                return <Files className={iconClass} />;
            default:
                return <Shield className={iconClass} />;
        }
    };

    const endPaths = useMemo(
        () =>
            new Set<string>([
                "/dashboard",
                "/samples",
                "/clients",
                "/portal",
                "/parameters",
                "/qa/parameters",
                "/qa/methods",
                "/qa/consumables-catalog",
                "/reports",
                "/audit-logs",
                "/clients/approvals",
                "/samples/requests",
                "/staff/approvals",
                "/portal/requests",
                "/loo",
                "/reagents/approvals",
                "/testing-board",
                "/quality-covers/inbox/om",
                "/quality-covers/inbox/lh",
                "/settings/docs/templates",
            ]),
        []
    );

    const renderNavItem = (item: NavItem, closeOnClick = false) => {
        const end = endPaths.has(item.path);

        return (
            <NavLink
                key={item.path}
                to={item.path}
                end={end}
                onClick={closeOnClick ? () => setSidebarOpen(false) : undefined}
                className={({ isActive }) =>
                    [
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                        isActive ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                    ].join(" ")
                }
            >
                <span className="inline-flex h-5 w-5 items-center justify-center">{renderIcon(item.icon)}</span>
                <span>{item.label}</span>
            </NavLink>
        );
    };

    return (
        <div className="h-screen bg-cream flex overflow-hidden">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-primary text-white shrink-0 sticky top-0 h-screen overflow-y-auto">
                <div className="px-6 py-5 border-b border-black/10 flex items-center">
                    <img src={BiotraceLogo} alt="Biotrace" className="h-10 w-auto" />
                </div>
                <nav className="flex-1 px-3 py-4 space-y-1">{navItems.map((i) => renderNavItem(i))}</nav>
            </aside>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Mobile sidebar */}
            <aside
                className={[
                    "fixed z-40 inset-y-0 left-0 w-64 bg-primary text-white transform transition-transform duration-200 lg:hidden",
                    sidebarOpen ? "translate-x-0" : "-translate-x-full",
                ].join(" ")}
            >
                <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between">
                    <img src={BiotraceLogo} alt="Biotrace" className="h-8 w-auto" />
                    <button
                        className="text-white text-xl leading-none"
                        onClick={() => setSidebarOpen(false)}
                        aria-label={t("nav.closeSidebar")}
                        title={t("close")}
                    >
                        ✕
                    </button>
                </div>
                <nav className="px-3 py-4 space-y-1">{navItems.map((i) => renderNavItem(i, true))}</nav>
            </aside>

            {/* Main */}
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                <Topbar onOpenNav={() => setSidebarOpen(true)} />
                <main className="flex-1 px-4 md:px-6 pb-6 pt-4 overflow-y-auto min-w-0">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
