import { apiGet, apiPost, apiPatch, setStaffAuthToken, setClientAuthToken } from "./api";

type StaffLoginResponse = {
    user?: any;
    token?: string | null;
    data?: any;
};

type ClientLoginResponse = {
    client?: any;
    token?: string;
    data?: any;
};

// =======================
// STAFF / BACKOFFICE
// =======================

export async function loginRequest(email: string, password: string) {
    const res = await apiPost<StaffLoginResponse>("/v1/auth/login", {
        email,
        password,
    });

    // Robust token extraction (support token at top-level or nested data)
    const token = (res as any)?.token ?? (res as any)?.data?.token ?? null;
    if (token) setStaffAuthToken(token);

    return (res as any)?.user ?? (res as any)?.data?.user ?? null;
}

export async function logoutRequest() {
    try {
        await apiPost<void>("/v1/auth/logout", {});
    } finally {
        setStaffAuthToken(null);
        // legacy key (kalau masih ada)
        try {
            localStorage.removeItem("biotrace_auth_token");
        } catch {
            // ignore
        }
    }
}

export async function fetchProfile() {
    const res = await apiGet<any>("/v1/auth/me");
    return (res as any)?.user ?? (res as any)?.data?.user ?? res;
}

// =======================
// CLIENT / PORTAL
// =======================

export async function clientLoginRequest(email: string, password: string) {
    const res = await apiPost<ClientLoginResponse>("/v1/clients/login", {
        email,
        password,
        device_name: "web",
    });

    // Robust token extraction (support token at top-level or nested data)
    const token = (res as any)?.token ?? (res as any)?.data?.token ?? null;
    if (token) setClientAuthToken(token);

    return res;
}

export async function clientFetchProfile() {
    return apiGet<any>("/v1/clients/me");
}

export async function clientLogoutRequest() {
    try {
        await apiPost<void>("/v1/clients/logout", {});
    } finally {
        setClientAuthToken(null);
    }
}

export async function clientRegisterRequest(payload: any) {
    return apiPost<any>("/v1/clients/register", payload);
}

export async function registerStaffRequest(payload: any) {
    return apiPost<any>("/v1/staffs/register", payload);
}

export type LocaleCode = "id" | "en";

// STAFF
export async function updateStaffLocale(locale: LocaleCode) {
    const res = await apiPatch<any>("/v1/auth/me", { locale });
    return (res as any)?.user ?? (res as any)?.data?.user ?? res;
}

// CLIENT
export async function updateClientLocale(locale: LocaleCode) {
    const res = await apiPatch<any>("/v1/clients/me", { locale });
    return (res as any)?.client ?? (res as any)?.data?.client ?? res;
}
