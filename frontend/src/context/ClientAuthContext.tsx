import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import i18n from "i18next";

import {
    clientLoginRequest,
    clientFetchProfile,
    clientLogoutRequest,
    updateClientLocale,
    type LocaleCode,
} from "../services/auth";
import { getClientAuthToken } from "../services/api";
import { getTenant } from "../utils/tenant";
import { publishAuthEvent, subscribeAuthEvents } from "../utils/authSync";
import { clearLastRoute } from "../utils/lastRoute";

export type ClientUser = {
    id: number;
    name: string;
    email: string;
    type?: string;
    locale?: LocaleCode;
};

type ClientAuthContextType = {
    client: ClientUser | null;
    isClientAuthenticated: boolean;
    isAuthenticated: boolean; // alias
    loading: boolean;
    loginClient: (email: string, password: string) => Promise<void>;
    logoutClient: () => Promise<void>;
    refreshClient: () => Promise<void>;
    setLocale: (locale: LocaleCode) => Promise<void>;
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

function normalizeLocale(v: any): LocaleCode | null {
    return v === "en" || v === "id" ? v : null;
}

async function applyLocaleFromClient(profile: any) {
    const loc = normalizeLocale(profile?.locale);
    if (!loc) return;

    try {
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

    let c = payload.client ?? payload.data?.client ?? payload.data ?? payload;

    if (c && typeof c === "object" && (c as any).client && typeof (c as any).client === "object") {
        c = (c as any).client;
    }

    if (!c || typeof c !== "object") return null;

    const idRaw =
        (c as any).id ??
        (c as any).client_id ??
        (c as any).clientId ??
        (c as any).user_id ??
        (c as any).userId;

    const emailRaw =
        (c as any).email ??
        (c as any).email_address ??
        (c as any).contact_email ??
        (c as any).client_email ??
        (c as any).username ??
        (c as any).mail;

    if (idRaw == null || emailRaw == null) return null;

    const nameRaw = (c as any).name ?? (c as any).full_name ?? (c as any).client_name ?? "";

    const typeRaw = (c as any).type ?? (c as any).client_type ?? (c as any).category ?? undefined;

    const localeRaw = (c as any).locale ?? (c as any).language ?? (c as any).lang ?? null;
    const locale = normalizeLocale(localeRaw) ?? undefined;

    return {
        id: Number(idRaw),
        name: String(nameRaw ?? ""),
        email: String(emailRaw ?? ""),
        type: typeRaw ? String(typeRaw) : undefined,
        locale,
    };
}

export const ClientAuthProvider = ({ children }: { children: ReactNode }) => {
    const [client, setClient] = useState<ClientUser | null>(readStoredClient());
    const [loading, setLoading] = useState(true);

    const isClientAuthenticated = !!client;

    const clientRef = useRef<ClientUser | null>(null);
    useEffect(() => {
        clientRef.current = client;
    }, [client]);

    const hardClearClient = () => {
        setClient(null);
        storeClient(null);
        clearLastRoute("client");
    };

    const refreshClient = async () => {
        const token = getClientAuthToken();
        if (!token) {
            hardClearClient();
            return;
        }

        try {
            const res = await clientFetchProfile();
            const normalized = normalizeClient(res);

            if (!normalized) {
                console.error("Client profile response shape not recognized:", res);
                return;
            }

            setClient(normalized);
            storeClient(normalized);
            await applyLocaleFromClient(normalized);
        } catch (err: any) {
            if (err?.status === 401) {
                hardClearClient();
                publishAuthEvent("client", "session_expired");
            } else {
                console.error("Failed to refresh client session:", err);
                return;
            }
        }
    };

    const setLocale = async (locale: LocaleCode) => {
        const next = normalizeLocale(locale);
        if (!next) return;

        const current = normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? "id";
        if (current === next) return;

        // If not logged in, change locally only
        if (!clientRef.current) {
            try {
                document.documentElement.lang = next;
            } catch { }
            await i18n.changeLanguage(next);
            return;
        }

        try {
            document.documentElement.lang = next;
        } catch { }

        try {
            await i18n.changeLanguage(next);

            const updated = await updateClientLocale(next);
            const savedLocale = normalizeLocale(updated?.locale) ?? next;

            setClient((c) => {
                if (!c) return c;
                const merged = { ...c, locale: savedLocale };
                storeClient(merged);
                return merged;
            });

            publishAuthEvent("client", "refresh");
        } catch (err) {
            try {
                document.documentElement.lang = current;
            } catch { }
            try {
                await i18n.changeLanguage(current);
            } catch { }
            throw err;
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

    // Cross-tab sync (client)
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
            const normalized = normalizeClient(res);

            if (normalized) {
                setClient(normalized);
                storeClient(normalized);
                await applyLocaleFromClient(normalized);
            } else {
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
                setLocale,
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
