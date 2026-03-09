import { apiGet, apiPatch, apiPost } from "./api";

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
    loo_id: number;
    lo_id?: number;

    sample_id: number;

    loo_number?: string | null;
    number?: string | null;

    loo_status?: LooStatus | null;
    loa_status?: LooStatus | null;

    payload?: any;

    created_at?: string;
    updated_at?: string | null;

    signed_internal_at?: string | null;
    sent_to_client_at?: string | null;
    client_signed_at?: string | null;
    locked_at?: string | null;

    pdf_file_id?: number | null;
    download_url?: string | null;
    record_no?: string | null;
    form_code?: string | null;
    pdf_url?: string | null;

    signatures?: LooSignature[] | null;
    items?: LooItem[] | null;

    included_sample_ids?: number[] | null;
    request_batch_id?: string | null;
    batch_total?: number | null;
};

export type LooApprovalState = {
    OM: boolean;
    LH: boolean;
    ready: boolean;
};

export type SelectedParamsMap = Record<number, number[]>;

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

function toIntOrNull(value: any): number | null {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

function toStrOrNull(value: any): string | null {
    const s = String(value ?? "").trim();
    return s ? s : null;
}

function toNumberArrayOrNull(value: any): number[] | null {
    if (!Array.isArray(value)) return null;

    const items = value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0);

    return items.length > 0 ? items : null;
}

function normalizeApprovalState(input: any): LooApprovalState {
    const OM = !!(input?.OM ?? input?.om);
    const LH = !!(input?.LH ?? input?.lh);
    const ready = !!(input?.ready ?? input?.is_ready ?? (OM && LH));
    return { OM, LH, ready };
}

function coerceLoo(maybe: any): LetterOfOrder | null {
    if (!maybe || typeof maybe !== "object") return null;

    const directId = Number(maybe?.loo_id ?? maybe?.lo_id ?? maybe?.id ?? maybe?.loa_id ?? 0);
    if (Number.isFinite(directId) && directId > 0) {
        const payload = maybe?.payload && typeof maybe.payload === "object" ? maybe.payload : null;

        const pdfFileId =
            toIntOrNull(maybe?.pdf_file_id ?? maybe?.pdfFileId) ??
            toIntOrNull(payload?.pdf_file_id ?? payload?.pdfFileId);

        const recordNo =
            toStrOrNull(maybe?.record_no ?? maybe?.recordNo) ??
            toStrOrNull(payload?.record_no ?? payload?.recordNo);

        const formCode =
            toStrOrNull(maybe?.form_code ?? maybe?.formCode) ??
            toStrOrNull(payload?.form_code ?? payload?.formCode);

        const downloadUrl =
            toStrOrNull(maybe?.download_url ?? maybe?.downloadUrl) ??
            toStrOrNull(payload?.download_url ?? payload?.downloadUrl);

        const includedSampleIds =
            toNumberArrayOrNull(maybe?.included_sample_ids) ??
            toNumberArrayOrNull(payload?.included_sample_ids);

        const requestBatchId =
            toStrOrNull(maybe?.request_batch_id) ??
            toStrOrNull(payload?.request_batch_id);

        const batchTotal =
            toIntOrNull(maybe?.batch_total) ??
            toIntOrNull(payload?.batch_total) ??
            (includedSampleIds ? includedSampleIds.length : null);

        return {
            loo_id: directId,
            lo_id: directId,

            sample_id: Number(maybe?.sample_id ?? maybe?.sampleId ?? 0),

            loo_number: maybe?.loo_number ?? maybe?.loa_number ?? maybe?.number ?? null,
            number: maybe?.number ?? maybe?.loo_number ?? maybe?.loa_number ?? null,

            loo_status: (maybe?.loo_status ?? maybe?.status ?? maybe?.loa_status ?? null) as LooStatus | null,
            loa_status: (maybe?.loa_status ?? maybe?.status ?? maybe?.loo_status ?? null) as LooStatus | null,

            payload: payload ?? maybe?.payload ?? null,

            created_at: maybe?.created_at ?? maybe?.createdAt,
            updated_at: maybe?.updated_at ?? maybe?.updatedAt ?? null,

            signed_internal_at: maybe?.signed_internal_at ?? null,
            sent_to_client_at: maybe?.sent_to_client_at ?? null,
            client_signed_at: maybe?.client_signed_at ?? null,
            locked_at: maybe?.locked_at ?? null,

            pdf_file_id: pdfFileId,
            download_url: downloadUrl,
            record_no: recordNo,
            form_code: formCode,

            pdf_url:
                maybe?.pdf_url ??
                maybe?.file_url ??
                maybe?.fileUrl ??
                maybe?.pdfUrl ??
                downloadUrl ??
                null,

            signatures: Array.isArray(maybe?.signatures) ? maybe.signatures : null,
            items: Array.isArray(maybe?.items) ? maybe.items : null,

            included_sample_ids: includedSampleIds,
            request_batch_id: requestBatchId,
            batch_total: batchTotal,
        };
    }

    const nestedKeys = [
        "loo",
        "letter_of_order",
        "letterOfOrder",
        "loo_document",
        "looDoc",
        "loa",
        "data",
    ];

    for (const key of nestedKeys) {
        const coerced = coerceLoo(maybe?.[key]);
        if (coerced) return coerced;
    }

    return null;
}

export const looService = {
    async generate(sampleId: number): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/loo`);
        const data = unwrapData<any>(res);
        return (coerceLoo(data) ?? data) as LetterOfOrder;
    },

    async generateForSamples(
        sampleIds: number[],
        paramsMap?: SelectedParamsMap
    ): Promise<LetterOfOrder> {
        if (!Array.isArray(sampleIds) || sampleIds.length === 0) {
            throw new Error("sampleIds is required");
        }

        const payload: any = { sample_ids: sampleIds };

        if (paramsMap && typeof paramsMap === "object") {
            payload.parameters_map = paramsMap;
        }

        const anyId = Number(sampleIds[0]);
        const res = await apiPost<any>(`/v1/samples/${anyId}/loo`, payload);
        const data = unwrapData<any>(res);
        return (coerceLoo(data) ?? data) as LetterOfOrder;
    },

    async signInternal(looId: number, roleCode: "OM" | "LH"): Promise<LetterOfOrder> {
        const res = await apiPost<any>(`/v1/loo/${looId}/sign`, { role_code: roleCode });
        const data = unwrapData<any>(res);
        return (coerceLoo(data) ?? data) as LetterOfOrder;
    },

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

    async getApprovals(sampleIds: number[]): Promise<Record<number, LooApprovalState>> {
        if (!Array.isArray(sampleIds) || sampleIds.length === 0) return {};

        const res = await apiGet<any>("/v1/loo/approvals", {
            params: { sample_ids: sampleIds },
        });

        const obj = (res?.data ?? res) as any;
        const raw = (obj?.data ?? obj) as any;
        const out: Record<number, LooApprovalState> = {};

        for (const [key, value] of Object.entries(raw ?? {})) {
            const sampleId = Number(key);
            if (!Number.isFinite(sampleId) || sampleId <= 0) continue;
            out[sampleId] = normalizeApprovalState(value);
        }

        return out;
    },

    async setApproval(
        sampleId: number,
        approved: boolean
    ): Promise<{ sample_id: number; state: LooApprovalState }> {
        if (!sampleId || sampleId <= 0) {
            throw new Error("sampleId is required");
        }

        const res = await apiPatch<any>(`/v1/loo/approvals/${sampleId}`, { approved });
        const obj = (res?.data ?? res) as any;
        const data = obj?.data ?? obj;

        return {
            sample_id: Number(data?.sample_id ?? sampleId),
            state: normalizeApprovalState(data?.state ?? data),
        };
    },
};