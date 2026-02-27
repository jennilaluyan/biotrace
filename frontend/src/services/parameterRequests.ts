import { api } from "./api";

export type Paginator<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
};

export type ParameterRequestStatus = "pending" | "approved" | "rejected";

export type ParameterRequestRow = {
    id: number;

    parameter_name: string;
    category: "pcr" | "sequencing" | "rapid" | "microbiology";
    reason?: string | null;

    status: ParameterRequestStatus;

    requested_by: number;
    requested_at: string;

    decided_by?: number | null;
    decided_at?: string | null;
    decision_note?: string | null;

    approved_parameter_id?: number | null;

    created_at?: string;
    updated_at?: string | null;
};

type ApiEnvelope<T> = { data: T };

export type CreateParameterRequestPayload = {
    parameter_name: string;
    category: "pcr" | "sequencing" | "rapid" | "microbiology";
    reason?: string | null;
};

export async function fetchParameterRequests(params?: {
    page?: number;
    per_page?: number;
    status?: ParameterRequestStatus | "all";
    q?: string;
}): Promise<Paginator<ParameterRequestRow>> {
    const res = await api.get<ApiEnvelope<Paginator<ParameterRequestRow>>>("/v1/parameter-requests", { params });
    return res.data;
}

export async function createParameterRequest(payload: CreateParameterRequestPayload): Promise<ParameterRequestRow> {
    const res = await api.post<ApiEnvelope<ParameterRequestRow>>("/v1/parameter-requests", payload);
    return res.data;
}