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
    download_url?: string | null;
};

export type ArchiveTimelineEvent = {
    at: string;
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
    sample?: any;
    client?: any;

    requested_parameters?: Array<{ parameter_id: number; name: string }> | null;

    documents?: ArchiveDocument[] | null;
    timeline?: ArchiveTimelineEvent[] | null;

    raw?: any;
};

type ListResponse = { data: SampleArchiveListItem[]; meta?: PaginatedMeta };

const LIST_ENDPOINTS = ["/v1/sample-archive", "/v1/samples/archive"] as const;

function isMetaLike(x: any): x is PaginatedMeta {
    return (
        x &&
        typeof x === "object" &&
        typeof x.current_page === "number" &&
        typeof x.last_page === "number" &&
        typeof x.per_page === "number" &&
        typeof x.total === "number"
    );
}

function normalizeListPayload(payload: any): ListResponse {
    if (payload && Array.isArray(payload.data)) {
        return { data: payload.data, meta: isMetaLike(payload.meta) ? payload.meta : undefined };
    }

    if (payload && Array.isArray(payload.data) && typeof payload.current_page === "number") {
        return {
            data: payload.data,
            meta: {
                current_page: payload.current_page,
                last_page: payload.last_page ?? payload.current_page,
                per_page: payload.per_page ?? payload.data.length,
                total: payload.total ?? payload.data.length,
            },
        };
    }

    const inner = payload?.data;
    if (inner && Array.isArray(inner.data)) {
        return {
            data: inner.data,
            meta: isMetaLike(inner.meta)
                ? inner.meta
                : typeof inner.current_page === "number"
                    ? {
                        current_page: inner.current_page,
                        last_page: inner.last_page ?? inner.current_page,
                        per_page: inner.per_page ?? inner.data.length,
                        total: inner.total ?? inner.data.length,
                    }
                    : undefined,
        };
    }

    if (Array.isArray(payload)) return { data: payload, meta: undefined };

    return { data: [], meta: undefined };
}

function normalizeDetailPayload(payload: any): { data: SampleArchiveDetail } {
    if (payload && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
        return { data: payload.data as SampleArchiveDetail };
    }
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
        return { data: payload as SampleArchiveDetail };
    }
    return { data: { sample_id: 0, raw: payload } as SampleArchiveDetail };
}

async function apiGetWith404Fallback<T>(paths: string[], options?: any): Promise<T> {
    let lastErr: any = null;

    for (const p of paths) {
        try {
            return await apiGet<T>(p, options);
        } catch (err: any) {
            lastErr = err;
            if (err?.status === 404) continue;
            throw err;
        }
    }

    throw lastErr;
}

export async function fetchSampleArchive(params: {
    q?: string;
    client_id?: number;
    page?: number;
    per_page?: number;
}): Promise<{ data: SampleArchiveListItem[]; meta?: PaginatedMeta }> {
    const payload = await apiGetWith404Fallback<any>([...LIST_ENDPOINTS], { params });
    return normalizeListPayload(payload);
}

export async function fetchSampleArchiveDetail(sampleId: number): Promise<{ data: SampleArchiveDetail }> {
    const paths = LIST_ENDPOINTS.map((base) => `${base}/${sampleId}`);
    const payload = await apiGetWith404Fallback<any>(paths);
    return normalizeDetailPayload(payload);
}
