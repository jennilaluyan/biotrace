import { apiGet, apiPost } from "./api";

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
    | "ready_for_delivery"
    | "physically_received"
    | "in_transit_to_collector"
    | "under_inspection"
    | "intake_checklist_passed"
    | "intake_validated"
    | "rejected"
    | (string & {});

// ✅ Physical workflow actions (Admin <-> Sample Collector)
export type PhysicalWorkflowAction =
    | "admin_received_from_client"
    | "admin_brought_to_collector"
    | "collector_received"
    | "collector_intake_completed"
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

// ✅ Status history type (biar import di SampleDetailPage aman)
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

export interface Sample {
    sample_id: number;
    client_id: number;

    // physical receive time (admin/lab)
    received_at: string | null;

    // ✅ portal schedule (client)
    scheduled_delivery_at?: string | null;

    sample_type: string;
    examination_purpose: string | null;

    // ❌ removed: contact_history, priority

    current_status: SampleStatus;
    additional_notes: string | null;
    created_by: number;
    assigned_to: number | null;

    // appended by backend model
    status_enum?: SampleStatusEnum;

    // Request/Intake fields
    request_status?: SampleRequestStatus | null;
    submitted_at?: string | null;
    reviewed_at?: string | null;
    ready_at?: string | null;
    physically_received_at?: string | null;
    lab_sample_code?: string | null;

    // ✅ Physical workflow timestamps (F2)
    admin_received_from_client_at?: string | null;
    admin_brought_to_collector_at?: string | null;
    collector_received_at?: string | null;
    collector_intake_completed_at?: string | null;
    collector_returned_to_admin_at?: string | null;
    admin_received_from_collector_at?: string | null;
    client_picked_up_at?: string | null;

    // ✅ requested parameters (pivot)
    requested_parameters?: RequestedParameter[] | null;

    // relations
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

    // ✅ required
    parameter_ids: number[];
};

export type UpdateSampleStatusPayload = {
    target_status: SampleStatus;
    note?: string | null;
};

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

    // ✅ Step 2 — Physical Workflow endpoint
    async updatePhysicalWorkflow(
        sampleId: number,
        action: PhysicalWorkflowAction,
        note?: string | null
    ): Promise<Sample> {
        const res = await apiPost<any>(
            `/v1/samples/${sampleId}/physical-workflow?_method=PATCH`,
            {
                action,
                note: note ?? null,
            }
        );
        return (res?.data ?? res) as Sample;
    },

    async getStatusHistory(sampleId: number): Promise<SampleStatusHistoryItem[]> {
        const res = await apiGet<any>(`/v1/samples/${sampleId}/status-history`);
        return (res?.data ?? res) as SampleStatusHistoryItem[];
    },
};
