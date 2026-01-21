import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import BiotraceLogo from "../../assets/biotrace-logo.png";
import { clientLogoutRequest } from "../../services/auth";
import { useClientAuth } from "../../hooks/useClientAuth";

type NavItem = {
    label: string;
    path: string;
    icon?: "home" | "flask";
};

export const PortalLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const navigate = useNavigate();
    const { client, loading, isClientAuthenticated } = useClientAuth() as any;

    // ✅ HARD GUARD: kalau tidak login, jangan biarkan portal render & fetch data
    useEffect(() => {
        if (loading) return;
        if (!isClientAuthenticated) {
            navigate("/login", { replace: true });
        }
    }, [loading, isClientAuthenticated, navigate]);

    const navItems: NavItem[] = [
        { label: "Dashboard", path: "/portal", icon: "home" },
        { label: "Sample Requests", path: "/portal/requests", icon: "flask" },
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

    const renderNavItem = (item: NavItem, closeOnClick = false) => (
        <NavLink
            key={item.path}
            to={item.path}
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

    const handleLogout = async () => {
        try {
            await clientLogoutRequest();
        } finally {
            navigate("/login", { replace: true });
        }
    };

    const displayName = client?.name ?? client?.email ?? "Client";

    return (
        <div className="min-h-screen bg-cream flex">
            <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-primary text-white min-h-screen">
                <div className="px-6 py-5 border-b border-black/10 flex items-center">
                    <img src={BiotraceLogo} alt="Biotrace" className="h-10 w-auto" />
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1">{navItems.map((i) => renderNavItem(i))}</nav>

                <div className="px-3 pb-4">
                    <button
                        onClick={handleLogout}
                        className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10 transition text-left"
                    >
                        Logout
                    </button>
                </div>
            </aside>

            {sidebarOpen && (
                <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            <aside
                className={`fixed z-40 inset-y-0 left-0 w-64 bg-primary text-white transform transition-transform duration-200 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between">
                    <img src={BiotraceLogo} alt="Biotrace" className="h-8 w-auto" />
                    <button className="text-white text-xl leading-none" onClick={() => setSidebarOpen(false)}>
                        ✕
                    </button>
                </div>

                <nav className="px-3 py-4 space-y-1">{navItems.map((i) => renderNavItem(i, true))}</nav>

                <div className="px-3 pb-4">
                    <button
                        onClick={handleLogout}
                        className="w-full rounded-lg px-3 py-2 text-sm font-medium text-white/90 hover:bg-white/10 transition text-left"
                    >
                        Logout
                    </button>
                </div>
            </aside>

            <div className="flex-1 flex flex-col min-h-screen">
                <header className="flex items-center justify-between px-4 md:px-6 py-6 border-b border-black/5 bg-cream">
                    <button
                        type="button"
                        className="lg:hidden"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open navigation"
                    >
                        <div className="space-y-1.5">
                            <span className="block h-0.5 w-5 rounded-full bg-gray-900" />
                            <span className="block h-0.5 w-5 rounded-full bg-gray-900" />
                            <span className="block h-0.5 w-5 rounded-full bg-gray-900" />
                        </div>
                    </button>

                    <div className="hidden lg:block" />

                    <div className="flex items-center gap-4 ml-auto">
                        <button type="button" className="lims-icon-button text-gray-700" aria-label="Notifications">
                            <svg
                                viewBox="0 0 24 24"
                                className="h-5 w-5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                            </svg>
                        </button>

                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-gray-300" />
                            <div className="hidden sm:flex flex-col items-start">
                                <span className="text-xs font-semibold text-gray-900">{displayName}</span>
                                <span className="text-[11px] text-gray-500">Client</span>
                            </div>

                            <button type="button" className="lims-btn" onClick={handleLogout}>
                                Logout
                            </button>
                        </div>
                    </div>
                </header>

                <main className="flex-1 px-4 md:px-6 pb-6 pt-4">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
