// frontend/src/services/loo.ts
import { apiPost } from "./api";

export type LooStatus =
    | "draft"
    | "signed_internal"
    | "sent_to_client"
    | "client_signed"
    | "locked"
    | (string & {});

export type LooSignatureRole = "OM" | "LH" | "CLIENT" | (string & {});

export type LooSignature = {
    lo_signature_id?: number;
    lo_id: number;
    role_code: LooSignatureRole;

    signed_by_staff?: number | null;
    signed_by_client?: number | null;
    signed_at?: string | null;

    signature_hash?: string | null;
    note?: string | null;

    created_at?: string | null;
    updated_at?: string | null;
};

export type LooItem = {
    lo_item_id?: number;
    lo_id: number;
    sample_id: number;
    lab_sample_code: string;
    parameters: Array<{
        parameter_id: number;
        code?: string | null;
        name?: string | null;
    }>;
    created_at?: string | null;
    updated_at?: string | null;
};

export type LetterOfOrder = {
    loo_id: number; // frontend naming (maps lo_id/loo_id)
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

    // ✅ Step 8/9: include details when backend returns loadMissing(['signatures','items'])
    signatures?: LooSignature[] | null;
    items?: LooItem[] | null;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

/**
 * Coerce various backend keys into LetterOfOrder.
 * Backend sometimes returns: lo_id / loo_id / id, number / loa_number / loo_number, etc.
 */
function coerceLoo(maybe: any): LetterOfOrder | null {
    if (!maybe || typeof maybe !== "object") return null;

    const directId = Number(maybe?.loo_id ?? maybe?.lo_id ?? maybe?.id ?? maybe?.loa_id ?? 0);
    if (!Number.isNaN(directId) && directId > 0) {
        const loo: LetterOfOrder = {
            loo_id: directId,
            sample_id: Number(maybe?.sample_id ?? maybe?.sampleId ?? 0),
            loo_number: maybe?.loo_number ?? maybe?.number ?? maybe?.loa_number ?? null,
            loo_status: (maybe?.loo_status ?? maybe?.status ?? maybe?.loa_status ?? null) as LooStatus | null,

            created_at: maybe?.created_at ?? maybe?.createdAt,
            updated_at: maybe?.updated_at ?? maybe?.updatedAt ?? null,

            signed_internal_at: maybe?.signed_internal_at ?? null,
            sent_to_client_at: maybe?.sent_to_client_at ?? null,
            client_signed_at: maybe?.client_signed_at ?? null,
            locked_at: maybe?.locked_at ?? null,

            pdf_url: maybe?.pdf_url ?? maybe?.file_url ?? maybe?.fileUrl ?? maybe?.pdfUrl ?? null,

            signatures: Array.isArray(maybe?.signatures) ? maybe.signatures : null,
            items: Array.isArray(maybe?.items) ? maybe.items : null,
        };
        return loo;
    }

    const keys = ["loo", "letter_of_order", "letterOfOrder", "loo_document", "looDoc", "loa", "data"];
    for (const k of keys) {
        const v = maybe?.[k];
        const coerced = coerceLoo(v);
        if (coerced) return coerced;
    }
    return null;
}

export type SelectedParamsMap = Record<number, number[]>; // sample_id -> parameter_ids[]

export const looService = {
    /**
     * Single-sample generate (legacy)
     * POST /v1/samples/:sampleId/loo
     */
    async generate(sampleId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/loo`);
        const data = unwrapData<any>(res);
        return (coerceLoo(data) ?? data) as LetterOfOrder;
    },

    /**
     * ✅ Step 8: Bulk generate for selected samples
     * POST /v1/samples/:anyId/loo with { sample_ids, parameters_map? }
     * (backend uses sampleId route but accepts sample_ids[] in body)
     */
    async generateForSamples(sampleIds: number[], paramsMap?: SelectedParamsMap): Promise<LetterOfOrder> {
        if (!Array.isArray(sampleIds) || sampleIds.length <= 0) {
            throw new Error("sampleIds is required");
        }

        // Backend currently validates sample_ids only.
        // If your controller also accepts parameters_map, we pass it too.
        const payload: any = { sample_ids: sampleIds };

        if (paramsMap && typeof paramsMap === "object") {
            payload.parameters_map = paramsMap;
        }

        // Use the first id for the route param (backend decides by presence of sample_ids)
        const anyId = Number(sampleIds[0]);

        const res = await apiPost<any>(`/v1/samples/${anyId}/loo`, payload);
        const data = unwrapData<any>(res);
        return (coerceLoo(data) ?? data) as LetterOfOrder;
    },

    /**
     * ✅ Step 9: Role-specific internal sign
     * POST /v1/loo/:looId/sign { role_code: "OM" | "LH" }
     */
    async signInternal(looId: number, roleCode: "OM" | "LH"): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loo/${looId}/sign`, { role_code: roleCode });
        const data = unwrapData<any>(res);
        return (coerceLoo(data) ?? data) as LetterOfOrder;
    },

    // keep existing (optional; client flow may be unused)
    async sendToClient(looId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loo/${looId}/send`);
        const data = unwrapData<any>(res);
        return (coerceLoo(data) ?? data) as LetterOfOrder;
    },

    async clientSign(looId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/client/loo/${looId}/sign`);
        const data = unwrapData<any>(res);
        return (coerceLoo(data) ?? data) as LetterOfOrder;
    },
};
