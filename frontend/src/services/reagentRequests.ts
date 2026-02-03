import { apiGet, apiPost } from "./api";

export type ReagentRequestStatus = "draft" | "submitted" | "approved" | "rejected";

export type ReagentRequestRow = {
    reagent_request_id: number;
    lo_id: number;
    cycle_no: number;
    status: ReagentRequestStatus;
    created_by_staff_id?: number | null;
    submitted_at?: string | null;
    submitted_by_staff_id?: number | null;
    approved_at?: string | null;
    approved_by_staff_id?: number | null;
    rejected_at?: string | null;
    rejected_by_staff_id?: number | null;
    reject_note?: string | null;
    pdf_url?: string | null;
    pdf_generated_at?: string | null;
    locked_at?: string | null;
    created_at?: string;
    updated_at?: string;
};

export type ReagentRequestItemRow = {
    reagent_request_item_id?: number;
    reagent_request_id?: number;
    catalog_item_id?: number | null;
    item_type?: string | null; // bhp | reagen
    item_name: string;
    specification?: string | null;
    qty: number;
    unit_id?: number | null;
    unit_text?: string | null;
    sort_order?: number;
    note?: string | null;
};

export type EquipmentBookingRow = {
    booking_id?: number;
    reagent_request_id?: number | null;
    lo_id?: number;
    equipment_id: number;
    planned_start_at: string;
    planned_end_at: string;
    note?: string | null;
};

export type DraftSavePayload = {
    lo_id: number;
    items?: Array<{
        catalog_id: number;
        qty: number;
        unit_text?: string | null;
        note?: string | null;
    }>;
    bookings?: Array<{
        booking_id?: number;
        equipment_id: number;
        planned_start_at: string;
        planned_end_at: string;
        note?: string | null;
    }>;
};

export async function getReagentRequestByLoo(loId: number) {
    return apiGet(`/v1/reagent-requests/loo/${loId}`);
}

export async function saveReagentRequestDraft(payload: DraftSavePayload) {
    return apiPost(`/v1/reagent-requests/draft`, payload);
}

export async function submitReagentRequest(requestId: number) {
    return apiPost(`/v1/reagent-requests/${requestId}/submit`, {});
}

export type ApproverInboxRow = ReagentRequestRow & {
    loo_number?: string | null;
    client_name?: string | null;
    created_by_name?: string | null;
    submitted_by_name?: string | null;
    items_count?: number | null;
    bookings_count?: number | null;
};

export type ApproverInboxResponse = {
    data: ApproverInboxRow[];
    meta: {
        page: number;
        per_page: number;
        total: number;
        total_pages: number;
    };
};

export async function getReagentApproverInbox(params?: {
    status?: "submitted" | "approved" | "rejected" | "draft" | "all";
    search?: string;
    page?: number;
    per_page?: number;
}) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.search) qs.set("search", params.search);
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));

    const q = qs.toString();
    return apiGet(`/v1/reagent-requests${q ? `?${q}` : ""}`);
}

export async function approveReagentRequest(requestId: number) {
    return apiPost(`/v1/reagent-requests/${requestId}/approve`, {});
}

export async function rejectReagentRequest(requestId: number, reject_note: string) {
    return apiPost(`/v1/reagent-requests/${requestId}/reject`, { reject_note });
}