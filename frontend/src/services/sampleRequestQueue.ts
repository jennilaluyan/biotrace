import { apiGet } from "./api";
import type { PaginatedResponse, Sample } from "./samples";

export type SampleRequestQueueParams = {
    page?: number;
    per_page?: number;
    request_status?: string; // filter
    from?: string; // YYYY-MM-DD
    to?: string;   // YYYY-MM-DD
    client_id?: number;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

function unwrapPaginatedFlexible<T>(res: any): PaginatedResponse<T> {
    if (res && typeof res === "object" && "data" in res && "meta" in res) return res as PaginatedResponse<T>;
    const inner = unwrapData<any>(res);
    if (inner && typeof inner === "object" && "data" in inner && "meta" in inner) return inner as PaginatedResponse<T>;
    return { data: [], meta: { current_page: 1, last_page: 1, per_page: 10, total: 0 } };
}

export const sampleRequestQueueService = {
    // GET /v1/samples/requests
    async list(params: SampleRequestQueueParams = {}): Promise<PaginatedResponse<Sample>> {
        const qs = new URLSearchParams();
        if (params.page) qs.set("page", String(params.page));
        if (params.per_page) qs.set("per_page", String(params.per_page));
        if (params.request_status) qs.set("request_status", params.request_status);
        if (params.from) qs.set("from", params.from);
        if (params.to) qs.set("to", params.to);
        if (params.client_id) qs.set("client_id", String(params.client_id));

        const url = `/v1/samples/requests${qs.toString() ? `?${qs.toString()}` : ""}`;
        const res = await apiGet<any>(url);
        return unwrapPaginatedFlexible<Sample>(res);
    },
};
