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

function unwrapPaginatedFlexible<T>(res: any): PaginatedResponse<T> {
    // preferred shape: { data, meta }
    if (res && typeof res === "object" && "data" in res && "meta" in res) {
        return res as PaginatedResponse<T>;
    }

    // nested envelope: { data: { data, meta } }
    const inner = unwrapData<any>(res);
    if (inner && typeof inner === "object" && "data" in inner && "meta" in inner) {
        return inner as PaginatedResponse<T>;
    }

    // array fallback
    if (Array.isArray(inner)) {
        return {
            data: inner as T[],
            meta: { current_page: 1, last_page: 1, per_page: inner.length, total: inner.length },
        };
    }

    // safe empty
    return { data: [], meta: { current_page: 1, last_page: 1, per_page: 10, total: 0 } };
}

function getSampleId(sample: any): number | null {
    const raw = sample?.sample_id ?? sample?.id ?? sample?.request_id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function setQs(qs: URLSearchParams, key: string, val: unknown) {
    if (val === undefined || val === null) return;
    const s = String(val).trim();
    if (!s) return;
    qs.set(key, s);
}

export type ClientSampleDraftPayload = {
    sample_type: string;
    scheduled_delivery_at?: string | null;
    examination_purpose?: string | null;
    additional_notes?: string | null;
    parameter_ids: number[];
    quantity?: number | null;
    total_sample?: number | null;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

function unwrapRequestSampleResponse<T extends Record<string, any>>(res: any): T {
    const root = res?.data ?? res;
    const data = unwrapData<T>(res);
    const meta = root?.meta ?? res?.meta ?? null;

    if (!data || typeof data !== "object" || Array.isArray(data)) {
        return data;
    }

    const batchTotal = Number(
        meta?.batch_total ??
        data?.request_batch_total ??
        data?.batch_summary?.batch_total ??
        0
    );

    const requestBatchId =
        data?.request_batch_id ??
        data?.batch_summary?.request_batch_id ??
        meta?.request_batch_id ??
        null;

    return {
        ...data,
        request_batch_id: requestBatchId,
        request_batch_total: batchTotal > 0 ? batchTotal : (data?.request_batch_total ?? null),
        batch_summary:
            data?.batch_summary ??
            (batchTotal > 0
                ? {
                    request_batch_id: requestBatchId,
                    batch_total: batchTotal,
                    batch_active_total: batchTotal,
                    batch_excluded_total: 0,
                }
                : null),
    } as T;
}

export type ClientSampleBatchMeta = {
    request_batch_id?: string | null;
    request_batch_total?: number | null;
    request_batch_item_no?: number | null;
    is_batch_primary?: boolean;
    batch_excluded_at?: string | null;
    batch_exclusion_reason?: string | null;
};

export type ClientSampleResponse = Sample & ClientSampleBatchMeta;

export const clientSampleRequestService = {
    async createDraft(payload: ClientSampleDraftPayload): Promise<ClientSampleResponse> {
        const res = await apiPost<any>("/v1/client/samples", payload);
        return unwrapRequestSampleResponse<ClientSampleResponse>(res);
    },

    async updateDraft(
        id: number,
        payload: Partial<ClientSampleDraftPayload>
    ): Promise<ClientSampleResponse> {
        const res = await apiPost<any>(`/v1/client/samples/${id}?_method=PATCH`, payload);
        return unwrapRequestSampleResponse<ClientSampleResponse>(res);
    },

    async submit(id: number, payload: ClientSampleDraftPayload): Promise<ClientSampleResponse> {
        const res = await apiPost<any>(`/v1/client/samples/${id}/submit`, payload);
        return unwrapRequestSampleResponse<ClientSampleResponse>(res);
    },

    async createAndSubmit(payload: ClientSampleDraftPayload): Promise<ClientSampleResponse> {
        const draft = await this.createDraft(payload);
        const sid = getSampleId(draft);

        if (!sid) {
            throw new Error("Created request has no valid sample_id.");
        }

        return this.submit(sid, payload);
    },
};