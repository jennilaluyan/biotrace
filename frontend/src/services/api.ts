import axios, { AxiosError, AxiosRequestConfig } from "axios";
import { publishAuthEvent } from "../utils/authSync";

const API_URL = import.meta.env.VITE_API_URL;

export const http = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        Accept: "application/json",
    },
});

const STAFF_TOKEN_KEY = "biotrace_staff_token";
const CLIENT_TOKEN_KEY = "biotrace_client_token";
const LEGACY_AUTH_TOKEN_KEY = "biotrace_auth_token";

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

export function setAuthToken(token: string | null) {
    const t = sanitizeToken(token);
    if (t) {
        localStorage.setItem(LEGACY_AUTH_TOKEN_KEY, t);
        setStaffAuthToken(t);
    } else {
        localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
        setStaffAuthToken(null);
    }
}

export function getAuthToken() {
    return getStaffAuthToken() ?? sanitizeToken(localStorage.getItem(LEGACY_AUTH_TOKEN_KEY));
}

function resolveTokenForRequest(url?: string) {
    if (isClientPath(url)) return getClientAuthToken();
    return getStaffAuthToken() ?? sanitizeToken(localStorage.getItem(LEGACY_AUTH_TOKEN_KEY)) ?? null;
}

http.interceptors.request.use((config) => {
    const url = config.url ?? "";
    const clientReq = isClientPath(url);

    config.withCredentials = !clientReq;

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

        if (status === 401) {
            if (isClientPath(url)) {
                setClientAuthToken(null);
                publishAuthEvent("client", "session_expired");
            } else {
                setStaffAuthToken(null);
                localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
                publishAuthEvent("staff", "session_expired");
            }
        }

        return Promise.reject(err);
    }
);

function normalizeData(data: any) {
    if (data === "" || data === undefined) return null;
    return data;
}

function extractMessage(payload: any, fallback?: string) {
    if (!payload) return fallback ?? "Request failed.";
    if (typeof payload === "string") return payload;
    if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
    if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
    return fallback ?? "Request failed.";
}

async function handleAxios<T>(promise: Promise<any>): Promise<T> {
    try {
        const res = await promise;
        return normalizeData(res.data) as T;
    } catch (err) {
        const error = err as AxiosError;

        if (error.response) {
            const data = normalizeData(error.response.data);
            const message = extractMessage(data, error.message);
            throw {
                status: error.response.status,
                data,
                message,
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

function isFormData(body: unknown): body is FormData {
    return typeof FormData !== "undefined" && body instanceof FormData;
}

function stripContentType(headers: Record<string, any>) {
    const out: Record<string, any> = { ...(headers ?? {}) };
    for (const k of Object.keys(out)) {
        if (k.toLowerCase() === "content-type") {
            delete out[k];
        }
    }
    return out;
}

function buildHeaders(body: unknown, options?: AxiosRequestConfig) {
    const merged: Record<string, any> = {
        Accept: "application/json",
        ...(options?.headers || {}),
    };

    // For FormData: DO NOT set Content-Type manually.
    // Let axios/browser set multipart boundary.
    if (isFormData(body)) {
        return stripContentType(merged);
    }

    // For non-FormData: default JSON unless caller already set it.
    const hasContentType = Object.keys(merged).some((k) => k.toLowerCase() === "content-type");
    if (!hasContentType) {
        merged["Content-Type"] = "application/json";
    }

    return merged;
}

export async function apiGet<T = any>(path: string, options?: AxiosRequestConfig) {
    return handleAxios<T>(http.get(normalizePath(path), options));
}

export async function apiPost<T = any>(path: string, body?: unknown, options?: AxiosRequestConfig) {
    return handleAxios<T>(
        http.post(normalizePath(path), body, {
            ...options,
            headers: buildHeaders(body, options),
        })
    );
}

export async function apiPatch<T = any>(path: string, body?: unknown, options?: AxiosRequestConfig) {
    return handleAxios<T>(
        http.patch(normalizePath(path), body, {
            ...options,
            headers: buildHeaders(body, options),
        })
    );
}

export async function apiPut<T = any>(path: string, body?: unknown, options?: AxiosRequestConfig) {
    return handleAxios<T>(
        http.put(normalizePath(path), body, {
            ...options,
            headers: buildHeaders(body, options),
        })
    );
}

export async function apiDelete<T = any>(path: string, options?: AxiosRequestConfig) {
    return handleAxios<T>(http.delete(normalizePath(path), options));
}

export async function apiGetRaw<T = any>(path: string, options?: AxiosRequestConfig): Promise<T> {
    const res = await http.get(normalizePath(path), options);
    return normalizeData(res.data) as T;
}

export async function apiGetBlob(path: string, options?: AxiosRequestConfig): Promise<Blob> {
    try {
        const res = await http.get(normalizePath(path), {
            ...options,
            responseType: "blob",
            headers: {
                Accept: "application/pdf",
                ...(options?.headers || {}),
            },
        });

        return res.data as Blob;
    } catch (err) {
        const error = err as AxiosError;

        if (error.response) {
            let data: any = normalizeData(error.response.data);
            let message = error.message;

            if (typeof Blob !== "undefined" && data instanceof Blob) {
                try {
                    const text = await data.text();
                    try {
                        const json = JSON.parse(text);
                        data = json;
                        message = extractMessage(json, message);
                    } catch {
                        data = text;
                        message = text || message;
                    }
                } catch {
                    // ignore
                }
            } else {
                message = extractMessage(data, message);
            }

            throw {
                status: error.response.status,
                data,
                message,
            };
        }

        throw err;
    }
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

export default http;
