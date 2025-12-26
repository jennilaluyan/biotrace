import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { clientLoginRequest, clientLogoutRequest, clientMeRequest } from "../services/auth";

type ClientUser = { id: number; name: string; email: string };

type PortalAuthContextType = {
    client: ClientUser | null;
    isClientAuthenticated: boolean;
    loading: boolean;
    loginClient: (email: string, password: string) => Promise<void>;
    logoutClient: () => Promise<void>;
};

const PortalAuthContext = createContext<PortalAuthContextType | null>(null);

export const PortalAuthProvider = ({ children }: { children: ReactNode }) => {
    const [client, setClient] = useState<ClientUser | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const init = async () => {
            try {
                const token = localStorage.getItem("client_token");
                if (!token) {
                    setClient(null);
                    return;
                }
                const res = await clientMeRequest();
                setClient(res.client);
            } catch {
                localStorage.removeItem("client_token");
                setClient(null);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, []);

    const loginClient = async (email: string, password: string) => {
        const res = await clientLoginRequest(email, password);
        localStorage.setItem("client_token", res.token);
        setClient(res.client);
    };

    const logoutClient = async () => {
        try {
            await clientLogoutRequest();
        } finally {
            localStorage.removeItem("client_token");
            setClient(null);
        }
    };

    return (
        <PortalAuthContext.Provider
            value={{ client, loading, isClientAuthenticated: !!client, loginClient, logoutClient }}
        >
            {children}
        </PortalAuthContext.Provider>
    );
};

export const usePortalAuth = () => {
    const ctx = useContext(PortalAuthContext);
    if (!ctx) throw new Error("usePortalAuth must be used within PortalAuthProvider");
    return ctx;
};
