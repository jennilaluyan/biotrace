import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { loginRequest, logoutRequest, fetchProfile } from "../services/auth";
import { getAuthToken } from "../services/api";

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
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const isAuthenticated = !!user;

    useEffect(() => {
        let cancelled = false;

        const boot = async () => {
            try {
                setLoading(true);

                const token = getAuthToken();
                if (!token) {
                    if (!cancelled) setUser(null);
                    return;
                }

                const profile = await fetchProfile();
                if (!cancelled) setUser(profile as any);
            } catch (err: any) {
                if (err?.status === 401) {
                    if (!cancelled) setUser(null);
                } else {
                    console.error("Failed to load session:", err);
                    if (!cancelled) setUser(null);
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

    const login = async (email: string, password: string) => {
        setLoading(true);
        try {
            const u = await loginRequest(email, password);
            setUser(u as any);
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        setLoading(true);
        try {
            await logoutRequest();
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
    return ctx;
};
