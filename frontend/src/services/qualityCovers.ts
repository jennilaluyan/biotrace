import { apiGet, apiPost, apiPut, apiDelete } from "./api";

/**
 * Quality Cover
 * - Draft filled by Analyst
 * - Verified by OM
 * - Validated by LH
 *
 * Fix 3 additions:
 * - Optional Google Drive link + notes
 * - Supporting documents (0..n files, any type)
 */

export type QualityCoverStatus =
    | "draft"
    | "submitted"
    | "verified"
    | "validated"
    | "rejected"
    | string;

export type SupportingFile = {
    file_id: number;
    original_name?: string | null;
    mime_type?: string | null;
    ext?: string | null;
    size_bytes?: number | null;
    created_at?: string | null;
};

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

    // ✅ Fix 3 (optional)
    supporting_drive_url?: string | null;
    supporting_notes?: string | null;

    /**
     * Supporting docs list.
     * Backend may return:
     * - supporting_files
     * - supportingFiles
     * - supportingFiles.data (depending on serializer)
     */
    supporting_files?: SupportingFile[];
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

export type CoaReportResult =
    | {
        report_id: number;
        pdf_url?: string | null;
        template_code?: string | null;
        is_locked?: boolean;
    }
    | null;

export type LhValidateResponse = {
    message: string;
    data: {
        quality_cover: QualityCoverInboxItem;
        report: CoaReportResult;
        coa_error?: string | null;
    };
};

export type SaveQualityCoverDraftBody = {
    parameter_id?: number | null;
    parameter_label?: string | null;
    method_of_analysis?: string | null;
    qc_payload?: any;

    // ✅ Fix 3
    supporting_drive_url?: string | null;
    supporting_notes?: string | null;
};

export type SubmitQualityCoverBody = {
    parameter_id?: number | null;
    parameter_label?: string | null;
    method_of_analysis: string;
    qc_payload: any;

    // ✅ Fix 3 (safe to send; backend may ignore on submit if not wired yet)
    supporting_drive_url?: string | null;
    supporting_notes?: string | null;
};

/**
 * Unwrap nested {data: ...} shapes (up to a few levels).
 * Our API responses are not always consistent across controllers.
 */
function unwrapApi<T = any>(res: any): T {
    let x = res?.data ?? res;
    for (let i = 0; i < 5; i++) {
        if (x && typeof x === "object" && "data" in x && (x as any).data != null) {
            x = (x as any).data;
            continue;
        }
        break;
    }
    return x as T;
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

function normalizeSupportingFiles(raw: any): SupportingFile[] {
    const list =
        raw?.supporting_files ??
        raw?.supportingFiles ??
        raw?.supporting_files?.data ??
        raw?.supportingFiles?.data ??
        [];

    if (!Array.isArray(list)) return [];

    return list
        .map((f: any) => ({
            file_id: Number(f?.file_id ?? f?.id ?? 0),
            original_name: f?.original_name ?? f?.originalName ?? null,
            mime_type: f?.mime_type ?? f?.mimeType ?? null,
            ext: f?.ext ?? null,
            size_bytes: f?.size_bytes ?? f?.sizeBytes ?? null,
            created_at: f?.created_at ?? f?.createdAt ?? null,
        }))
        .filter((f) => Number.isFinite(f.file_id) && f.file_id > 0);
}

function normalizeCover<T extends QualityCover | QualityCoverInboxItem>(raw: any): T {
    const c = unwrapApi<any>(raw) ?? {};
    const supporting_files = normalizeSupportingFiles(c);

    return {
        ...(c as any),
        supporting_files,
    } as T;
}

/* =========================
 * Inboxes (OM / LH)
 * ========================= */

export async function listOmInbox(params: { search?: string; per_page?: number; page?: number }) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.per_page) qs.set("per_page", String(params.per_page));
    if (params.page) qs.set("page", String(params.page));

    const res = await apiGet<any>(`/v1/quality-covers/inbox/om?${qs.toString()}`);

    // apiGet already returns the response body (res.data from axios),
    // so do NOT unwrap here.
    const payload = res ?? {};
    const items = Array.isArray(payload?.data) ? payload.data : [];

    return {
        ...(payload ?? {}),
        data: items.map((x: any) => normalizeCover<QualityCoverInboxItem>(x)),
    } as { data: QualityCoverInboxItem[]; meta: InboxMeta };
}

export async function listLhInbox(params: { search?: string; per_page?: number; page?: number }) {
    const qs = new URLSearchParams();
    if (params.search) qs.set("search", params.search);
    if (params.per_page) qs.set("per_page", String(params.per_page));
    if (params.page) qs.set("page", String(params.page));

    const res = await apiGet<any>(`/v1/quality-covers/inbox/lh?${qs.toString()}`);

    const payload = res ?? {};
    const items = Array.isArray(payload?.data) ? payload.data : [];

    return {
        ...(payload ?? {}),
        data: items.map((x: any) => normalizeCover<QualityCoverInboxItem>(x)),
    } as { data: QualityCoverInboxItem[]; meta: InboxMeta };
}

export async function omVerify(qualityCoverId: number) {
    const res = await apiPost<{ message: string; data: QualityCoverInboxItem }>(
        `/v1/quality-covers/${qualityCoverId}/verify`,
        {}
    );
    return {
        ...(res as any),
        data: normalizeCover<QualityCoverInboxItem>((res as any)?.data ?? res),
    } as any;
}

export async function omReject(qualityCoverId: number, reason: string) {
    const res = await apiPost<{ message: string; data: QualityCoverInboxItem }>(
        `/v1/quality-covers/${qualityCoverId}/reject`,
        { reason }
    );
    return {
        ...(res as any),
        data: normalizeCover<QualityCoverInboxItem>((res as any)?.data ?? res),
    } as any;
}

export async function lhValidate(qualityCoverId: number): Promise<LhValidateResponse> {
    const res = await apiPost<LhValidateResponse>(`/v1/quality-covers/${qualityCoverId}/validate`, {});
    // quality_cover nested; normalize just in case
    const payload = unwrapApi<any>(res);
    const qc = payload?.data?.quality_cover;
    if (qc) payload.data.quality_cover = normalizeCover<QualityCoverInboxItem>(qc);
    return payload as LhValidateResponse;
}

export async function lhReject(qualityCoverId: number, reason: string) {
    const res = await apiPost<{ message: string; data: QualityCoverInboxItem }>(
        `/v1/quality-covers/${qualityCoverId}/reject-lh`,
        { reason }
    );
    return {
        ...(res as any),
        data: normalizeCover<QualityCoverInboxItem>((res as any)?.data ?? res),
    } as any;
}

/* =========================
 * Detail (Analyst)
 * ========================= */

export async function getQualityCover(sampleId: number): Promise<QualityCover | null> {
    try {
        const res = await apiGet<any>(`/v1/samples/${sampleId}/quality-cover`);
        const payload = unwrapApi<any>(res);
        if (!payload) return null;
        return normalizeCover<QualityCover>(payload);
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
        const payload = unwrapApi<any>(res);
        return normalizeCover<QualityCoverInboxItem>(payload);
    } catch (e: any) {
        const msg = extractBackendMessage(e);
        throw new Error(msg || "Failed to load quality cover detail.");
    }
}

export async function saveQualityCoverDraft(sampleId: number, body: SaveQualityCoverDraftBody): Promise<QualityCover> {
    try {
        const res = await apiPut<any>(`/v1/samples/${sampleId}/quality-cover/draft`, body);
        const payload = unwrapApi<any>(res);
        return normalizeCover<QualityCover>(payload);
    } catch (e: any) {
        const msg = extractBackendMessage(e);
        throw new Error(msg || "Failed to save draft.");
    }
}

export async function submitQualityCover(sampleId: number, body: SubmitQualityCoverBody): Promise<QualityCover> {
    try {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/quality-cover/submit`, body);
        const payload = unwrapApi<any>(res);
        return normalizeCover<QualityCover>(payload);
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

/* =========================
 * Fix 3: Supporting documents
 * ========================= */

/**
 * Upload supporting documents (0..n). Any file types allowed.
 * Backend: POST /v1/quality-covers/{qualityCover}/supporting-files (multipart)
 */
export async function uploadQualityCoverSupportingDocs(qualityCoverId: number, files: File[]): Promise<QualityCover> {
    try {
        const form = new FormData();
        for (const f of files ?? []) {
            form.append("files[]", f);
        }

        const res = await apiPost<any>(`/v1/quality-covers/${qualityCoverId}/supporting-files`, form);
        const payload = unwrapApi<any>(res);
        return normalizeCover<QualityCover>(payload);
    } catch (e: any) {
        const msg = extractBackendMessage(e);
        throw new Error(msg || "Failed to upload supporting documents.");
    }
}

/**
 * Detach a supporting document from a QC (does not delete the file record).
 * Backend: DELETE /v1/quality-covers/{qualityCover}/supporting-files/{fileId}
 */
export async function deleteQualityCoverSupportingDoc(qualityCoverId: number, fileId: number): Promise<QualityCover> {
    try {
        const res = await apiDelete<any>(`/v1/quality-covers/${qualityCoverId}/supporting-files/${fileId}`);
        const payload = unwrapApi<any>(res);
        return normalizeCover<QualityCover>(payload);
    } catch (e: any) {
        const msg = extractBackendMessage(e);
        throw new Error(msg || "Failed to remove supporting document.");
    }
}