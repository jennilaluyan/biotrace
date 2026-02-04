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

function isNotFound(err: any) {
    const status = err?.status ?? err?.response?.status ?? err?.data?.status ?? null;
    return Number(status) === 404;
}

export async function getQualityCover(sampleId: number): Promise<QualityCover | null> {
    try {
        const res = await apiGet<any>(`/v1/samples/${sampleId}/quality-cover`);
        const payload = unwrapApi(res);
        return payload ? (payload as QualityCover) : null;
    } catch (e: any) {
        // ✅ If backend returns 404 when not created yet, treat as "no cover"
        if (isNotFound(e)) return null;
        throw e;
    }
}

export async function saveQualityCoverDraft(
    sampleId: number,
    body: { method_of_analysis?: string; qc_payload?: any }
): Promise<QualityCover> {
    const res = await apiPut<any>(`/v1/samples/${sampleId}/quality-cover/draft`, body);
    const payload = unwrapApi(res);
    return payload as QualityCover;
}

/**
 * ✅ FIX (404 submit):
 * Some envs don't have `/quality-cover/submit` route.
 * We try a small set of compatible fallbacks.
 */
export async function submitQualityCover(
    sampleId: number,
    body: { method_of_analysis: string; qc_payload: any }
): Promise<QualityCover> {
    // 1) primary (current FE)
    try {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/quality-cover/submit`, body);
        const payload = unwrapApi(res);
        return payload as QualityCover;
    } catch (e1: any) {
        if (!isNotFound(e1)) throw e1;

        // 2) fallback: submit via POST base resource
        try {
            const res2 = await apiPost<any>(`/v1/samples/${sampleId}/quality-cover`, {
                ...body,
                submit: true,
            });
            const payload2 = unwrapApi(res2);
            return payload2 as QualityCover;
        } catch (e2: any) {
            if (!isNotFound(e2)) throw e2;

            // 3) fallback: some backends expose submit as PUT
            const res3 = await apiPut<any>(`/v1/samples/${sampleId}/quality-cover/submit`, body);
            const payload3 = unwrapApi(res3);
            return payload3 as QualityCover;
        }
    }
}
