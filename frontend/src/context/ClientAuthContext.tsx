import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
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
    locale?: LocaleCode;
    institution_name?: string;
    institution_address?: string;
    contact_person_name?: string;
    contact_person_phone?: string;
    contact_person_email?: string;
    type?: "individual" | "institution";
    phone?: string;
};

type ClientAuthContextType = {
    client: ClientUser | null;
    isClientAuthenticated: boolean;
    isAuthenticated: boolean;
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

function storeClient(client: ClientUser | null) {
    if (!client) {
        localStorage.removeItem(CLIENT_KEY);
        return;
    }

    localStorage.setItem(CLIENT_KEY, JSON.stringify(client));
}

function normalizeLocale(value: unknown): LocaleCode | null {
    return value === "en" || value === "id" ? value : null;
}

function normalizeClientType(value: unknown): ClientUser["type"] {
    const normalized = String(value ?? "").trim().toLowerCase();

    if (normalized === "individual" || normalized === "institution") {
        return normalized;
    }

    return undefined;
}

function normalizeString(value: unknown): string | undefined {
    if (value == null) return undefined;

    const normalized = String(value).trim();
    return normalized === "" ? undefined : normalized;
}

function setDocumentLanguage(locale: LocaleCode) {
    document.documentElement.lang = locale;
}

async function applyLocaleFromClient(profile: Pick<ClientUser, "locale"> | null | undefined) {
    const locale = normalizeLocale(profile?.locale);
    if (!locale) return;

    try {
        setDocumentLanguage(locale);
    } catch { }

    try {
        await i18n.changeLanguage(locale);
    } catch { }
}

function extractClientObject(payload: any): Record<string, unknown> | null {
    if (!payload || typeof payload !== "object") return null;

    let candidate = payload.client ?? payload.data?.client ?? payload.data ?? payload;

    if (
        candidate &&
        typeof candidate === "object" &&
        "client" in candidate &&
        candidate.client &&
        typeof candidate.client === "object"
    ) {
        candidate = candidate.client;
    }

    return candidate && typeof candidate === "object"
        ? (candidate as Record<string, unknown>)
        : null;
}

function normalizeClient(payload: any): ClientUser | null {
    const client = extractClientObject(payload);
    if (!client) return null;

    const idRaw =
        client.id ??
        client.client_id ??
        client.clientId ??
        client.user_id ??
        client.userId;

    const emailRaw =
        client.email ??
        client.email_address ??
        client.contact_email ??
        client.client_email ??
        client.username ??
        client.mail;

    const id = Number(idRaw);
    const email = normalizeString(emailRaw);

    if (!Number.isFinite(id) || !email) {
        return null;
    }

    const institutionName =
        normalizeString(client.institution_name) ??
        normalizeString(client.institutionName);

    const name =
        normalizeString(client.name) ??
        normalizeString(client.full_name) ??
        normalizeString(client.client_name) ??
        institutionName ??
        "";

    const locale =
        normalizeLocale(client.locale) ??
        normalizeLocale(client.language) ??
        normalizeLocale(client.lang) ??
        undefined;

    return {
        id,
        name,
        email,
        locale,
        institution_name: institutionName,
        institution_address:
            normalizeString(client.institution_address) ??
            normalizeString(client.institutionAddress),
        contact_person_name:
            normalizeString(client.contact_person_name) ??
            normalizeString(client.contactPersonName),
        contact_person_phone:
            normalizeString(client.contact_person_phone) ??
            normalizeString(client.contactPersonPhone),
        contact_person_email:
            normalizeString(client.contact_person_email) ??
            normalizeString(client.contactPersonEmail),
        type: normalizeClientType(client.type ?? client.client_type ?? client.category),
        phone: normalizeString(client.phone),
    };
}

export const ClientAuthProvider = ({ children }: { children: ReactNode }) => {
    const [client, setClient] = useState<ClientUser | null>(readStoredClient());
    const [loading, setLoading] = useState(true);

    const isClientAuthenticated = !!client;

    const hardClearClient = useCallback(() => {
        setClient(null);
        storeClient(null);
        clearLastRoute("client");
    }, []);

    const refreshClient = useCallback(async () => {
        const token = getClientAuthToken();
        if (!token) {
            hardClearClient();
            return;
        }

        try {
            const response = await clientFetchProfile();
            const normalized = normalizeClient(response);

            if (!normalized) {
                console.error("Client profile response shape not recognized:", response);
                return;
            }

            setClient(normalized);
            storeClient(normalized);
            await applyLocaleFromClient(normalized);
        } catch (error: any) {
            if (error?.status === 401) {
                hardClearClient();
                publishAuthEvent("client", "session_expired");
                return;
            }

            console.error("Failed to refresh client session:", error);
        }
    }, [hardClearClient]);

    const setLocale = useCallback(
        async (locale: LocaleCode) => {
            const nextLocale = normalizeLocale(locale);
            if (!nextLocale) return;

            const currentLocale =
                normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? "id";

            if (currentLocale === nextLocale) return;

            if (!client) {
                try {
                    setDocumentLanguage(nextLocale);
                } catch { }

                await i18n.changeLanguage(nextLocale);
                return;
            }

            try {
                setDocumentLanguage(nextLocale);
            } catch { }

            try {
                await i18n.changeLanguage(nextLocale);

                const updated = await updateClientLocale(nextLocale);
                const savedLocale = normalizeLocale(updated?.locale) ?? nextLocale;

                setClient((currentClient) => {
                    if (!currentClient) return currentClient;

                    const merged = { ...currentClient, locale: savedLocale };
                    storeClient(merged);
                    return merged;
                });

                publishAuthEvent("client", "refresh");
            } catch (error) {
                try {
                    setDocumentLanguage(currentLocale);
                } catch { }

                try {
                    await i18n.changeLanguage(currentLocale);
                } catch { }

                throw error;
            }
        },
        [client]
    );

    const loginClient = useCallback(async (email: string, password: string) => {
        setLoading(true);

        try {
            const response = await clientLoginRequest(email, password);
            const normalized = normalizeClient(response);

            if (normalized) {
                setClient(normalized);
                storeClient(normalized);
                await applyLocaleFromClient(normalized);
            } else {
                const profileResponse = await clientFetchProfile();
                const profile = normalizeClient(profileResponse);

                if (!profile) {
                    console.error("Client profile response shape not recognized:", profileResponse);
                    return;
                }

                setClient(profile);
                storeClient(profile);
                await applyLocaleFromClient(profile);
            }

            publishAuthEvent("client", "login");
        } finally {
            setLoading(false);
        }
    }, []);

    const logoutClient = useCallback(async () => {
        setLoading(true);

        try {
            await clientLogoutRequest();
        } finally {
            hardClearClient();
            setLoading(false);
            publishAuthEvent("client", "logout");
        }
    }, [hardClearClient]);

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            try {
                setLoading(true);

                if (getTenant() !== "portal") {
                    return;
                }

                await refreshClient();
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void bootstrap();

        return () => {
            cancelled = true;
        };
    }, [refreshClient]);

    useEffect(() => {
        if (getTenant() !== "portal") {
            return;
        }

        return subscribeAuthEvents((event) => {
            if (event.actor !== "client") {
                return;
            }

            if (event.action === "logout" || event.action === "session_expired") {
                hardClearClient();
                return;
            }

            if (event.action === "login" || event.action === "refresh") {
                void refreshClient();
            }
        });
    }, [hardClearClient, refreshClient]);

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
    const context = useContext(ClientAuthContext);

    if (!context) {
        throw new Error("useClientAuthContext must be used inside ClientAuthProvider");
    }

    return context;
};