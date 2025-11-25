// src/components/layout/AppLayout.tsx
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import BiotraceLogo from "../../assets/biotrace-logo.png";

const NAV_ITEMS = [{ label: "Clients", path: "/clients" }];

export const AppLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-cream flex">
            {/* Sidebar desktop */}
            <aside className="hidden md:flex md:flex-col md:w-64 bg-primary text-white">
                <div className="flex items-center gap-2 px-6 py-5 border-b border-white/10">
                    <img src={BiotraceLogo} alt="Biotrace" className="h-7" />
                    <div className="flex flex-col">
                        <span className="text-sm font-semibold leading-none">BioTrace</span>
                        <span className="text-[11px] text-white/70">
                            Biomolecular LIMS
                        </span>
                    </div>
                </div>

                <nav className="flex-1 px-3 py-4 space-y-1">
                    {NAV_ITEMS.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                [
                                    "block rounded-lg px-3 py-2 text-sm font-medium transition",
                                    isActive
                                        ? "bg-primary-soft text-white"
                                        : "text-white/80 hover:bg-white/10 hover:text-white",
                                ].join(" ")
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/40 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar mobile */}
            <aside
                className={`fixed z-40 inset-y-0 left-0 w-64 bg-primary text-white transform transition-transform duration-200 md:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"
                    }`}
            >
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
                    <div className="flex items-center gap-2">
                        <img src={BiotraceLogo} alt="Biotrace" className="h-7" />
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold leading-none">
                                BioTrace
                            </span>
                            <span className="text-[11px] text-white/70">
                                Biomolecular LIMS
                            </span>
                        </div>
                    </div>
                    <button
                        className="text-white/80 text-xl"
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
                                    "block rounded-lg px-3 py-2 text-sm font-medium transition",
                                    isActive
                                        ? "bg-primary-soft text-white"
                                        : "text-white/80 hover:bg-white/10 hover:text-white",
                                ].join(" ")
                            }
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Main area */}
            <div className="flex-1 flex flex-col min-h-screen">
                <header className="h-14 px-4 md:px-6 flex items-center justify-between bg-white shadow-sm border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <button
                            className="md:hidden text-gray-700 text-xl"
                            onClick={() => setSidebarOpen(true)}
                        >
                            ☰
                        </button>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-900">
                                BioTrace LIMS
                            </span>
                            <span className="text-[11px] text-gray-500">
                                Biomolecular Lab · ISO/IEC 17025
                            </span>
                        </div>
                    </div>
                </header>

                <main className="flex-1 px-4 md:px-6 py-6 bg-cream">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
