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
    // Di versi fetch lama:
    // - 204 No Content → null
    // - JSON → object
    // - text biasa → string
    // Axios sudah mirip: kalau JSON → object, kalau text → string
    // Di sini kita cuma samakan empty-string jadi null biar lebih dekat.
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
            // Samakan bentuk error seperti versi fetch:
            // throw { status: res.status, data }
            throw {
                status: error.response.status,
                data: normalizeData(error.response.data),
            };
        }

        // Kalau error jaringan / timeout / dll
        throw err;
    }
}

// ----------------------------
// GET (versi Axios)
// ----------------------------
export async function apiGet<T = any>(
    path: string,
    options?: AxiosRequestConfig
) {
    // Dulu: fetch(`${API_URL}${path}`, {...})
    // Sekarang: http.get(path, {...}) → baseURL sudah di-set
    return handleAxios<T>(http.get(path, options));
}

// ----------------------------
// POST (versi Axios)
// ----------------------------
export async function apiPost<T = any>(
    path: string,
    body?: unknown,
    options?: AxiosRequestConfig
) {
    // Dulu: fetch(`${API_URL}${path}`, { method: "POST", ... })
    // Sekarang: http.post(path, body, {...})
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
