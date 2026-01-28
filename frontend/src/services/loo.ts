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

    // backend bisa pakai number / loo_number, jadi kita allow dua-duanya
    number?: string | null;
    loo_number?: string | null;

    loo_status?: LooStatus | null;

    created_at?: string;
    updated_at?: string | null;

    signed_internal_at?: string | null;
    sent_to_client_at?: string | null;
    client_signed_at?: string | null;
    locked_at?: string | null;

    // backend kadang pakai file_url, kadang pdf_url
    file_url?: string | null;
    pdf_url?: string | null;
};

export type GenerateLooPayload = {
    /**
     * Batch mode: pilih banyak sample sekaligus.
     * Backend akan pakai sampleId pertama sebagai anchor.
     */
    sample_ids?: number[];

    /**
     * Optional: pilih parameter uji per sample (subset).
     * Key: sample_id, Value: array of parameter_id
     */
    parameter_ids_by_sample?: Record<number, number[]>;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

/**
 * Normalizer untuk memastikan URL PDF bisa dibaca konsisten
 * walau backend mengirim field berbeda.
 */
function normalizeLoo(loo: LetterOfOrder): LetterOfOrder {
    const out: LetterOfOrder = { ...loo };

    // prefer file_url, fallback to pdf_url
    if (!out.file_url && out.pdf_url) out.file_url = out.pdf_url;

    // number alias
    if (!out.number && out.loo_number) out.number = out.loo_number;

    return out;
}

export const looService = {
    /**
     * POST /v1/samples/:sampleId/loo (staff)
     * payload optional untuk batch & parameter selection
     */
    async generate(sampleId: number, payload?: GenerateLooPayload): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/loo`, payload ?? {});
        return normalizeLoo(unwrapData<LetterOfOrder>(res));
    },

    /**
     * Convenience helper: generate LOO dari banyak sample tanpa caller perlu tentukan anchor.
     */
    async generateForSamples(
        sampleIds: number[],
        parameterIdsBySample?: Record<number, number[]>
    ): Promise<LetterOfOrder> {
        const ids = (sampleIds ?? [])
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0);

        if (!ids.length) {
            throw new Error("sampleIds is required");
        }

        const anchor = ids[0];
        return this.generate(anchor, {
            sample_ids: ids,
            parameter_ids_by_sample: parameterIdsBySample ?? undefined,
        });
    },

    /**
     * POST /v1/loo/:looId/sign (staff internal sign)
     * NOTE: kalau backend sekarang sudah pakai signature slots, role_code bisa disesuaikan.
     */
    async signInternal(looId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loo/${looId}/sign`, { role_code: "OM" });
        return normalizeLoo(unwrapData<LetterOfOrder>(res));
    },

    /**
     * POST /v1/loo/:looId/send (staff send to client)
     */
    async sendToClient(looId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loo/${looId}/send`);
        return normalizeLoo(unwrapData<LetterOfOrder>(res));
    },

    /**
     * POST /v1/client/loo/:looId/sign (client sign)
     * NOTE: kalau route ini sudah kamu hapus (sesuai perubahan "LOO tidak untuk client"),
     * kamu boleh hapus method ini juga. Tapi aku biarkan dulu biar tidak merusak import lama.
     */
    async clientSign(looId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/client/loo/${looId}/sign`);
        return normalizeLoo(unwrapData<LetterOfOrder>(res));
    },
};
