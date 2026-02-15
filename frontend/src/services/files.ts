import { apiGetBlob } from "./api";

export type FileIdLike = number | string | null | undefined;

export type DownloadableLike = {
    download_url?: string | null;
    file_id?: FileIdLike;
    pdf_file_id?: FileIdLike;
    file_pdf_id?: FileIdLike;
    docx_file_id?: FileIdLike;
    file_docx_id?: FileIdLike;

    // legacy fallbacks (kalau masih ada)
    pdf_url?: string | null;
    file_url?: string | null;
};

export function toFileId(v: FileIdLike): number | null {
    if (v === null || v === undefined) return null;
    const n = typeof v === "string" ? Number(v) : v;
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Backend: GET /api/v1/files/{fileId}
 * FE convention (api.ts): pakai prefix "/v1/..." (baseURL sudah "/api").
 */
export function buildFileUrl(fileId: number, opts?: { download?: boolean }): string {
    const base = `/v1/files/${fileId}`;
    return opts?.download ? `${base}?download=1` : base;
}

/**
 * Ambil URL download yang paling “future-proof”:
 * 1) download_url (paling ideal, dari backend)
 * 2) file id fields (pdf_file_id / file_pdf_id / file_id / etc)
 * 3) legacy pdf_url/file_url (transisi lama)
 */
export function resolveDownloadUrl(input: DownloadableLike): string | null {
    const direct = (input?.download_url ?? "").trim();
    if (direct) return direct;

    const id =
        toFileId(input?.pdf_file_id) ??
        toFileId(input?.file_pdf_id) ??
        toFileId(input?.file_id) ??
        toFileId(input?.docx_file_id) ??
        toFileId(input?.file_docx_id);

    if (id) return buildFileUrl(id);

    const legacy = (input?.pdf_url ?? input?.file_url ?? "").trim();
    return legacy || null;
}

/**
 * Open URL in new tab. (Best for PDF inline streaming)
 * Fallback to <a> click if popup blocked.
 */
export function openUrlInNewTab(url: string, filename?: string) {
    const win = window.open(url, "_blank");
    if (win) return;

    // popup blocked => fallback anchor
    const a = document.createElement("a");
    a.href = url;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/**
 * Preview PDF by file_id using Blob URL (works even if server sets attachment).
 * Good fallback if inline streaming behaves oddly.
 */
export async function openPdfByFileId(fileId: number, filename?: string) {
    const blob = await apiGetBlob(buildFileUrl(fileId));
    const url = window.URL.createObjectURL(blob);

    openUrlInNewTab(url, filename ?? `FILE_${fileId}.pdf`);

    // cleanup
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}

/**
 * Force download using Blob (more reliable across browsers).
 */
export async function downloadByFileId(fileId: number, filename?: string) {
    const blob = await apiGetBlob(buildFileUrl(fileId, { download: true }));
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename ?? `FILE_${fileId}`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}
