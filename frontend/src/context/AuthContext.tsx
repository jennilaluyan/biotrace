import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { loginRequest, logoutRequest, fetchProfile } from "../services/auth";
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
};

type AuthContextType = {
    user: User | null;
    isAuthenticated: boolean;
    loading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const isAuthenticated = !!user;

    const refresh = async () => {
        try {
            const profile = await fetchProfile();
            setUser(profile as any);
        } catch (err: any) {
            if (err?.status === 401 || err?.status === 419) {
                setUser(null);
                return;
            }
            console.error("Failed to refresh session:", err);
            setUser(null);
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
                if (!cancelled) setUser(profile as any);
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

    // ✅ NEW: cross-tab sync (staff)
    useEffect(() => {
        if (getTenant() !== "backoffice") return;

        const unsub = subscribeAuthEvents((evt) => {
            // ignore non-staff
            if (evt.actor !== "staff") return;

            // logout/expired in another tab -> clear immediately
            if (evt.action === "logout" || evt.action === "session_expired") {
                const uid = (user as any)?.id;
                setUser(null);
                clearLastRoute("staff", uid);
                return;
            }
            // login/refresh in another tab -> refresh user (optional)
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
            if (u) setUser(u as any);
            else await refresh();

            // ✅ broadcast: other tabs can refresh UI if they want
            publishAuthEvent("staff", "login");
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        setLoading(true);

        // capture dulu sebelum setUser(null)
        const uid = (user as any)?.id;

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
        <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, refresh }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
    return ctx;
};
