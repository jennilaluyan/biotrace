import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import i18n from "i18next";

import { loginRequest, logoutRequest, fetchProfile, updateStaffLocale, type LocaleCode } from "../services/auth";
import { getTenant } from "../utils/tenant";
import { publishAuthEvent, subscribeAuthEvents } from "../utils/authSync";
import { clearLastRoute } from "../utils/lastRoute";

type UserRole = { id: number; name: string } | null;

type User = {
    id: number;
    name: string;
    email: string;
    role: UserRole;
    role_id?: number;
    role_name?: string;
    locale?: LocaleCode;
};

type AuthContextType = {
    user: User | null;
    isAuthenticated: boolean;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
    setLocale: (locale: LocaleCode) => Promise<void>;
};

function normalizeLocale(v: any): LocaleCode | null {
    return v === "en" || v === "id" ? v : null;
}

async function applyLocaleFromProfile(profile: any) {
    const loc = normalizeLocale(profile?.locale);
    if (!loc) return;

    try {
        // Optional: set <html lang="..">
        document.documentElement.lang = loc;
    } catch {
        // ignore
    }

    try {
        await i18n.changeLanguage(loc);
    } catch {
        // ignore
    }
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const isAuthenticated = !!user;

    // keep latest user for subscriptions without dependency chaos
    const userRef = useRef<User | null>(null);
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    const refresh = async () => {
        try {
            const profile = await fetchProfile();
            setUser(profile as any);
            await applyLocaleFromProfile(profile);
        } catch (err: any) {
            if (err?.status === 401 || err?.status === 419) {
                setUser(null);
                return;
            }
            console.error("Failed to refresh session:", err);
            setUser(null);
        }
    };

    const setLocale = async (locale: LocaleCode) => {
        const next = normalizeLocale(locale);
        if (!next) return;

        const current = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? "id";
        if (current === next) return;

        // If not logged in, just change locally (still useful in UI)
        if (!userRef.current) {
            try {
                document.documentElement.lang = next;
            } catch { }
            await i18n.changeLanguage(next);
            return;
        }

        // optimistic UI
        try {
            document.documentElement.lang = next;
        } catch { }

        try {
            await i18n.changeLanguage(next);

            // persist to backend
            const updated = await updateStaffLocale(next);

            // update local state
            setUser((u) => (u ? { ...u, locale: updated?.locale ?? next } : u));

            // broadcast so other tabs can refresh if needed
            publishAuthEvent("staff", "refresh");
        } catch (err) {
            // rollback
            try {
                document.documentElement.lang = current;
            } catch { }
            try {
                await i18n.changeLanguage(current);
            } catch { }
            throw err;
        }
    };

    // Boot: load session (staff only for backoffice)
    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            try {
                setLoading(true);

                if (getTenant() !== "backoffice") {
                    if (!cancelled) setUser(null);
                    return;
                }

                const profile = await fetchProfile();
                if (!cancelled) {
                    setUser(profile as any);
                    await applyLocaleFromProfile(profile);
                }
            } catch (err: any) {
                if (!cancelled) {
                    if (err?.status === 401 || err?.status === 419) {
                        setUser(null);
                    } else {
                        console.error("Failed to load session:", err);
                        setUser(null);
                    }
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        boot();
        return () => {
            cancelled = true;
        };
    }, []);

    // Cross-tab sync (staff)
    useEffect(() => {
        if (getTenant() !== "backoffice") return;

        const unsub = subscribeAuthEvents((evt) => {
            if (evt.actor !== "staff") return;

            if (evt.action === "logout" || evt.action === "session_expired") {
                const uid = userRef.current?.id;
                setUser(null);
                clearLastRoute("staff", uid);
                return;
            }

            if (evt.action === "login" || evt.action === "refresh") {
                refresh();
            }
        });

        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const login = async (email: string, password: string) => {
        setLoading(true);
        try {
            const u = await loginRequest(email, password);

            if (u) {
                setUser(u as any);
                await applyLocaleFromProfile(u);
            } else {
                await refresh();
            }

            publishAuthEvent("staff", "login");
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        setLoading(true);
        const uid = userRef.current?.id;

        try {
            await logoutRequest();
            setUser(null);
            clearLastRoute("staff", uid);

            publishAuthEvent("staff", "logout");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, refresh, setLocale }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
    return ctx;
};
