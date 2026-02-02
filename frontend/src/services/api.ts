import axios, { AxiosRequestConfig, AxiosError } from "axios";

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) {
    console.error("VITE_API_URL is not set");
}

export const http = axios.create({
    baseURL: API_URL,
    withCredentials: true, // default true (staff/backoffice). Client requests will override to false.
    headers: {
        Accept: "application/json",
    },
});

/**
 * Separate staff vs client tokens.
 */
const STAFF_TOKEN_KEY = "biotrace_staff_token";
const CLIENT_TOKEN_KEY = "biotrace_client_token";

/**
 * Backward compatible legacy key (staff only).
 */
const AUTH_TOKEN_KEY = "biotrace_auth_token";

function normalizeUrlForCheck(url?: string) {
    return (url ?? "").toLowerCase();
}

function isClientPath(url?: string) {
    const u = normalizeUrlForCheck(url);

    return (
        u.includes("/v1/client/") ||
        u.includes("/v1/clients/") ||
        u.includes("/api/v1/client/") ||
        u.includes("/api/v1/clients/")
    );
}

function sanitizeToken(raw: string | null | undefined) {
    if (!raw) return null;
    const t = String(raw).trim();
    if (!t) return null;
    if (t === "null" || t === "undefined") return null;
    return t;
}

export function setStaffAuthToken(token: string | null) {
    const t = sanitizeToken(token);
    if (t) localStorage.setItem(STAFF_TOKEN_KEY, t);
    else localStorage.removeItem(STAFF_TOKEN_KEY);
}

export function getStaffAuthToken() {
    return sanitizeToken(localStorage.getItem(STAFF_TOKEN_KEY));
}

export function setClientAuthToken(token: string | null) {
    const t = sanitizeToken(token);
    if (t) localStorage.setItem(CLIENT_TOKEN_KEY, t);
    else localStorage.removeItem(CLIENT_TOKEN_KEY);
}

export function getClientAuthToken() {
    return sanitizeToken(localStorage.getItem(CLIENT_TOKEN_KEY));
}

/**
 * Backward compatible (STAFF only).
 * Jangan dipakai untuk client portal.
 */
export function setAuthToken(token: string | null) {
    const t = sanitizeToken(token);
    if (t) {
        localStorage.setItem(AUTH_TOKEN_KEY, t);
        setStaffAuthToken(t);
    } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setStaffAuthToken(null);
    }
}

export function getAuthToken() {
    return getStaffAuthToken() ?? sanitizeToken(localStorage.getItem(AUTH_TOKEN_KEY));
}

/**
 * Token rules:
 * - Client endpoints MUST use client token ONLY (no legacy fallback!)
 * - Staff endpoints use staff token, fallback legacy staff token
 */
function resolveTokenForRequest(url?: string) {
    if (isClientPath(url)) {
        return getClientAuthToken(); // 🔥 penting: STOP fallback ke legacy
    }
    return getStaffAuthToken() ?? sanitizeToken(localStorage.getItem(AUTH_TOKEN_KEY)) ?? null;
}

http.interceptors.request.use((config) => {
    const url = config.url ?? "";
    const clientReq = isClientPath(url);

    // 🔥 FIX UTAMA:
    // Client endpoint tidak boleh mengirim cookie staff (session),
    // supaya backend tidak membaca actorRole=Administrator dan memblokir (CLIENT_ONLY).
    if (clientReq) {
        config.withCredentials = false;
    } else {
        config.withCredentials = true;
    }

    const token = resolveTokenForRequest(url);

    if (token) {
        config.headers = config.headers ?? {};
        (config.headers as any).Authorization = `Bearer ${token}`;
    } else if (config.headers && "Authorization" in config.headers) {
        delete (config.headers as any).Authorization;
    }

    return config;
});

http.interceptors.response.use(
    (res) => res,
    (err) => {
        const error = err as AxiosError;
        const status = error?.response?.status;
        const url = (error as any)?.config?.url ?? "";

        // Avoid cross-clearing
        if (status === 401) {
            if (isClientPath(url)) {
                setClientAuthToken(null);
                // jangan hapus legacy staff key di sini
            } else {
                setStaffAuthToken(null);
                localStorage.removeItem(AUTH_TOKEN_KEY);
            }
        }

        return Promise.reject(err);
    }
);

// Helper normalize
function normalizeData(data: any) {
    if (data === "" || data === undefined) return null;
    return data;
}

async function handleAxios<T>(promise: Promise<any>): Promise<T> {
    try {
        const res = await promise;
        return normalizeData(res.data) as T;
    } catch (err) {
        const error = err as AxiosError;

        if (error.response) {
            throw {
                status: error.response.status,
                data: normalizeData(error.response.data),
            };
        }
        throw err;
    }
}

function normalizePath(path: string) {
    let p = path.startsWith("/") ? path : `/${path}`;
    const base = (http.defaults.baseURL ?? "").replace(/\/+$/, "");
    const baseHasApiSuffix = base.endsWith("/api");

    if (baseHasApiSuffix) {
        if (p === "/api") return "/";
        if (p.startsWith("/api/")) p = p.replace(/^\/api/, "");
    }

    return p;
}

export async function apiGet<T = any>(path: string, options?: AxiosRequestConfig) {
    return handleAxios<T>(http.get(normalizePath(path), options));
}

export async function apiPost<T = any>(path: string, body?: unknown, options?: AxiosRequestConfig) {
    return handleAxios<T>(
        http.post(normalizePath(path), body, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(options?.headers || {}),
            },
            ...options,
        })
    );
}

export async function apiPatch<T = any>(path: string, body?: unknown, options?: AxiosRequestConfig) {
    return handleAxios<T>(
        http.patch(normalizePath(path), body, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(options?.headers || {}),
            },
            ...options,
        })
    );
}

export async function apiPut<T = any>(path: string, body?: unknown, options?: AxiosRequestConfig) {
    return handleAxios<T>(
        http.put(normalizePath(path), body, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(options?.headers || {}),
            },
            ...options,
        })
    );
}

export async function apiDelete<T = any>(path: string, options?: AxiosRequestConfig) {
    return handleAxios<T>(http.delete(normalizePath(path), options));
}

/**
 * RAW helpers (tidak unwrap)
 * Dipakai khusus saat FE butuh meta pagination dsb.
 */
export async function apiGetRaw<T = any>(path: string, options?: AxiosRequestConfig): Promise<T> {
    const res = await http.get(normalizePath(path), options);
    return normalizeData(res.data) as T;
}

export async function apiPostRaw<T = any>(path: string, body?: any, options?: AxiosRequestConfig): Promise<T> {
    const res = await http.post(normalizePath(path), body, options);
    return normalizeData(res.data) as T;
}

export async function apiPatchRaw<T = any>(path: string, body?: any, options?: AxiosRequestConfig): Promise<T> {
    const res = await http.patch(normalizePath(path), body, options);
    return normalizeData(res.data) as T;
}

export const api = {
    http,
    get: apiGet,
    post: apiPost,
    patch: apiPatch,
    put: apiPut,
    delete: apiDelete,
};

// Backward compatible default import (some components may do: import api from "./api")
export default http;
