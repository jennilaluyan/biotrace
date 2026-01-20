import axios, { AxiosRequestConfig, AxiosError } from "axios";

const API_URL = import.meta.env.VITE_API_URL;
if (!API_URL) {
    console.error("VITE_API_URL is not set");
}

export const http = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        Accept: "application/json",
    },
});

const AUTH_TOKEN_KEY = "biotrace_auth_token";

export function setAuthToken(token: string | null) {
    if (token && token.trim() !== "") {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        http.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
        delete http.defaults.headers.common.Authorization;
    }
}

export function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

// bootstrap token on app load (so refresh still logged-in)
const bootToken = getAuthToken();
if (bootToken) {
    http.defaults.headers.common.Authorization = `Bearer ${bootToken}`;
}

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

export async function apiPost<T = any>(
    path: string,
    body?: unknown,
    options?: AxiosRequestConfig
) {
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

export async function apiPatch<T = any>(
    path: string,
    body?: unknown,
    options?: AxiosRequestConfig
) {
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

export async function apiPut<T = any>(
    path: string,
    body?: unknown,
    options?: AxiosRequestConfig
) {
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
