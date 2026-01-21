// L:\Campus\Final Countdown\biotrace\frontend\src\services\auth.ts
import axios from "axios";
import { apiGet, apiPost } from "./api";
import {
    setStaffAuthToken,
    setClientAuthToken,
} from "./api";

type StaffLoginResponse = {
    user?: any;
    token?: string | null;
};

type ClientLoginResponse = {
    client?: any;
    token?: string;
};

const API_URL = import.meta.env.VITE_API_URL;

// axios instance TANPA interceptor auth (biar tidak ikut nambah Authorization staff token)
const httpNoAuth = axios.create({
    baseURL: API_URL,
    withCredentials: true, // perlu untuk kirim cookie session staff agar bisa dilogout
    headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
    },
});

// Normalisasi path biar aman kalau API_URL sudah mengandung /api
function normalizePathForBaseUrl(path: string) {
    let p = path.startsWith("/") ? path : `/${path}`;
    const base = (API_URL ?? "").replace(/\/+$/, "");
    const baseHasApiSuffix = base.endsWith("/api");

    if (baseHasApiSuffix) {
        if (p === "/api") return "/";
        if (p.startsWith("/api/")) p = p.replace(/^\/api/, "");
    }

    return p;
}

/**
 * IMPORTANT:
 * Kalau user pernah login staff, cookie session staff bisa membuat Sanctum/auth membaca request client sebagai "Administrator".
 * Jadi: setelah client login berhasil, kita paksa logout staff session agar cookie staff hilang.
 */
async function forceClearStaffSessionCookie() {
    try {
        await httpNoAuth.post(normalizePathForBaseUrl("/v1/auth/logout"), {});
    } catch {
        // kalau tidak ada session staff, biasanya 401/419, itu aman di-skip
    } finally {
        // bersihkan token staff di localStorage juga supaya tidak “nempel”
        setStaffAuthToken(null);
        // legacy key (kalau masih ada)
        try {
            localStorage.removeItem("biotrace_auth_token");
        } catch {
            // ignore
        }
    }
}

export async function loginRequest(email: string, password: string) {
    // staff login (cookie session for browser; token only if backend returns one)
    const res = await apiPost<StaffLoginResponse>("/v1/auth/login", {
        email,
        password,
        // IMPORTANT: don't send device_name for browser SPA unless you truly want tokens
    });

    // If backend returns token, store it (Postman mode). Otherwise cookie session handles it.
    if (res?.token) setStaffAuthToken(res.token);
    return res?.user ?? null;
}

export async function logoutRequest() {
    try {
        await apiPost<void>("/v1/auth/logout", {});
    } finally {
        setStaffAuthToken(null);
        try {
            localStorage.removeItem("biotrace_auth_token");
        } catch {
            // ignore
        }
    }
}

export async function fetchProfile() {
    // staff profile
    const res = await apiGet<any>("/v1/auth/me");
    return res?.user ?? res;
}

// =======================
// CLIENT / PORTAL (token)
// =======================

export async function clientLoginRequest(email: string, password: string) {
    const res = await apiPost<ClientLoginResponse>("/v1/clients/login", {
        email,
        password,
        device_name: "web", // optional; backend supports it
    });

    // 🔥 REQUIRED: store token where api.ts expects it
    if (res?.token) setClientAuthToken(res.token);

    // 🔥 FIX PENTING:
    // Hapus session staff cookie supaya request ke /v1/client/* tidak kebaca Administrator lagi.
    await forceClearStaffSessionCookie();

    return res;
}

export async function clientFetchProfile() {
    const res = await apiGet<any>("/v1/clients/me");
    return res;
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
