// frontend/src/services/parameters.ts
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

export type ParameterRow = {
    parameter_id: number;
    code?: string | null;
    name?: string | null;
    unit?: string | null;
    unit_id?: number | null;
    method_ref?: string | null;
    status?: string | null;
    tag?: string | null;
};

export type ParameterPayload = {
    code?: string | null;
    name: string;
    unit?: string | null;
    unit_id?: number | null;
    method_ref?: string | null;
    status?: string | null;
    tag?: string | null;
};

type ListParams = { page?: number; per_page?: number; q?: string; scope?: "staff" | "client" };

function buildListUrl(params?: ListParams) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.q) qs.set("q", params.q);

    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    // IMPORTANT:
    // - staff uses: GET {API_VER}/parameters (auth:sanctum)
    // - client portal SHOULD use: GET {API_VER}/client/parameters (auth:client_api)
    //   (backend route must exist)
    const basePath = params?.scope === "client" ? `${API_VER}/client/parameters` : `${API_VER}/parameters`;

    return `${basePath}${suffix}`;
}

export async function listParameters(params?: ListParams) {
    return apiGet<any>(buildListUrl(params));
}

export async function createParameter(payload: ParameterPayload) {
    return apiPost<ApiEnvelope<ParameterRow>>(`${API_VER}/parameters`, payload);
}

export async function updateParameter(parameterId: number, payload: Partial<ParameterPayload>) {
    return apiPatch<ApiEnvelope<ParameterRow>>(`${API_VER}/parameters/${parameterId}`, payload);
}

export async function deleteParameter(parameterId: number) {
    return apiDelete<ApiEnvelope<null>>(`${API_VER}/parameters/${parameterId}`);
}
