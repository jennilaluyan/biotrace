import { apiGet } from "./api";

export type RequestStatus =
    | "draft"
    | "submitted"
    | "returned"
    | "needs_revision"
    | "ready_for_delivery"
    | "physically_received"
    | "rejected"
    | "in_transit_to_collector"
    | "under_inspection"
    | "inspection_failed_returned_to_admin"
    | "returned_to_admin"
    | "intake_checklist_passed"
    | "awaiting_verification"
    | "waiting_sample_id_assignment"
    | "sample_id_pending_verification"
    | "sample_id_approved_for_assignment"
    | "intake_validated"
    | "sc_delivered_to_analyst"
    | "analyst_received"
    | "analyst_returned_to_sc"
    | "sc_received_from_analyst"
    | string;

export type SampleRequestQueueRow = {
    sample_id?: number;
    id?: number;

    request_batch_id?: string | null;
    batch_total?: number;
    batch_active_total?: number;
    batch_excluded_total?: number;
    sample_ids?: number[];

    request_status?: RequestStatus;
    sample_type?: string | null;
    lab_sample_code?: string | null;

    client_id?: number | null;
    client_type?: string | null;
    client_name?: string | null;
    client_display_name?: string | null;
    client_email?: string | null;

    created_at?: string | null;
    updated_at?: string | null;

    [key: string]: any;
};

export type Paginator<T> = {
    current_page: number;
    data: T[];
    per_page: number;
    total: number;
    last_page: number;
};

export type SampleRequestQueueQuery = {
    page?: number;
    per_page?: number;
    q?: string;
    request_status?: string;
    submitted_from?: string;
    submitted_to?: string;
    date?: string;
    mode?: string;
    apply_to_batch?: boolean;
};

function ensurePaginator<T>(payload: any): Paginator<T> {
    const maybe = payload?.data && Array.isArray(payload?.data?.data) ? payload.data : payload;

    return {
        current_page: Number(maybe?.meta?.current_page ?? maybe?.current_page ?? 1),
        data: Array.isArray(maybe?.data) ? maybe.data : (Array.isArray(maybe?.data?.data) ? maybe.data.data : []),
        per_page: Number(maybe?.meta?.per_page ?? maybe?.per_page ?? 10),
        total: Number(maybe?.meta?.total ?? maybe?.total ?? 0),
        last_page: Number(maybe?.meta?.last_page ?? maybe?.last_page ?? 1),
    };
}

export async function fetchSampleRequestsQueue(query: SampleRequestQueueQuery): Promise<Paginator<SampleRequestQueueRow>> {
    const qs = new URLSearchParams();
    if (query.page) qs.set("page", String(query.page));
    qs.set("per_page", String(query.per_page ?? 10));
    if (query.q) qs.set("q", query.q);
    if (query.request_status) qs.set("request_status", query.request_status);
    if (query.submitted_from) qs.set("submitted_from", query.submitted_from);
    if (query.submitted_to) qs.set("submitted_to", query.submitted_to);
    if (query.date) qs.set("date", query.date);

    const payload = await apiGet<any>(`/v1/samples/requests?${qs.toString()}`);
    return ensurePaginator<SampleRequestQueueRow>(payload);
}