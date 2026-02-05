import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { clientLoginRequest, clientFetchProfile, clientLogoutRequest } from "../services/auth";
import { getClientAuthToken } from "../services/api";
import { getTenant } from "../utils/tenant";
import { publishAuthEvent, subscribeAuthEvents } from "../utils/authSync";

export type ClientUser = {
    id: number;
    name: string;
    email: string;
    type?: string;
};

type ClientAuthContextType = {
    client: ClientUser | null;
    isClientAuthenticated: boolean;
    isAuthenticated: boolean; // alias
    loading: boolean;
    loginClient: (email: string, password: string) => Promise<void>;
    logoutClient: () => Promise<void>;
    refreshClient: () => Promise<void>;
};

const ClientAuthContext = createContext<ClientAuthContextType | null>(null);

const CLIENT_KEY = "biotrace_client_session";

function readStoredClient(): ClientUser | null {
    try {
        const raw = localStorage.getItem(CLIENT_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as ClientUser;
    } catch {
        return null;
    }
}

function storeClient(c: ClientUser | null) {
    if (!c) {
        localStorage.removeItem(CLIENT_KEY);
        return;
    }
    localStorage.setItem(CLIENT_KEY, JSON.stringify(c));
}

function normalizeClient(payload: any): ClientUser | null {
    if (!payload) return null;

    const c = payload.client ?? payload.data?.client ?? payload;
    if (!c || typeof c !== "object") return null;

    if (c.id == null || c.email == null) return null;

    return {
        id: Number(c.id),
        name: c.name ?? "",
        email: c.email ?? "",
        type: c.type ?? c.client_type ?? undefined,
    };
}

export const ClientAuthProvider = ({ children }: { children: ReactNode }) => {
    const [client, setClient] = useState<ClientUser | null>(readStoredClient());
    const [loading, setLoading] = useState(true);

    const isClientAuthenticated = !!client;

    const refreshClient = async () => {
        // 🔥 jangan spam call /me kalau memang belum ada token
        const token = getClientAuthToken();
        if (!token) {
            setClient(null);
            storeClient(null);
            return;
        }

        try {
            const res = await clientFetchProfile();
            const normalized = normalizeClient(res);
            setClient(normalized);
            storeClient(normalized);
        } catch (err: any) {
            if (err?.status === 401) {
                setClient(null);
                storeClient(null);
                // sync: token invalid -> tell other tabs too
                publishAuthEvent("client", "session_expired");
            } else {
                console.error("Failed to refresh client session:", err);
                setClient(null);
                storeClient(null);
            }
        }
    };

    // Boot: portal only
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                setLoading(true);

                // ✅ portal only. Backoffice jangan ikut-ikutan refresh client.
                if (getTenant() !== "portal") return;

                await refreshClient();
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ NEW: cross-tab sync (client)
    useEffect(() => {
        if (getTenant() !== "portal") return;

        const unsub = subscribeAuthEvents((evt) => {
            if (evt.actor !== "client") return;

            if (evt.action === "logout" || evt.action === "session_expired") {
                setClient(null);
                storeClient(null);
                return;
            }

            if (evt.action === "login" || evt.action === "refresh") {
                refreshClient();
            }
        });

        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loginClient = async (email: string, password: string) => {
        setLoading(true);
        try {
            const res = await clientLoginRequest(email, password);

            const normalized = normalizeClient(res);
            setClient(normalized);
            storeClient(normalized);

            if (!normalized) {
                await refreshClient();
            }

            // ✅ broadcast: other tabs refresh UI
            publishAuthEvent("client", "login");
        } finally {
            setLoading(false);
        }
    };

    const logoutClient = async () => {
        setLoading(true);
        try {
            await clientLogoutRequest();
        } finally {
            setClient(null);
            storeClient(null);
            setLoading(false);

            // ✅ broadcast: force all portal tabs logout
            publishAuthEvent("client", "logout");
        }
    };

    return (
        <ClientAuthContext.Provider
            value={{
                client,
                isClientAuthenticated,
                isAuthenticated: isClientAuthenticated,
                loading,
                loginClient,
                logoutClient,
                refreshClient,
            }}
        >
            {children}
        </ClientAuthContext.Provider>
    );
};

export const useClientAuthContext = () => {
    const ctx = useContext(ClientAuthContext);
    if (!ctx) throw new Error("useClientAuthContext must be used inside ClientAuthProvider");
    return ctx;
};
