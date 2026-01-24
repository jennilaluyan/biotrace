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
    | "ready_for_delivery"
    | "physically_received"
    | (string & {});

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
};
