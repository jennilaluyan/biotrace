import { apiGet, apiPost } from "./api";

function unwrapApi(res: any) {
    let x = res?.data ?? res;
    for (let i = 0; i < 6; i++) {
        if (x && typeof x === "object" && "data" in x && (x as any).data != null) {
            x = (x as any).data;
            continue;
        }
        break;
    }
    return x;
}

export type SampleIdChangeRow = {
    change_request_id?: number;
    sample_id_change_id?: number;
    id?: number;

    sample_id?: number;
    request_id?: number;

    status?: string;

    suggested_sample_id?: string | null;
    suggested_lab_sample_code?: string | null;

    proposed_sample_id?: string | null;
    proposed_lab_sample_code?: string | null;

    client_name?: string | null;
    client_email?: string | null;

    workflow_group?: string | null;
    created_at?: string | null;
    submitted_at?: string | null;

    [key: string]: any;
};

export type InboxMeta = {
    page?: number;
    per_page?: number;
    total?: number;
    total_pages?: number;
    current_page?: number;
    last_page?: number;
};

const CHANGE_BASE = "/v1/sample-id-change-requests";
const SAMPLE_ID_ADMIN_BASE = "/v1/sample-requests";

export async function listSampleIdChanges(params: {
    status?: string;
    search?: string;
    page?: number;
    per_page?: number;
}) {
    const qs = new URLSearchParams();
    if (params.status && params.status !== "all") qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    qs.set("page", String(params.page ?? 1));
    qs.set("per_page", String(params.per_page ?? 25));

    const res = await apiGet<any>(`${CHANGE_BASE}${qs.toString() ? `?${qs.toString()}` : ""}`);
    const payload = unwrapApi(res);

    const data: SampleIdChangeRow[] = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload)
            ? payload
            : [];

    const meta: InboxMeta | null = payload?.meta ?? null;

    return { data, meta };
}

export async function getLatestSampleIdChangeBySampleId(sampleId: number) {
    const res = await apiGet<any>(`${CHANGE_BASE}/by-sample/${sampleId}`);
    return unwrapApi(res) as any; // bisa null kalau tidak ada
}

export async function approveSampleIdChange(changeId: number) {
    const res = await apiPost<any>(`${CHANGE_BASE}/${changeId}/approve`, {});
    return unwrapApi(res);
}

export async function rejectSampleIdChange(changeId: number, reason: string) {
    const body = { reason, note: reason };
    const res = await apiPost<any>(`${CHANGE_BASE}/${changeId}/reject`, body);
    return unwrapApi(res);
}

export async function getSuggestedSampleId(sampleId: number): Promise<string | null> {
    const res = await apiGet<any>(`${SAMPLE_ID_ADMIN_BASE}/${sampleId}/sample-id/suggestion`);
    const payload = unwrapApi(res);

    const v =
        payload?.suggested_sample_id ??
        payload?.suggested_lab_sample_code ??
        payload?.data?.suggested_sample_id ??
        payload?.data?.suggested_lab_sample_code ??
        null;

    return v ? String(v) : null;
}

export async function assignSampleId(sampleId: number, sampleIdOverride?: string) {
    const body = sampleIdOverride ? { sample_id: sampleIdOverride } : {};
    const res = await apiPost<any>(`${SAMPLE_ID_ADMIN_BASE}/${sampleId}/sample-id/assign`, body);
    return unwrapApi(res);
}

export async function proposeSampleIdChange(sampleId: number, proposedSampleId: string, note?: string) {
    const body = {
        proposed_sample_id: proposedSampleId,
        note: note?.trim() ? note.trim() : undefined,
    };

    const res = await apiPost<any>(`${SAMPLE_ID_ADMIN_BASE}/${sampleId}/sample-id/propose-change`, body);
    return unwrapApi(res);
}
