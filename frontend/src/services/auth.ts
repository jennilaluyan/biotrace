import { apiGet, apiPost, setAuthToken } from "./api";

type UserRole = { id: number; name: string } | null;

export type User = {
    id: number;
    name: string;
    email: string;
    role?: UserRole;
    role_id?: number;
    role_name?: string;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

function pickToken(payload: any): string | null {
    return payload?.token ?? payload?.access_token ?? payload?.data?.token ?? null;
}

/**
 * Match backend routes in routes/api.php:
 * POST /api/v1/clients/login
 * POST /api/v1/clients/register
 * GET  /api/v1/clients/me
 * POST /api/v1/clients/logout
 */
const CLIENT_LOGIN_PATH = "/v1/clients/login";
const CLIENT_REGISTER_PATH = "/v1/clients/register";
const CLIENT_ME_PATH = "/v1/clients/me";
const CLIENT_LOGOUT_PATH = "/v1/clients/logout";

/**
 * STAFF AUTH (backoffice)
 */
export async function loginRequest(email: string, password: string): Promise<User> {
    const res = await apiPost<any>("/v1/auth/login", {
        email,
        password,
        device_name: "web",
    });

    const token = pickToken(res);
    if (token) setAuthToken(token);

    const user = res?.user ?? res?.profile ?? res?.data?.user ?? res;
    return unwrapData<User>(user);
}

export async function fetchProfile(): Promise<User> {
    const res = await apiGet<any>("/v1/auth/me");
    return unwrapData<User>(res);
}

export async function logoutRequest(): Promise<void> {
    try {
        await apiPost("/v1/auth/logout");
    } finally {
        setAuthToken(null);
    }
}

/**
 * Staff register (backoffice)
 * Match backend: POST /api/v1/staffs/register
 */
export async function registerStaffRequest(payload: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    role_id: number;
}) {
    const res = await apiPost<any>("/v1/staffs/register", payload);
    return unwrapData<any>(res);
}

/**
 * CLIENT AUTH (portal)
 */
export async function clientLoginRequest(email: string, password: string) {
    const res = await apiPost<any>(CLIENT_LOGIN_PATH, {
        email,
        password,
        device_name: "web",
    });

    const token = pickToken(res);
    if (token) setAuthToken(token);

    return unwrapData<any>(res);
}

export async function clientRegisterRequest(payload: any) {
    const res = await apiPost<any>(CLIENT_REGISTER_PATH, payload);
    return unwrapData<any>(res);
}

// Optional helpers (not required by AuthPage, but useful)
export async function clientFetchProfile() {
    const res = await apiGet<any>(CLIENT_ME_PATH);
    return unwrapData<any>(res);
}

export async function clientLogoutRequest(): Promise<void> {
    try {
        await apiPost(CLIENT_LOGOUT_PATH);
    } finally {
        setAuthToken(null);
    }
}
