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

export async function fetchParameterRequests(params?: {
    page?: number;
    per_page?: number;
    status?: ParameterRequestStatus | "all";
    q?: string;
}): Promise<Paginator<ParameterRequestRow>> {
    return api.get("/v1/parameter-requests", { params });
}