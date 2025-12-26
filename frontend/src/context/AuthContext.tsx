// src/context/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { staffLoginRequest, staffLogoutRequest, staffMeRequest } from "../services/auth";

type UserRole = { id: number; name: string } | null;

type User = { id: number; name: string; email: string; role: UserRole };

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

    useEffect(() => {
        const init = async () => {
            try {
                const token = localStorage.getItem("staff_token");
                if (!token) {
                    setUser(null);
                    return;
                }
                const res = await staffMeRequest();
                setUser(res.user);
            } catch {
                localStorage.removeItem("staff_token");
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const login = async (email: string, password: string) => {
        const res = await staffLoginRequest(email, password);
        if (!res.token) throw new Error("Staff login succeeded but token is missing.");
        localStorage.setItem("staff_token", res.token);
        setUser(res.user);
    };

    const logout = async () => {
        try {
            await staffLogoutRequest();
        } finally {
            localStorage.removeItem("staff_token");
            setUser(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuthContext must be used within AuthProvider");
    return ctx;
};
