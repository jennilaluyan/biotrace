// src/services/sampleRequests.ts
import { staffHttp, clientHttp, apiGet, apiPost, apiPatch } from "./api";

/**
 * Status workflow pre-sample (sample_requests.request_status)
 */
export type SampleRequestStatus =
    | "submitted"
    | "reviewed"
    | "approved"
    | "rejected"
    | "cancelled"
    | "handed_over_to_collector"
    | "intake_passed"
    | "intake_failed"
    | "converted_to_sample";

export type ParameterLite = {
    parameter_id: number;
    code?: string | null;
    name?: string | null;
    unit?: string | null;
    method_ref?: string | null;
};

export type SampleRequestItem = {
    id?: number;
    request_id?: number;
    parameter_id: number;
    notes?: string | null;
    parameter?: ParameterLite | null;
};

export type SampleLite = {
    sample_id: number;
    request_id: number | null;
    current_status?: string | null;
    received_at?: string | null;
};

export type ClientLite = {
    client_id: number;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    type?: string | null;
};

export type SampleRequest = {
    request_id: number;
    client_id: number;

    intended_sample_type?: string | null;
    examination_purpose?: string | null;
    contact_history?: string | null;
    priority?: number | null;
    additional_notes?: string | null;

    request_status: SampleRequestStatus;

    handed_over_by?: number | null;
    handed_over_at?: string | null;

    intake_checked_by?: number | null;
    intake_checked_at?: string | null;
    intake_result?: "pass" | "fail" | null;
    intake_notes?: string | null;

    created_at?: string | null;
    updated_at?: string | null;

    client?: ClientLite | null;
    items?: SampleRequestItem[];
    sample?: SampleLite | null;
};

export type Paginated<T> = {
    current_page: number;
    data: T[];
    last_page: number;
    per_page: number;
    total: number;
    from?: number;
    to?: number;
    next_page_url?: string | null;
    prev_page_url?: string | null;
};

export type CreateSampleRequestPayload = {
    intended_sample_type?: string | null;
    examination_purpose?: string | null;
    contact_history?: string | null;
    priority?: number | null;
    additional_notes?: string | null;
    items?: Array<{
        parameter_id: number;
        notes?: string | null;
    }>;
};

export type UpdateStatusPayload = {
    status: SampleRequestStatus;
    notes?: string | null;
};

export type HandoverPayload = {
    notes?: string | null;
};

export type IntakePayload = {
    result: "pass" | "fail";
    received_at?: string | null;
    intake_notes?: string | null;
};

export const sampleRequestService = {
    // =========================
    // STAFF (Backoffice)
    // =========================
    staff: {
        /**
         * GET /api/v1/sample-requests?status=&client_id=
         * (di frontend path cukup /v1/... karena baseURL sudah /api)
         */
        async getAll(params?: { status?: string; client_id?: number }) {
            const qs = new URLSearchParams();
            if (params?.status) qs.set("status", params.status);
            if (params?.client_id) qs.set("client_id", String(params.client_id));
            const suffix = qs.toString() ? `?${qs.toString()}` : "";

            return apiGet<{ data: Paginated<SampleRequest> }>(
                staffHttp,
                `/v1/sample-requests${suffix}`
            );
        },

        async getById(requestId: number) {
            return apiGet<{ data: SampleRequest }>(
                staffHttp,
                `/v1/sample-requests/${requestId}`
            );
        },

        async updateStatus(requestId: number, payload: UpdateStatusPayload) {
            return apiPatch<{ data: SampleRequest }>(
                staffHttp,
                `/v1/sample-requests/${requestId}/status`,
                payload
            );
        },

        async handover(requestId: number, payload?: HandoverPayload) {
            return apiPatch<{ data: SampleRequest }>(
                staffHttp,
                `/v1/sample-requests/${requestId}/handover`,
                payload ?? {}
            );
        },

        async intakeCreateSample(requestId: number, payload: IntakePayload) {
            return apiPost<{
                message: string;
                request: { request_id: number; request_status: SampleRequestStatus };
                sample?: { sample_id: number; request_id: number; current_status: string; received_at: string };
                created_sample_tests?: number;
            }>(staffHttp, `/v1/sample-requests/${requestId}/intake`, payload);
        },
    },

    // =========================
    // CLIENT (Portal)
    // =========================
    client: {
        async getMine() {
            // backend index untuk client biasanya otomatis “filter by auth client”
            return apiGet<{ data: Paginated<SampleRequest> }>(clientHttp, `/v1/sample-requests`);
        },

        async getById(requestId: number) {
            return apiGet<{ data: SampleRequest }>(clientHttp, `/v1/sample-requests/${requestId}`);
        },

        async create(payload: CreateSampleRequestPayload) {
            return apiPost<{ data: SampleRequest }>(clientHttp, `/v1/sample-requests`, payload);
        },
    },
};
