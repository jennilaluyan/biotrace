import { apiGet } from "./api";

export type RequestStatus =
    | "draft"
    | "submitted"
    | "returned"
    | "ready_for_delivery"
    | "physically_received"
    | string;

export type SampleRequestQueueRow = {
    // id fields (backend bisa beda-beda)
    sample_id?: number;
    id?: number;

    // request meta
    request_status?: RequestStatus;
    request_status_label?: string | null;

    // sample basics
    sample_type?: string | null;
    title?: string | null;
    name?: string | null;
    code?: string | null; // kalau ada code / request code
    lab_sample_code?: string | null;

    // client info (opsional)
    client_id?: number | null;
    client_name?: string | null;

    // timestamps
    created_at?: string | null;
    updated_at?: string | null;

    // extra fields (biar ga brittle kalau backend kirim lebih)
    [key: string]: any;
};

export type Paginator<T> = {
    current_page: number;
    data: T[];
    per_page: number;
    total: number;
    last_page: number;

    // optional laravel-style keys
    from?: number | null;
    to?: number | null;
    first_page_url?: string | null;
    last_page_url?: string | null;
    next_page_url?: string | null;
    prev_page_url?: string | null;
    path?: string | null;
};

export type SampleRequestQueueQuery = {
    page?: number;
    per_page?: number;
    q?: string; // search keyword
    status?: string; // request_status filter
    date?: string; // optional, kalau backend support
};

function ensurePaginator<T>(payload: any): Paginator<T> {
    // apiGet kadang return payload langsung, kadang payload.data
    const maybe = payload?.data && Array.isArray(payload?.data?.data) ? payload.data : payload;

    // minimal normalization
    const pager: Paginator<T> = {
        current_page: Number(maybe?.current_page ?? 1),
        data: Array.isArray(maybe?.data) ? maybe.data : [],
        per_page: Number(maybe?.per_page ?? 10),
        total: Number(maybe?.total ?? (Array.isArray(maybe?.data) ? maybe.data.length : 0)),
        last_page: Number(maybe?.last_page ?? 1),

        from: maybe?.from ?? null,
        to: maybe?.to ?? null,
        first_page_url: maybe?.first_page_url ?? null,
        last_page_url: maybe?.last_page_url ?? null,
        next_page_url: maybe?.next_page_url ?? null,
        prev_page_url: maybe?.prev_page_url ?? null,
        path: maybe?.path ?? null,
    };

    return pager;
}

export async function fetchSampleRequestsQueue(
    query: SampleRequestQueueQuery
): Promise<Paginator<SampleRequestQueueRow>> {
    const qs = new URLSearchParams();
    if (query.page) qs.set("page", String(query.page));
    qs.set("per_page", String(query.per_page ?? 10));
    if (query.q) qs.set("q", query.q);
    if (query.status) qs.set("status", query.status);
    if (query.date) qs.set("date", query.date);

    const payload = await apiGet<any>(`/v1/samples/requests?${qs.toString()}`);
    return ensurePaginator<SampleRequestQueueRow>(payload);
}
