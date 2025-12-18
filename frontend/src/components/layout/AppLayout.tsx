import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import BiotraceLogo from "../../assets/biotrace-logo.png";
import { Topbar } from "./Topbar";

const NAV_ITEMS = [
    { label: "Clients", path: "/clients" },
    { label: "Samples", path: "/samples" },
];

export const AppLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const renderNavItem = (item: (typeof NAV_ITEMS)[number]) => (
        <NavLink
            key={item.path}
            to={item.path}
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
                <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="3" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            </span>
            <span>{item.label}</span>
        </NavLink>
    );

    return (
        <div className="min-h-screen bg-cream flex">
            {/* Sidebar desktop */}
            <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-primary text-white min-h-screen">
                <div className="px-6 py-5 border-b border-black/10 flex items-center">
                    <img src={BiotraceLogo} alt="Biotrace" className="h-10 w-auto" />
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1">
                    {NAV_ITEMS.map(renderNavItem)}
                </nav>
            </aside>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar mobile */}
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

                <nav className="px-3 py-4 space-y-1">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setSidebarOpen(false)}
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
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="3" />
                                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                </svg>
                            </span>
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-h-screen">
                {/* Topbar baru */}
                <Topbar onOpenNav={() => setSidebarOpen(true)} />

                <main className="flex-1 px-4 md:px-6 pb-6 pt-4">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
