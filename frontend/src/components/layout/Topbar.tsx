import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { useClientAuth } from "../../hooks/useClientAuth";
import { clientLogoutRequest, logoutRequest } from "../../services/auth";
import { getTenant } from "../../utils/tenant";
import { getUserRoleLabel } from "../../utils/roles";
import { STORAGE_KEY } from "../../i18n";

type TopbarProps = {
    onOpenNav?: () => void;
};

export const Topbar = ({ onOpenNav }: TopbarProps) => {
    const navigate = useNavigate();
    const { i18n } = useTranslation();

    const tenant = getTenant();
    const isPortal = tenant === "portal";

    // Backoffice auth (staff)
    const staffAuth = useAuth() as any;
    const staffUser = staffAuth?.user;

    // Portal auth (client)
    const clientAuth = useClientAuth() as any;
    const clientUser = clientAuth?.client;

    // Labels
    const roleLabel = isPortal ? "Client" : getUserRoleLabel(staffUser);

    // Display name
    const displayName = isPortal
        ? clientUser?.name ||
        clientUser?.full_name ||
        clientUser?.client_name ||
        clientUser?.contact_name ||
        clientUser?.username ||
        clientUser?.email ||
        "Client"
        : staffUser?.name ||
        staffUser?.full_name ||
        staffUser?.username ||
        staffUser?.email ||
        "Lab User";

    const [menuOpen, setMenuOpen] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };

        if (menuOpen) document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, [menuOpen]);

    const setLocale = async (next: "id" | "en") => {
        if ((i18n.resolvedLanguage ?? i18n.language) === next) return;

        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch { }

        try {
            document.documentElement.lang = next;
        } catch { }

        await i18n.changeLanguage(next);
    };

    const currentLocale = (i18n.resolvedLanguage ?? i18n.language) === "en" ? "en" : "id";

    const handleLogout = async () => {
        try {
            setLoggingOut(true);

            if (isPortal) {
                await clientLogoutRequest();
                if (typeof clientAuth?.setClient === "function") clientAuth.setClient(null);
                if (typeof clientAuth?.setIsClientAuthenticated === "function")
                    clientAuth.setIsClientAuthenticated(false);
            } else {
                await logoutRequest();
                if (typeof staffAuth?.setUser === "function") staffAuth.setUser(null);
                if (typeof staffAuth?.setIsAuthenticated === "function")
                    staffAuth.setIsAuthenticated(false);
            }

            setMenuOpen(false);
            navigate("/login", { replace: true });
        } catch {
            setMenuOpen(false);
            navigate("/login", { replace: true });
        } finally {
            setLoggingOut(false);
        }
    };

    const langBtn = (code: "id" | "en", label: string) => {
        const active = currentLocale === code;
        return (
            <button
                type="button"
                onClick={() => setLocale(code)}
                className={[
                    "px-2.5 py-1 rounded-full text-xs font-semibold transition",
                    active ? "bg-primary text-white" : "text-gray-700 hover:bg-black/5",
                ].join(" ")}
                aria-pressed={active}
                aria-label={`Switch language to ${code === "id" ? "Indonesian" : "English"}`}
            >
                {label}
            </button>
        );
    };

    return (
        <header className="flex items-center justify-between px-4 md:px-6 py-6 border-b border-black/5 bg-cream">
            {/* Hamburger left – muncul < lg */}
            <button
                type="button"
                className="lg:hidden"
                onClick={onOpenNav}
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
                {/* ✅ Language toggle */}
                <div
                    className="flex items-center gap-1 rounded-full border border-black/10 bg-white px-1 py-1"
                    role="group"
                    aria-label="Language toggle"
                    title="Language"
                >
                    {langBtn("id", "ID")}
                    {langBtn("en", "EN")}
                </div>

                {/* Notifications (placeholder) */}
                <button
                    type="button"
                    className="lims-icon-button text-gray-700"
                    aria-label="Notifications"
                >
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

                {/* Profile + dropdown */}
                <div className="relative" ref={menuRef}>
                    <button
                        type="button"
                        className="flex items-center gap-2"
                        onClick={() => setMenuOpen((v) => !v)}
                        aria-label="Open profile menu"
                    >
                        <div className="h-8 w-8 rounded-full bg-gray-300" />
                        <div className="hidden sm:flex flex-col items-start">
                            <span className="text-xs font-semibold text-gray-900">
                                {displayName}
                            </span>
                            <span className="text-[11px] text-gray-500">{roleLabel}</span>
                        </div>
                    </button>

                    {menuOpen && (
                        <div className="absolute right-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden z-50">
                            <div className="px-4 py-3 border-b border-gray-100">
                                <div className="text-sm font-semibold text-gray-900">
                                    {displayName}
                                </div>
                                <div className="text-xs text-gray-500">{roleLabel}</div>
                            </div>

                            <div className="p-2">
                                <button
                                    type="button"
                                    onClick={handleLogout}
                                    disabled={loggingOut}
                                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {loggingOut ? "Logging out..." : "Logout"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
