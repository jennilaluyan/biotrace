// frontend/src/services/sampleArchive.ts
import { apiGet } from "./api";

export type PaginatedMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

export type ArchiveDocument = {
    type: string;
    label: string;
    file_url: string;
};

export type ArchiveTimelineEvent = {
    at: string; // ISO datetime
    title: string;
    actor_name?: string | null;
    note?: string | null;
    meta?: Record<string, any> | null;
};

export type SampleArchiveListItem = {
    sample_id: number;
    lab_sample_code?: string | null;
    workflow_group?: string | null;

    client_id?: number | null;
    client_name?: string | null;

    current_status?: string | null;
    request_status?: string | null;

    archived_at?: string | null;

    lo_id?: number | null;
    lo_number?: string | null;
    lo_generated_at?: string | null;
    lo_file_url?: string | null;

    coa_report_id?: number | null;
    coa_number?: string | null;
    coa_generated_at?: string | null;
    coa_file_url?: string | null;
};

export type SampleArchiveDetail = SampleArchiveListItem & {
    // Optional “rich” payloads from backend (best-effort)
    sample?: any;
    client?: any;

    requested_parameters?: Array<{ parameter_id: number; name: string }> | null;

    documents?: ArchiveDocument[] | null;
    timeline?: ArchiveTimelineEvent[] | null;

    // fallback container if backend returns different keys
    raw?: any;
};

function normalizeMeta(meta: any | undefined | null): PaginatedMeta | undefined {
    if (!meta) return undefined;

    // backend bisa pakai current_page atau page
    const current_page = Number(meta.current_page ?? meta.page ?? 1);
    const last_page = Number(meta.last_page ?? meta.lastPage ?? 1);
    const per_page = Number(meta.per_page ?? meta.perPage ?? 15);
    const total = Number(meta.total ?? 0);

    return { current_page, last_page, per_page, total };
}

export async function fetchSampleArchive(params: {
    q?: string;
    client_id?: number;
    page?: number;
    per_page?: number;
}): Promise<{ data: SampleArchiveListItem[]; meta?: PaginatedMeta }> {
    const queryParams: Record<string, any> = {};
    if (params.q) queryParams.q = params.q;
    if (typeof params.client_id === "number") queryParams.client_id = params.client_id;
    if (typeof params.page === "number") queryParams.page = params.page;
    if (typeof params.per_page === "number") queryParams.per_page = params.per_page;

    // ✅ apiGet expects AxiosRequestConfig, so use { params: ... }
    const res: any = await apiGet("/v1/samples/archive", { params: queryParams });

    return {
        data: (res?.data ?? []) as SampleArchiveListItem[],
        meta: normalizeMeta(res?.meta),
    };
}

export async function fetchSampleArchiveDetail(sampleId: number): Promise<{ data: SampleArchiveDetail }> {
    // ✅ match backend route: /v1/samples/archive/{id}
    const res: any = await apiGet(`/v1/samples/archive/${sampleId}`);
    return { data: (res?.data ?? null) as SampleArchiveDetail };
}
