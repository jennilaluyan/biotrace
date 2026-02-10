import { apiGet, apiPost, apiPut } from "./api";

export type QualityCoverStatus =
    | "draft"
    | "submitted"
    | "verified"
    | "validated"
    | "rejected"
    | string;

export type QualityCover = {
    quality_cover_id: number;
    sample_id: number;

    workflow_group?: string | null;
    status: QualityCoverStatus;

    parameter_id?: number | null;
    parameter_label?: string | null;

    date_of_analysis?: string | null;
    method_of_analysis?: string | null;
    checked_by_staff_id?: number | null;

    qc_payload?: any;
    submitted_at?: string | null;
    verified_at?: string | null;
    validated_at?: string | null;

    verified_by_staff_id?: number | null;
    validated_by_staff_id?: number | null;

    rejected_at?: string | null;
    rejected_by_staff_id?: number | null;
    reject_reason?: string | null;
};

export type InboxMeta = {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
};

export type QualityCoverInboxItem = QualityCover & {
    sample?: {
        sample_id: number;
        lab_sample_code?: string | null;
        workflow_group?: string | null;
        client?: { client_id: number; name?: string | null } | null;
    } | null;

    checked_by?: { staff_id: number; name?: string | null } | null;
    verified_by?: { staff_id: number; name?: string | null } | null;
    validated_by?: { staff_id: number; name?: string | null } | null;
};

export type CoaReportResult = {
    report_id: number;
    pdf_url?: string | null;
    template_code?: string | null;
    is_locked?: boolean;
} | null;

export type LhValidateResponse = {
    message: string;
    data: {
        quality_cover: QualityCoverInboxItem;
        report: CoaReportResult;
        coa_error?: string | null;
    };
};

export async function listOmInbox(params: { search?: string; per_page?: number; page?: number }) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.per_page) qs.set("per_page", String(params.per_page));
    if (params.page) qs.set("page", String(params.page));

    return apiGet<{ data: QualityCoverInboxItem[]; meta: InboxMeta }>(
        `/v1/quality-covers/inbox/om?${qs.toString()}`
    );
}

export async function listLhInbox(params: { search?: string; per_page?: number; page?: number }) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.per_page) qs.set("per_page", String(params.per_page));
    if (params.page) qs.set("page", String(params.page));

    return apiGet<{ data: QualityCoverInboxItem[]; meta: InboxMeta }>(
        `/v1/quality-covers/inbox/lh?${qs.toString()}`
    );
}

export async function omVerify(qualityCoverId: number) {
    return apiPost<{ message: string; data: QualityCoverInboxItem }>(
        `/v1/quality-covers/${qualityCoverId}/verify`,
        {}
    );
}

export async function omReject(qualityCoverId: number, reason: string) {
    return apiPost<{ message: string; data: QualityCoverInboxItem }>(
        `/v1/quality-covers/${qualityCoverId}/reject`,
        { reason }
    );
}

export async function lhValidate(qualityCoverId: number): Promise<LhValidateResponse> {
    return apiPost<LhValidateResponse>(`/v1/quality-covers/${qualityCoverId}/validate`, {});
}

export async function lhReject(qualityCoverId: number, reason: string) {
    return apiPost<{ message: string; data: QualityCoverInboxItem }>(
        `/v1/quality-covers/${qualityCoverId}/reject-lh`,
        { reason }
    );
}

function unwrapApi(res: any) {
    let x = res?.data ?? res;
    for (let i = 0; i < 5; i++) {
        if (x && typeof x === "object" && "data" in x && (x as any).data != null) {
            x = (x as any).data;
            continue;
        }
        break;
    }
    return x;
}

function extractBackendMessage(err: any): string | null {
    const status = err?.status ?? err?.response?.status ?? null;
    const data = err?.data ?? err?.response?.data ?? null;

    const msg =
        (typeof data === "string" && data) ||
        data?.message ||
        data?.error ||
        err?.message ||
        null;

    if (!status && !msg) return null;
    if (status && msg) return `HTTP ${status}: ${msg}`;
    if (status) return `HTTP ${status}`;
    return String(msg);
}

export async function getQualityCover(sampleId: number): Promise<QualityCover | null> {
    try {
        const res = await apiGet<any>(`/v1/samples/${sampleId}/quality-cover`);
        const payload = unwrapApi(res);
        return payload ? (payload as QualityCover) : null;
    } catch (e: any) {
        const status = e?.status ?? e?.response?.status ?? null;
        if (Number(status) === 404) return null;

        const msg = extractBackendMessage(e);
        throw new Error(msg || "Failed to load quality cover.");
    }
}

export async function getQualityCoverById(qualityCoverId: number): Promise<QualityCoverInboxItem> {
    try {
        const res = await apiGet<any>(`/v1/quality-covers/${qualityCoverId}`);
        const payload = unwrapApi(res);
        return payload as QualityCoverInboxItem;
    } catch (e: any) {
        const msg = extractBackendMessage(e);
        throw new Error(msg || "Failed to load quality cover detail.");
    }
}

export async function saveQualityCoverDraft(
    sampleId: number,
    body: { parameter_id?: number; parameter_label?: string; method_of_analysis?: string; qc_payload?: any }
): Promise<QualityCover> {
    try {
        const res = await apiPut<any>(`/v1/samples/${sampleId}/quality-cover/draft`, body);
        const payload = unwrapApi(res);
        return payload as QualityCover;
    } catch (e: any) {
        const msg = extractBackendMessage(e);
        throw new Error(msg || "Failed to save draft.");
    }
}

export async function submitQualityCover(
    sampleId: number,
    body: { parameter_id?: number; parameter_label?: string; method_of_analysis: string; qc_payload: any }
): Promise<QualityCover> {
    try {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/quality-cover/submit`, body);
        const payload = unwrapApi(res);
        return payload as QualityCover;
    } catch (e: any) {
        const msg = extractBackendMessage(e);

        const status = e?.status ?? e?.response?.status ?? null;
        if (Number(status) === 405) {
            throw new Error(
                (msg ? `${msg}. ` : "") +
                "Submit Quality Cover harus pakai POST ke /quality-cover/submit (backend menolak method lain)."
            );
        }

        throw new Error(msg || "Failed to submit quality cover.");
    }
}
