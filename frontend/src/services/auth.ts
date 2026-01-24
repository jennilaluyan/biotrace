import { apiGet, apiPost } from "./api";
import { setStaffAuthToken, setClientAuthToken } from "./api";

type StaffLoginResponse = {
    user?: any;
    token?: string | null;
};

type ClientLoginResponse = {
    client?: any;
    token?: string;
};

/**
 * CATATAN PENTING (biar stabil portal + backoffice):
 * Jangan pernah logout staff session ketika client login.
 *
 * Dulu ada hack forceClearStaffSessionCookie() untuk menghapus cookie staff,
 * tapi itu bikin portal/backoffice tidak bisa login bersamaan (saling tendang).
 *
 * Pemisahan yang benar harus dilakukan di layer API (services/api.ts):
 * - request client (/v1/clients/* dan /v1/client/*) harus withCredentials=false
 * - token client disimpan terpisah dari token staff
 */

// =======================
// STAFF / BACKOFFICE
// =======================

export async function loginRequest(email: string, password: string) {
    // Staff login (biasanya pakai cookie session)
    const res = await apiPost<StaffLoginResponse>("/v1/auth/login", {
        email,
        password,
    });

    // Jika backend mengembalikan token (opsional), simpan token staff
    if (res?.token) setStaffAuthToken(res.token);

    return res?.user ?? null;
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
    return res?.user ?? res;
}

// =======================
// CLIENT / PORTAL
// =======================

export async function clientLoginRequest(email: string, password: string) {
    const res = await apiPost<ClientLoginResponse>("/v1/clients/login", {
        email,
        password,
        device_name: "web", // optional; backend supports it
    });

    // REQUIRED: simpan token client di tempat yang api.ts pakai untuk attach Authorization client
    if (res?.token) setClientAuthToken(res.token);

    // ❌ JANGAN logout staff di sini.
    // Portal dan backoffice harus bisa berjalan bersamaan.
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
