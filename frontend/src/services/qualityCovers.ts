// L:\Campus\Final Countdown\biotrace\frontend\src\services\qualityCovers.ts
import { apiGet, apiPost, apiPut } from "./api";

export type QualityCover = {
    quality_cover_id: number;
    sample_id: number;
    workflow_group?: string | null;
    status: "draft" | "submitted" | string;
    date_of_analysis?: string | null;
    method_of_analysis?: string | null;
    checked_by_staff_id?: number | null;
    qc_payload?: any;
    submitted_at?: string | null;
};

// unwrap like other pages (handles {data: ...} nesting)
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
    // handleAxios() throws: { status, data }
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
        // If backend returns 404 when not created yet, treat as "no cover"
        const status = e?.status ?? e?.response?.status ?? null;
        if (Number(status) === 404) return null;

        const msg = extractBackendMessage(e);
        throw new Error(msg || "Failed to load quality cover.");
    }
}

export async function saveQualityCoverDraft(
    sampleId: number,
    body: { method_of_analysis?: string; qc_payload?: any }
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

/**
 * ✅ FIX:
 * Backend kamu mendukung: POST /v1/samples/:id/quality-cover/submit
 * (terbukti dari error 405 yang bilang supported methods: POST)
 *
 * Jadi submit HARUS pakai POST, jangan PUT/PATCH.
 */
export async function submitQualityCover(
    sampleId: number,
    body: { method_of_analysis: string; qc_payload: any }
): Promise<QualityCover> {
    try {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/quality-cover/submit`, body);
        const payload = unwrapApi(res);
        return payload as QualityCover;
    } catch (e: any) {
        const msg = extractBackendMessage(e);

        // kalau masih 405, kasih hint yang spesifik biar gampang debug
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
