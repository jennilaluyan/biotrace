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

export async function getQualityCover(sampleId: number): Promise<QualityCover | null> {
    const res = await apiGet<any>(`/v1/samples/${sampleId}/quality-cover`);
    const payload = unwrapApi(res);
    return payload ? (payload as QualityCover) : null;
}

export async function saveQualityCoverDraft(
    sampleId: number,
    body: { method_of_analysis?: string; qc_payload?: any }
): Promise<QualityCover> {
    const res = await apiPut<any>(`/v1/samples/${sampleId}/quality-cover/draft`, body);
    const payload = unwrapApi(res);
    return payload as QualityCover;
}

export async function submitQualityCover(
    sampleId: number,
    body: { method_of_analysis: string; qc_payload: any }
): Promise<QualityCover> {
    const res = await apiPost<any>(`/v1/samples/${sampleId}/quality-cover/submit`, body);
    const payload = unwrapApi(res);
    return payload as QualityCover;
}
