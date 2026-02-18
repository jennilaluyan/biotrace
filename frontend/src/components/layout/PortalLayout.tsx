import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import BiotraceLogo from "../../assets/biotrace-logo.png";
import { useClientAuth } from "../../hooks/useClientAuth";
import { clientLogoutRequest } from "../../services/auth";
import { Topbar } from "./Topbar";

type NavItem = {
    label: string;
    path: string;
    icon?: "users" | "flask" | "check" | "home";
};

export const PortalLayout = () => {
    const { t } = useTranslation();

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const navigate = useNavigate();
    const { loading, isClientAuthenticated } = useClientAuth() as any;

    useEffect(() => {
        if (loading) return;
        if (!isClientAuthenticated) navigate("/login", { replace: true });
    }, [loading, isClientAuthenticated, navigate]);

    const navItems: NavItem[] = [
        { label: t("portal.dashboard"), path: "/portal", icon: "home" },
        { label: t("portal.sampleRequests"), path: "/portal/requests", icon: "flask" }
    ];

    const renderIcon = (icon?: NavItem["icon"]) => {
        if (icon === "flask") {
            return (
                <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M10 2v6l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V2" />
                    <path d="M8 8h8" />
                </svg>
            );
        }

        return (
            <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M3 10.5L12 3l9 7.5" />
                <path d="M5 9.5V21h14V9.5" />
            </svg>
        );
    };

    const handlePortalLogout = async () => {
        if (loggingOut) return;
        try {
            setLoggingOut(true);
            await clientLogoutRequest();
        } finally {
            setLoggingOut(false);
            navigate("/login", { replace: true });
        }
    };

    const renderNavItem = (item: NavItem, closeOnClick = false) => {
        const end = item.path === "/portal";

        return (
            <NavLink
                key={item.path}
                to={item.path}
                end={end}
                onClick={closeOnClick ? () => setSidebarOpen(false) : undefined}
                className={({ isActive }) =>
                    [
                        "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                        isActive ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
                    ].join(" ")
                }
            >
                <span className="inline-flex h-5 w-5 items-center justify-center">{renderIcon(item.icon)}</span>
                <span>{item.label}</span>
            </NavLink>
        );
    };

    const LogoutButton = ({ compact }: { compact?: boolean }) => (
        <button
            type="button"
            onClick={handlePortalLogout}
            disabled={loggingOut}
            className={[
                "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                "text-white/80 hover:bg-white/10 hover:text-white",
                loggingOut ? "opacity-60 cursor-not-allowed" : "",
                compact ? "justify-center" : ""
            ].join(" ")}
        >
            <span className="inline-flex h-5 w-5 items-center justify-center">
                <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M10 17l5-5-5-5" />
                    <path d="M15 12H3" />
                    <path d="M21 21V3" />
                </svg>
            </span>
            <span>{loggingOut ? t("topbar.loggingOut") : t("topbar.logout")}</span>
        </button>
    );

    return (
        <div className="h-screen bg-cream flex overflow-hidden">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-primary text-white shrink-0 sticky top-0 h-screen overflow-y-auto">
                <div className="px-6 py-5 border-b border-black/10 flex items-center">
                    <img src={BiotraceLogo} alt="Biotrace" className="h-10 w-auto" />
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1">{navItems.map((i) => renderNavItem(i))}</nav>

                <div className="px-3 pb-4">
                    <LogoutButton />
                </div>
            </aside>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Mobile sidebar */}
            <aside
                className={`fixed z-40 inset-y-0 left-0 w-64 bg-primary text-white transform transition-transform duration-200 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
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

                <div className="px-3 pb-4">
                    <LogoutButton />
                </div>
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
