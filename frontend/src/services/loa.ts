import { apiPost } from "./api";

export type LoaStatus =
    | "draft"
    | "signed_internal"
    | "sent_to_client"
    | "client_signed"
    | "locked"
    | (string & {});

export type LetterOfOrder = {
    loa_id: number;
    sample_id: number;
    loa_number?: string | null;
    loa_status?: LoaStatus | null;

    // optional timestamps
    created_at?: string;
    updated_at?: string | null;
    signed_internal_at?: string | null;
    sent_to_client_at?: string | null;
    client_signed_at?: string | null;
    locked_at?: string | null;

    // optional file/url (kalau backend kasih)
    pdf_url?: string | null;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

export const loaService = {
    // POST /v1/samples/:sampleId/loa  (staff)
    async generate(sampleId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/loa`);
        return unwrapData<LetterOfOrder>(res);
    },

    // POST /v1/loa/:loaId/sign (staff internal sign)
    async signInternal(loaId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loa/${loaId}/sign`);
        return unwrapData<LetterOfOrder>(res);
    },

    // POST /v1/loa/:loaId/send (staff send to client)
    async sendToClient(loaId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loa/${loaId}/send`);
        return unwrapData<LetterOfOrder>(res);
    },

    // POST /v1/client/loa/:loaId/sign (client sign)
    async clientSign(loaId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/client/loa/${loaId}/sign`);
        return unwrapData<LetterOfOrder>(res);
    },
};
