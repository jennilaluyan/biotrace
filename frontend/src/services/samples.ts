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

export type ContactHistory = "ada" | "tidak" | "tidak_tahu" | null;

/**
 * Request/Intake workflow status (baru dari backend)
 * Kita bikin union, tapi tetap toleran: string juga boleh supaya FE tidak brittle kalau backend nambah nilai baru.
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

export interface Sample {
    sample_id: number;
    client_id: number;

    // ⚠️ nullable untuk request workflow (sebelum diterima fisik / sebelum intake validate)
    received_at: string | null;

    sample_type: string;
    examination_purpose: string | null;
    contact_history: ContactHistory;
    priority: number;
    current_status: SampleStatus;
    additional_notes: string | null;

    created_by: number;
    assigned_to: number | null;

    // appended by backend model
    status_enum?: SampleStatusEnum;

    // ===== Request/Intake fields (baru) =====
    request_status?: SampleRequestStatus | null;
    submitted_at?: string | null;
    reviewed_at?: string | null;
    ready_at?: string | null;
    physically_received_at?: string | null;

    // Lab sample code (BML-001)
    lab_sample_code?: string | null;

    // eager-loaded relations from backend
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
    // backend index(): { data: items[], meta: {...} }
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
    contact_history?: ContactHistory;
    priority?: number;
    additional_notes?: string | null;
};

export type UpdateSampleStatusPayload = {
    target_status: SampleStatus;
    note?: string | null;
};

// --- sample comments
export type SampleComment = {
    comment_id: number;
    sample_id: number;
    body: string;
    created_at: string;

    // optional fields (tolerant)
    created_by?: number;
    author_name?: string | null;
    visible_to_role_ids?: number[];
    target_status?: string | null;
};

export type CreateSampleCommentPayload = {
    body: string;
};

// --- status history (audit)
export type SampleStatusHistoryItem = {
    id: number;
    created_at: string;
    from_status: string | null;
    to_status: string | null;
    note: string | null;
    actor: null | {
        staff_id: number;
        name: string;
        email: string;
        role: null | { role_id: number; name: string };
    };
};

export const sampleService = {
    async getAll(params?: SampleListParams): Promise<PaginatedResponse<Sample>> {
        const res = await apiGet<any>("/v1/samples", { params });
        return unwrapPaginated<Sample>(res);
    },

    async getById(id: number): Promise<Sample> {
        const res = await apiGet<any>(`/v1/samples/${id}`);
        // show(): { data: sample }
        return (res?.data ?? res) as Sample;
    },

    async create(payload: CreateSamplePayload): Promise<Sample> {
        const res = await apiPost<any>("/v1/samples", payload);
        // store(): { message, data: sample }
        return (res?.data ?? res) as Sample;
    },

    async updateStatus(
        sampleId: number,
        payload: UpdateSampleStatusPayload
    ): Promise<Sample> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/status`, payload);
        // updateStatus(): { message, data: sample }
        return (res?.data ?? res) as Sample;
    },

    async getComments(sampleId: number): Promise<SampleComment[]> {
        const res = await apiGet<any>(`/v1/samples/${sampleId}/comments`);
        // expected: { data: [...] }
        return (res?.data ?? res) as SampleComment[];
    },

    async addComment(
        sampleId: number,
        payload: CreateSampleCommentPayload
    ): Promise<SampleComment> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/comments`, payload);
        // expected: { message, data: comment }
        return (res?.data ?? res) as SampleComment;
    },

    async getStatusHistory(sampleId: number): Promise<SampleStatusHistoryItem[]> {
        const res = await apiGet<any>(`/v1/samples/${sampleId}/status-history`);
        // expected: { data: [...] }
        return (res?.data ?? res) as SampleStatusHistoryItem[];
    },
};
