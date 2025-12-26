// src/services/api.ts
import axios, {
    AxiosError,
    AxiosInstance,
    AxiosRequestConfig,
    InternalAxiosRequestConfig,
} from "axios";

const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) console.error("VITE_API_URL is not set");

// -----------------------------
// Helper normalize
// -----------------------------
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

// -----------------------------
// Factory axios instance per "actor"
// -----------------------------
function createHttp(tokenStorageKey: "staff_token" | "client_token"): AxiosInstance {
    const instance = axios.create({
        baseURL: API_URL,
        withCredentials: false, // kita murni pakai Bearer token
        headers: { Accept: "application/json" },
    });

    instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem(tokenStorageKey);
        if (token) {
            config.headers = config.headers ?? {};
            config.headers.Authorization = `Bearer ${token}`;
        } else if (config.headers?.Authorization) {
            delete (config.headers as any).Authorization;
        }
        return config;
    });

    return instance;
}

export const staffHttp = createHttp("staff_token");
export const clientHttp = createHttp("client_token");

// -----------------------------
// Request helpers (instance-aware)
// -----------------------------
export async function apiGet<T = any>(
    http: AxiosInstance,
    path: string,
    options?: AxiosRequestConfig
) {
    return handleAxios<T>(http.get(path, options));
}

export async function apiPost<T = any>(
    http: AxiosInstance,
    path: string,
    body?: unknown,
    options?: AxiosRequestConfig
) {
    return handleAxios<T>(
        http.post(path, body, {
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
    http: AxiosInstance,
    path: string,
    body?: unknown,
    options?: AxiosRequestConfig
) {
    return handleAxios<T>(
        http.patch(path, body, {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(options?.headers || {}),
            },
            ...options,
        })
    );
}
