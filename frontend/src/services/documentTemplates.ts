import { apiGet, apiPatch, apiPostRaw } from "./api";

export type DocumentTemplate = {
    doc_code: string;
    title?: string | null;
    kind?: "template" | "general" | (string & {});
    is_active?: boolean;

    record_no_prefix?: string | null;
    form_code_prefix?: string | null;
    revision_no?: number | null;

    current_version_id?: number | null;
    current_version?: DocumentTemplateVersion | null;

    updated_at?: string | null;
    created_at?: string | null;
};

export type DocumentTemplateVersion = {
    doc_version_id: number;
    doc_code: string;
    version: number;
    file_id: number;

    created_by?: number | null;
    created_at?: string | null;

    // optional (kalau backend ikut kirim metadata file)
    original_name?: string | null;
    mime_type?: string | null;
    size_bytes?: number | null;
};

export type UpdateDocumentTemplatePayload = {
    title?: string | null;
    kind?: "template" | "general" | (string & {});
    is_active?: boolean;

    record_no_prefix?: string | null;
    form_code_prefix?: string | null;
    revision_no?: number | null;
};

function pickData<T>(res: any): T {
    // apiGet/apiPatch/apiPostRaw biasanya sudah normalizeData(res.data)
    // backend konvensi: { data: ... }
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

export async function listDocumentTemplates(): Promise<DocumentTemplate[]> {
    const res = await apiGet(`/v1/document-templates`);
    return pickData<DocumentTemplate[]>(res) ?? [];
}

export async function updateDocumentTemplate(
    docCode: string,
    payload: UpdateDocumentTemplatePayload
): Promise<DocumentTemplate> {
    const res = await apiPatch(`/v1/document-templates/${encodeURIComponent(docCode)}`, payload);
    return pickData<DocumentTemplate>(res);
}

/**
 * Upload template DOCX version (multipart).
 * Endpoint: POST /api/v1/document-templates/{doc_code}/versions
 *
 * Backend biasanya expect field name: "file"
 */
export async function uploadDocumentTemplateVersion(
    docCode: string,
    file: File
): Promise<DocumentTemplate> {
    const fd = new FormData();
    fd.append("file", file, file.name);

    const res = await apiPostRaw(`/v1/document-templates/${encodeURIComponent(docCode)}/versions`, fd, {
        headers: {
            // jangan set Content-Type manual (biar boundary benar)
            Accept: "application/json",
        },
    });

    return pickData<DocumentTemplate>(res);
}

export async function toggleDocumentTemplateActive(docCode: string, isActive: boolean) {
    return updateDocumentTemplate(docCode, { is_active: isActive });
}
