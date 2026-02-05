import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { clientLoginRequest, clientFetchProfile, clientLogoutRequest } from "../services/auth";
import { getClientAuthToken } from "../services/api";
import { getTenant } from "../utils/tenant";
import { publishAuthEvent, subscribeAuthEvents } from "../utils/authSync";
import { clearLastRoute } from "../utils/lastRoute";

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

/**
 * Normalize berbagai bentuk response backend:
 * - { client: {...} }
 * - { data: { client: {...} } }
 * - { data: {...clientFields} }
 * - { ...clientFields }
 *
 * PLUS: toleransi key berbeda (email_address/contact_email/username, dll)
 */
function normalizeClient(payload: any): ClientUser | null {
    if (!payload) return null;

    // Step 1: ambil kandidat object paling mungkin jadi "client"
    let c =
        payload.client ??
        payload.data?.client ??
        payload.data ??
        payload;

    // Step 2: kalau ternyata masih wrapper (misalnya { client: {..} } di dalam lagi)
    if (c && typeof c === "object" && (c as any).client && typeof (c as any).client === "object") {
        c = (c as any).client;
    }

    if (!c || typeof c !== "object") return null;

    // Step 3: id bisa beda nama
    const idRaw =
        (c as any).id ??
        (c as any).client_id ??
        (c as any).clientId ??
        (c as any).user_id ??
        (c as any).userId;

    // Step 4: email bisa beda nama
    const emailRaw =
        (c as any).email ??
        (c as any).email_address ??
        (c as any).contact_email ??
        (c as any).client_email ??
        (c as any).username ??
        (c as any).mail;

    if (idRaw == null || emailRaw == null) return null;

    const nameRaw =
        (c as any).name ??
        (c as any).full_name ??
        (c as any).client_name ??
        "";

    const typeRaw =
        (c as any).type ??
        (c as any).client_type ??
        (c as any).category ??
        undefined;

    return {
        id: Number(idRaw),
        name: String(nameRaw ?? ""),
        email: String(emailRaw ?? ""),
        type: typeRaw ? String(typeRaw) : undefined,
    };
}

export const ClientAuthProvider = ({ children }: { children: ReactNode }) => {
    const [client, setClient] = useState<ClientUser | null>(readStoredClient());
    const [loading, setLoading] = useState(true);

    const isClientAuthenticated = !!client;

    const hardClearClient = () => {
        setClient(null);
        storeClient(null);
        clearLastRoute("client");
    };

    const refreshClient = async () => {
        // jangan spam /me kalau belum ada token
        const token = getClientAuthToken();
        if (!token) {
            hardClearClient();
            return;
        }

        try {
            const res = await clientFetchProfile();
            const normalized = normalizeClient(res);

            // ✅ FIX UTAMA: jangan auto-logout hanya karena shape beda
            // Kalau gagal normalize, kita TIDAK hardClear langsung.
            // (Biar nggak “masuk sebentar lalu mental ke login”.)
            if (!normalized) {
                console.error("Client profile response shape not recognized:", res);
                // kalau sebelumnya sudah ada client tersimpan, keep it.
                // kalau belum ada, biarkan null (nanti ketahuan dari /me di backend/log)
                return;
            }

            setClient(normalized);
            storeClient(normalized);
        } catch (err: any) {
            if (err?.status === 401) {
                hardClearClient();
                publishAuthEvent("client", "session_expired");
            } else {
                console.error("Failed to refresh client session:", err);
                // error non-401: jangan “tendang” brutal kalau sebelumnya ada session
                // tapi kalau kamu mau super ketat, bisa hardClearClient() di sini.
                return;
            }
        }
    };

    // Boot: portal only
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                setLoading(true);

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

    // ✅ Cross-tab sync (client)
    useEffect(() => {
        if (getTenant() !== "portal") return;

        const unsub = subscribeAuthEvents((evt) => {
            if (evt.actor !== "client") return;

            if (evt.action === "logout" || evt.action === "session_expired") {
                hardClearClient();
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

            // login response juga bisa beda shape → normalize toleran
            const normalized = normalizeClient(res);

            if (normalized) {
                setClient(normalized);
                storeClient(normalized);
            } else {
                // fallback: token sudah tersimpan saat login, ambil profile dari /me
                await refreshClient();
            }

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
            hardClearClient();
            setLoading(false);
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
