import { apiPost } from "./api";

export type LooStatus =
    | "draft"
    | "signed_internal"
    | "sent_to_client"
    | "client_signed"
    | "locked"
    | (string & {});

export type LetterOfOrder = {
    loo_id: number;
    sample_id: number;
    loo_number?: string | null;
    loo_status?: LooStatus | null;

    created_at?: string;
    updated_at?: string | null;

    signed_internal_at?: string | null;
    sent_to_client_at?: string | null;
    client_signed_at?: string | null;
    locked_at?: string | null;

    pdf_url?: string | null;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

export const looService = {
    // POST /v1/samples/:sampleId/loo (staff)
    async generate(sampleId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/loo`);
        return unwrapData<LetterOfOrder>(res);
    },

    // POST /v1/loo/:looId/sign (staff internal sign)
    async signInternal(looId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loo/${looId}/sign`, { role_code: "OM" });
        return unwrapData<LetterOfOrder>(res);
    },

    // POST /v1/loo/:looId/send (staff send to client)
    async sendToClient(looId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loo/${looId}/send`);
        return unwrapData<LetterOfOrder>(res);
    },

    // POST /v1/client/loo/:looId/sign (client sign)
    async clientSign(looId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/client/loo/${looId}/sign`);
        return unwrapData<LetterOfOrder>(res);
    },
};
