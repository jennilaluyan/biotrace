// frontend/src/services/methods.ts
import { apiGet, apiPost, apiPatch, apiDelete } from "./api";

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const API_VER =
    (import.meta.env.VITE_API_VER as string | undefined) ??
    (RAW_BASE === "/api" || RAW_BASE.endsWith("/api") ? "/v1" : "/api/v1");

export type ApiEnvelope<T> = {
    status: number;
    message?: string | null;
    data: T;
    timestamp?: string;
    context?: any;
    meta?: any;
};

export type Paginated<T> = {
    current_page: number;
    data: T[];
    from?: number | null;
    last_page?: number;
    per_page?: number;
    to?: number | null;
    total?: number;
};

export type MethodRow = {
    method_id: number;
    code?: string | null;
    name: string;
    description?: string | null;
    is_active: boolean;
};

export type MethodPayload = {
    code?: string | null;
    name: string;
    description?: string | null;
    is_active?: boolean;
};

export async function listMethods(params?: {
    page?: number;
    per_page?: number;
    q?: string;
}) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.q) qs.set("q", params.q);

    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiGet<ApiEnvelope<Paginated<MethodRow>>>(`${API_VER}/methods${suffix}`);
}

export async function createMethod(payload: MethodPayload) {
    return apiPost<ApiEnvelope<MethodRow>>(`${API_VER}/methods`, payload);
}

export async function updateMethod(methodId: number, payload: Partial<MethodPayload>) {
    return apiPatch<ApiEnvelope<MethodRow>>(`${API_VER}/methods/${methodId}`, payload);
}

export async function deleteMethod(methodId: number) {
    return apiDelete<ApiEnvelope<null>>(`${API_VER}/methods/${methodId}`);
}
