import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import BiotraceLogo from "../../assets/biotrace-logo.png";
import { useClientAuth } from "../../hooks/useClientAuth";

type NavItem = {
    label: string;
    path: string;
    icon?: "home" | "file";
};

export const PortalLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const navigate = useNavigate();
    const { client, logoutClient } = useClientAuth();

    const navItems: NavItem[] = [
        { label: "Dashboard", path: "/portal", icon: "home" },
        { label: "Sample Requests", path: "/portal/requests", icon: "file" },
    ];

    const renderIcon = (icon?: NavItem["icon"]) => {
        if (icon === "home") {
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
        }

        if (icon === "file") {
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
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                </svg>
            );
        }

        return null;
    };

    const renderNavItem = (item: NavItem, closeOnClick = false) => (
        <NavLink
            key={item.path}
            to={item.path}
            onClick={closeOnClick ? () => setSidebarOpen(false) : undefined}
            className={({ isActive }) =>
                [
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                    isActive
                        ? "bg-white/10 text-white"
                        : "text-white/80 hover:bg-white/10 hover:text-white",
                ].join(" ")
            }
        >
            <span className="inline-flex h-5 w-5 items-center justify-center">
                {renderIcon(item.icon)}
            </span>
            <span>{item.label}</span>
        </NavLink>
    );

    const handleLogout = async () => {
        try {
            await logoutClient();
        } finally {
            navigate("/login");
        }
    };

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
                <div
                    className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside
                className={`fixed z-40 inset-y-0 left-0 w-64 bg-primary text-white transform transition-transform duration-200 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                <div className="px-6 py-5 border-b border-black/10 flex items-center justify-between">
                    <img src={BiotraceLogo} alt="Biotrace" className="h-8 w-auto" />
                    <button
                        className="text-white text-xl leading-none"
                        onClick={() => setSidebarOpen(false)}
                    >
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
                <div className="sticky top-0 z-20 bg-cream">
                    <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-black/5">
                        <div className="flex items-center gap-3">
                            <button
                                className="lg:hidden rounded-lg px-3 py-2 text-sm font-medium bg-white shadow-sm"
                                onClick={() => setSidebarOpen(true)}
                            >
                                Menu
                            </button>
                            <div className="text-sm text-gray-600">Client Portal</div>
                        </div>

                        <div className="text-xs text-gray-500">
                            {client?.name ? `Signed in as ${client.name}` : ""}
                        </div>
                    </div>
                </div>

                <main className="flex-1 px-4 md:px-6 pb-6 pt-4">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
