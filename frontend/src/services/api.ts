// frontend/src/services/api.ts
import axios, { AxiosRequestConfig, AxiosError } from "axios";

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
    console.error("VITE_API_URL is not set");
}

// Buat 1 Axios instance pusat
export const http = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        Accept: "application/json",
    },
});

// Helper untuk samakan perilaku dengan handleResponse lama
function normalizeData(data: any) {
    if (data === "" || data === undefined) {
        return null;
    }
    return data;
}

// Helper untuk bungkus Axios promise → bentuk {status, data} seperti sebelumnya
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

/**
 * Normalize path supaya tidak double "/api" ketika:
 * - baseURL = ".../api"
 * - path   = "/api/v1/...."
 *
 * Maka hasilnya: "/v1/...." (jadi request final tetap ".../api/v1/....")
 */
function normalizePath(path: string) {
    let p = path.startsWith("/") ? path : `/${path}`;

    const base = (http.defaults.baseURL ?? "").replace(/\/+$/, ""); // trim trailing "/"
    const baseHasApiSuffix = base.endsWith("/api");

    if (baseHasApiSuffix) {
        // kalau path mulai dengan "/api" → buang prefix "/api"
        if (p === "/api") return "/";
        if (p.startsWith("/api/")) p = p.replace(/^\/api/, "");
    }

    return p;
}

// ----------------------------
// GET (versi Axios)
// ----------------------------
export async function apiGet<T = any>(
    path: string,
    options?: AxiosRequestConfig
) {
    return handleAxios<T>(http.get(normalizePath(path), options));
}

// ----------------------------
// POST (versi Axios)
// ----------------------------
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

// ----------------------------
// PATCH (versi Axios)
// ----------------------------
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

// ----------------------------
// PUT (versi Axios)
// ----------------------------
export async function apiPut<T = any>(
    path: string,
    body?: unknown,
    options?: AxiosRequestConfig
) {
    return handleAxios<T>(
        http.put(path, body, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(options?.headers || {}),
            },
            ...options,
        })
    );
}

// ----------------------------
// DELETE (versi Axios)
// ----------------------------
export async function apiDelete<T = any>(
    path: string,
    options?: AxiosRequestConfig
) {
    return handleAxios<T>(http.delete(path, options));
}
