// frontend/src/services/qc.ts
import { apiGet, apiPost } from "./api";

export type QcStatus = "pass" | "warning" | "fail";

export type QcControl = {
    qc_control_id: number;
    name?: string | null;
    code?: string | null;
    description?: string | null;
};

export type QcSummary = {
    batch_id?: number | null;
    status: QcStatus;
    counts: {
        pass: number;
        warning: number;
        fail: number;
    };
};

export type QcRun = {
    qc_run_id: number;
    batch_id?: number | null;
    qc_control_id: number;
    value: number | string;
    z_score?: number | string | null;
    violations?: string[] | null;
    status: QcStatus;
    created_by?: number | null;
    created_at?: string | null;
};

export type QcSummaryResponse = {
    sample_id: number;
    summary: QcSummary;
    qc_runs: QcRun[];
};

export type QcControlsForSampleResponse = {
    sample_id: number;
    qc_controls: QcControl[];
};

export type CreateQcRunResponse = {
    sample_id: number;
    qc_run: QcRun;
    summary: QcSummary;
};

type ApiEnvelope<T> = {
    status: number;
    message?: string;
    data: T;
};

/** unwrap: support res = ApiEnvelope<T> atau res = T */
function unwrap<T>(res: any): T {
    if (!res) return res as T;
    if (typeof res === "object" && "data" in res && "status" in res) {
        return (res as ApiEnvelope<T>).data;
    }
    return res as T;
}

function unwrapList<T>(res: any): T[] {
    if (!res) return [];
    if (Array.isArray(res)) return res as T[];

    const top = res?.data ?? res; // could be envelope.data or raw

    // paginator: { data: { data: [...] } } OR { data: [...] }
    if (Array.isArray(top)) return top as T[];
    if (Array.isArray(top?.data)) return top.data as T[];

    // common keys
    if (Array.isArray(top?.qc_controls)) return top.qc_controls as T[];
    if (Array.isArray(top?.qcControls)) return top.qcControls as T[];

    return [];
}

/** GET /samples/{id}/qc-summary */
export async function getQcSummary(sampleId: number): Promise<QcSummaryResponse> {
    const res = await apiGet<any>(`/v1/samples/${sampleId}/qc-summary`);
    return unwrap<QcSummaryResponse>(res);
}

/** GET /samples/{id}/qc-controls */
export async function getQcControlsForSample(sampleId: number): Promise<QcControl[]> {
    const res = await apiGet<any>(`/v1/samples/${sampleId}/qc-controls`);
    const data = unwrap<QcControlsForSampleResponse>(res);
    return data?.qc_controls ?? [];
}

/** GET /qc-controls (global list) */
export async function listQcControlsGlobal(): Promise<QcControl[]> {
    const res = await apiGet<any>(`/v1/qc-controls`);
    return unwrapList<QcControl>(res);
}

/**
 * listQcControls(sampleId?)
 * - kalau sampleId ada: coba sample-scoped dulu, kalau kosong -> fallback global
 * - kalau sampleId tidak ada: langsung global
 */
export async function listQcControls(sampleId?: number): Promise<QcControl[]> {
    if (sampleId && Number.isFinite(sampleId)) {
        const scoped = await getQcControlsForSample(sampleId);
        if (scoped.length > 0) return scoped;
        return listQcControlsGlobal();
    }
    return listQcControlsGlobal();
}

/** POST /samples/{id}/qc-runs */
export async function createQcRun(
    sampleId: number,
    payload: { qc_control_id: number; value: number; note?: string }
): Promise<CreateQcRunResponse> {
    const res = await apiPost<any>(`/v1/samples/${sampleId}/qc-runs`, payload);
    return unwrap<CreateQcRunResponse>(res);
}

/** optional: keep object-style service for other usages */
export const qcService = {
    getQcSummary,
    getQcControlsForSample,
    listQcControls,
    listQcControlsGlobal,
    createQcRun,
};
