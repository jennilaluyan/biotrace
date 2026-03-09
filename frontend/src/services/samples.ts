import { apiGet, apiPost, apiPatch } from "./api";

// --- backend detail statuses (current_status)
export type SampleStatus =
    | "received"
    | "in_progress"
    | "testing_completed"
    | "verified"
    | "validated"
    | "reported";

// --- backend computed high-level: status_enum
export type SampleStatusEnum = "registered" | "testing" | "reported";

/**
 * Request/Intake workflow status
 */
export type SampleRequestStatus =
    | "draft"
    | "submitted"
    | "returned"
    | "needs_revision"
    | "rejected"
    | "ready_for_delivery"
    | "physically_received"
    | "in_transit_to_collector"
    | "under_inspection"
    | "inspection_failed"
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
    | (string & {});

// Physical workflow actions (Admin <-> Sample Collector)
export type PhysicalWorkflowAction =
    | "admin_received_from_client"
    | "admin_brought_to_collector"
    | "collector_received"
    | "collector_intake_completed"
    | "sc_delivered_to_analyst"
    | "analyst_received"
    | "collector_returned_to_admin"
    | "admin_received_from_collector"
    | "client_picked_up";

export interface SampleClient {
    client_id: number;
    type?: string;
    name: string;
    email?: string | null;
    phone?: string | null;
}

export interface SampleCreator {
    staff_id: number;
    name: string;
    email?: string | null;
    role_id?: number;
}

export type RequestedParameter = {
    parameter_id: number;
    code?: string | null;
    name?: string | null;
    unit?: string | null;
    status?: string | null;
    tag?: string | null;
};

export type SampleStatusHistoryItem = {
    id: number;
    sample_id?: number;
    from_status?: string | null;
    to_status?: string | null;
    note?: string | null;
    created_at: string;

    actor?: {
        staff_id?: number;
        name?: string | null;
        email?: string | null;
        role?: {
            role_id?: number;
            name?: string | null;
        } | null;
    } | null;
};

export type IntakeChecklistRecord = {
    checklist?: Record<string, any> | null;
    notes?: string | null;
    is_passed?: boolean | null;
    checked_at?: string | null;
    checker?: {
        staff_id?: number;
        name?: string | null;
    } | null;
};

export interface Sample {
    sample_id: number;
    client_id: number;
    received_at: string | null;
    scheduled_delivery_at?: string | null;
    sample_type: string;
    examination_purpose: string | null;
    current_status: SampleStatus;
    additional_notes: string | null;

    created_by: number;
    assigned_to: number | null;

    status_enum?: SampleStatusEnum;
    request_status?: SampleRequestStatus | null;

    // Test method set by Admin on Accept
    test_method_id?: number | null;
    test_method_name?: string | null;
    test_method_set_by_staff_id?: number | null;
    test_method_set_at?: string | null;

    submitted_at?: string | null;
    reviewed_at?: string | null;
    ready_at?: string | null;
    physically_received_at?: string | null;
    verified_at?: string | null;
    verified_by?: number | null;

    lab_sample_code?: string | null;

    admin_received_from_client_at?: string | null;
    admin_brought_to_collector_at?: string | null;
    collector_received_at?: string | null;
    collector_intake_completed_at?: string | null;
    sc_delivered_to_analyst_at?: string | null;
    analyst_received_at?: string | null;
    collector_returned_to_admin_at?: string | null;
    admin_received_from_collector_at?: string | null;
    client_picked_up_at?: string | null;
    archived_at?: string | null;

    lo_id?: number | null;
    lo_number?: string | null;
    lo_generated_at?: string | null;

    reagent_request_id?: number | null;
    reagent_request_status?: string | null;

    crosscheck_status?: "pending" | "passed" | "failed" | (string & {}) | null;
    crosschecked_at?: string | null;
    crosschecked_by_staff_id?: number | null;
    crosscheck_note?: string | null;

    physical_label_code?: string | null;

    requested_parameters?: RequestedParameter[] | null;

    // COA / delivery
    coa_checked_at?: string | null;
    coa_released_to_client_at?: string | null;
    coa_release_note?: string | null;

    // Return/Reject note
    request_return_note?: string | null;
    intake_checklist?: IntakeChecklistRecord | null;
    intakeChecklist?: IntakeChecklistRecord | null;

    // Pre-Step 12 gate fields (unlock QC after last kanban column)
    quality_cover_unlocked_at?: string | null;
    quality_cover_unlocked_by_staff_id?: number | null;

    // persisted current kanban column
    testing_column_id?: number | null;

    client?: SampleClient;
    creator?: SampleCreator;
    assignee?: SampleCreator | null;
}

export type PaginationMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

export type PaginatedResponse<T> = {
    data: T[];
    meta: PaginationMeta;
};

function unwrapPaginated<T>(res: any): PaginatedResponse<T> {
    if (res && typeof res === "object" && "data" in res && "meta" in res) {
        return res as PaginatedResponse<T>;
    }
    return res as PaginatedResponse<T>;
}

export type SampleListParams = {
    page?: number;
    client_id?: number;
    status_enum?: SampleStatusEnum;
    from?: string; // YYYY-MM-DD
    to?: string; // YYYY-MM-DD
};

export type CreateSamplePayload = {
    client_id: number;
    received_at: string;
    sample_type: string;
    examination_purpose?: string | null;
    additional_notes?: string | null;

    parameter_ids: number[];
};

export type UpdateSampleStatusPayload = {
    target_status: SampleStatus;
    note?: string | null;
};

// ---------- Client View Status (Portal-friendly) ----------

export type ClientRequestStatusView =
    | "submitted"
    | "returned"
    | "needs_revision"
    | "ready_for_delivery"
    | "received_by_admin"
    | "intake_inspection"
    | "testing"
    | "reported"
    | "rejected"
    | "unknown";

function normalizeStatusKey(raw?: string | null) {
    return String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function hasTruthy(v: unknown) {
    return v !== null && v !== undefined && v !== "" && v !== false;
}

export function getClientRequestStatusView(sample: Partial<Sample> & Record<string, any>): ClientRequestStatusView {
    // COA released => client can download
    if (hasTruthy(sample?.coa_released_to_client_at)) return "reported";

    const statusEnum = String(sample?.status_enum ?? "").trim().toLowerCase();
    const currentStatus = String(sample?.current_status ?? "").trim().toLowerCase();

    if (statusEnum === "reported" || currentStatus === "reported") return "reported";

    const looExists =
        hasTruthy(sample?.lo_generated_at) || hasTruthy(sample?.lo_id) || hasTruthy(sample?.lo_number);

    if (looExists) return "testing";

    if (statusEnum === "testing") return "testing";
    if (["in_progress", "testing_completed", "verified", "validated"].includes(currentStatus)) return "testing";

    const rs = normalizeStatusKey(sample?.request_status ?? null);
    if (!rs) return "unknown";

    if (rs === "rejected" || rs === "denied") return "rejected";
    if (rs === "returned") return "returned";
    if (rs === "needs_revision") return "needs_revision";

    // draft should not be shown to client; treat as submitted
    if (rs === "draft") return "submitted";
    if (rs === "submitted") return "submitted";

    if (rs === "ready_for_delivery") return "ready_for_delivery";

    // received by admin (physically received / handoff received)
    if (
        rs === "physically_received" ||
        rs === "received_by_analyst" ||
        rs === "analyst_received" ||
        rs === "sc_received_from_analyst" ||
        rs === "sc_delivered_to_analyst"
    ) {
        return "received_by_admin";
    }

    // intake inspection until LOO exists
    if (
        rs === "in_transit_to_collector" ||
        rs === "under_inspection" ||
        rs === "inspection_failed_returned_to_admin" ||
        rs === "returned_to_admin" ||
        rs === "intake_checklist_passed" ||
        rs === "awaiting_verification" ||
        rs === "waiting_sample_id_assignment" ||
        rs === "sample_id_pending_verification" ||
        rs === "sample_id_approved_for_assignment" ||
        rs === "intake_validated" ||
        rs === "analyst_returned_to_sc"
    ) {
        return "intake_inspection";
    }

    return "unknown";
}

// ---------- Service ----------

export const sampleService = {
    async getAll(params?: SampleListParams): Promise<PaginatedResponse<Sample>> {
        const res = await apiGet<any>("/v1/samples", { params });
        return unwrapPaginated<Sample>(res);
    },

    async getById(id: number): Promise<Sample> {
        const res = await apiGet<any>(`/v1/samples/${id}`);
        return (res?.data ?? res) as Sample;
    },

    async create(payload: CreateSamplePayload): Promise<Sample> {
        const res = await apiPost<any>("/v1/samples", payload);
        return (res?.data ?? res) as Sample;
    },

    async updateStatus(sampleId: number, payload: UpdateSampleStatusPayload): Promise<Sample> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/status`, payload);
        return (res?.data ?? res) as Sample;
    },

    async updatePhysicalWorkflow(
        sampleId: number,
        action: PhysicalWorkflowAction,
        note?: string | null
    ): Promise<Sample> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/physical-workflow?_method=PATCH`, {
            action,
            note: note ?? null,
        });
        return (res?.data ?? res) as Sample;
    },

    async getStatusHistory(sampleId: number): Promise<SampleStatusHistoryItem[]> {
        const res = await apiGet<any>(`/v1/samples/${sampleId}/status-history`);
        return (res?.data ?? res) as SampleStatusHistoryItem[];
    },

    async submitCrosscheck(sampleId: number, payload: { physical_label_code: string; note?: string | null }) {
        return apiPatch(`/v1/samples/${sampleId}/crosscheck`, payload);
    },
};