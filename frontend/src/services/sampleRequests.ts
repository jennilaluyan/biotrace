import { apiGet, apiPost } from "./api";
import type { PaginatedResponse, Sample } from "./samples";

export type ClientSampleListParams = {
    page?: number;
    per_page?: number;
    from?: string; // YYYY-MM-DD
    to?: string; // YYYY-MM-DD
    status?: string; // request_status filter
    q?: string; // search
};

export type ClientSampleDraftPayload = {
    sample_type: string;

    // ✅ portal schedule
    scheduled_delivery_at?: string | null;

    examination_purpose?: string | null;
    additional_notes?: string | null;

    // ✅ requested parameters
    parameter_ids?: number[] | null;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

function unwrapPaginatedFlexible<T>(res: any): PaginatedResponse<T> {
    if (res && typeof res === "object" && "data" in res && "meta" in res) {
        return res as PaginatedResponse<T>;
    }
    const inner = unwrapData<any>(res);
    if (inner && typeof inner === "object" && "data" in inner && "meta" in inner) {
        return inner as PaginatedResponse<T>;
    }
    if (Array.isArray(inner)) {
        return {
            data: inner as T[],
            meta: { current_page: 1, last_page: 1, per_page: inner.length, total: inner.length },
        };
    }
    return { data: [], meta: { current_page: 1, last_page: 1, per_page: 10, total: 0 } };
}

export const clientSampleRequestService = {
    // GET /v1/client/samples
    async list(params: ClientSampleListParams = {}): Promise<PaginatedResponse<Sample>> {
        const qs = new URLSearchParams();
        if (params.page) qs.set("page", String(params.page));
        if (params.per_page) qs.set("per_page", String(params.per_page));
        if (params.from) qs.set("from", params.from);
        if (params.to) qs.set("to", params.to);
        if (params.status) qs.set("status", params.status);
        if (params.q) qs.set("q", params.q);

        const url = `/v1/client/samples${qs.toString() ? `?${qs.toString()}` : ""}`;
        const res = await apiGet<any>(url);
        return unwrapPaginatedFlexible<Sample>(res);
    },

    // GET /v1/client/samples/:id
    async getById(id: number): Promise<Sample> {
        const res = await apiGet<any>(`/v1/client/samples/${id}`);
        return unwrapData<Sample>(res);
    },

    // POST /v1/client/samples
    async createDraft(payload: ClientSampleDraftPayload): Promise<Sample> {
        const res = await apiPost<any>("/v1/client/samples", payload);
        return unwrapData<Sample>(res);
    },

    // PATCH /v1/client/samples/:id (via _method=PATCH)
    async updateDraft(id: number, payload: Partial<ClientSampleDraftPayload>): Promise<Sample> {
        const res = await apiPost<any>(`/v1/client/samples/${id}?_method=PATCH`, payload);
        return unwrapData<Sample>(res);
    },

    // POST /v1/client/samples/:id/submit (✅ submit sends payload now)
    async submit(id: number, payload: ClientSampleDraftPayload): Promise<Sample> {
        const res = await apiPost<any>(`/v1/client/samples/${id}/submit`, payload);
        return unwrapData<Sample>(res);
    },
};
