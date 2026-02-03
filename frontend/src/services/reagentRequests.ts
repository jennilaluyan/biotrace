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
