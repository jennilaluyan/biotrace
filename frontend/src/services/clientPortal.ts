import { apiGet, apiPatch, apiPost } from "./api";

export type ClientSample = {
    id: number;
    status?: string;
    request_status?: string;

    created_at?: string;
    updated_at?: string;

    // request/intake related common fields
    code?: string;
    sample_code?: string;
    lab_sample_code?: string;

    sample_type?: string;

    title?: string;
    name?: string;
    description?: string;
    notes?: string;

    // allow extra props safely
    [key: string]: any;
};

export type ClientSampleListResponse =
    | { data: ClientSample[] }
    | ClientSample[]
    | { samples: ClientSample[] };

const normalizeList = (res: ClientSampleListResponse): ClientSample[] => {
    if (Array.isArray(res)) return res;
    if (Array.isArray((res as any)?.data)) return (res as any).data;
    if (Array.isArray((res as any)?.samples)) return (res as any).samples;
    return [];
};

export type CreateClientSamplePayload = {
    sample_type: string;
    received_at?: string | null;
    priority?: number;
    contact_history?: string | null;
    examination_purpose?: string | null;
    additional_notes?: string | null;
    title?: string | null;
    name?: string | null;
    consent?: boolean;
};

export const clientPortal = {
    async listSamples(): Promise<ClientSample[]> {
        const res = await apiGet<ClientSampleListResponse>("/v1/client/samples");
        return normalizeList(res);
    },

    async createDraft(payload: CreateClientSamplePayload): Promise<ClientSample> {
        const res = await apiPost<any>("/v1/client/samples", payload);
        // support either {data:{...}} or plain object
        return (res as any)?.data ?? res;
    },

    async getSample(id: number | string): Promise<ClientSample> {
        const res = await apiGet<any>(`/v1/client/samples/${id}`);
        return (res as any)?.data ?? res;
    },

    async updateSample(id: number | string, payload: Record<string, any>): Promise<ClientSample> {
        const res = await apiPatch<any>(`/v1/client/samples/${id}`, payload);
        return (res as any)?.data ?? res;
    },

    async submitSample(id: number | string): Promise<any> {
        return apiPost<any>(`/v1/client/samples/${id}/submit`, {});
    },
};
