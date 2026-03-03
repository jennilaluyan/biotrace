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
export type ParameterRequestType = "create" | "update";

export type ParameterRequestPayload = Partial<{
    name: string;
    workflow_group: "pcr" | "sequencing" | "rapid" | "microbiology" | null;
    status: "Active" | "Inactive";
    tag: "Routine" | "Research";
}>;

export type ParameterRequestRow = {
    id: number;

    request_type?: ParameterRequestType;
    parameter_id?: number | null;
    payload?: ParameterRequestPayload | null;

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
    requester_ack_at?: string | null;
};

function unwrapApiData<T>(res: any): T {
    const body = res?.data ?? res;

    const isEnvelope =
        body &&
        typeof body === "object" &&
        "data" in body &&
        (("success" in body && typeof (body as any).success === "boolean") ||
            "message" in body ||
            "extra" in body ||
            "error" in body);

    return (isEnvelope ? (body as any).data : body) as T;
}

function getHttpStatus(e: any): number | null {
    const s = e?.status ?? e?.response?.status ?? null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

export async function acknowledgeParameterRequest(id: number): Promise<{ request: ParameterRequestRow }> {
    const rid = Number(id);
    const res = await api.post(`/v1/parameter-requests/${rid}/ack`);
    return unwrapApiData(res);
}

export type CreateParameterRequestPayload = {
    // create request
    parameter_name?: string;
    category?: "pcr" | "sequencing" | "rapid" | "microbiology";

    // update request
    parameter_id?: number;
    name?: string;
    workflow_group?: "pcr" | "sequencing" | "rapid" | "microbiology" | null;
    status?: "Active" | "Inactive";
    tag?: "Routine" | "Research";

    reason?: string | null;
};

export async function fetchParameterRequests(params?: {
    page?: number;
    per_page?: number;
    status?: ParameterRequestStatus | "all";
    q?: string;
}): Promise<Paginator<ParameterRequestRow>> {
    const res = await api.get("/v1/parameter-requests", { params });
    return unwrapApiData(res);
}

export type ApproveParameterRequestResult = {
    request: ParameterRequestRow;
    parameter?: any;
};

export type RejectParameterRequestResult = {
    request: ParameterRequestRow;
};

export async function createParameterRequest(payload: CreateParameterRequestPayload): Promise<ParameterRequestRow> {
    try {
        const res = await api.post("/v1/parameters/requests", payload);
        return unwrapApiData(res);
    } catch (e: any) {
        // fallback for legacy route name (if old backend still exists)
        const status = getHttpStatus(e);
        if (status === 404 || status === 405) {
            const res2 = await api.post("/v1/parameter-requests", payload);
            return unwrapApiData(res2);
        }
        throw e;
    }
}

export async function approveParameterRequest(id: number): Promise<ApproveParameterRequestResult> {
    const rid = Number(id);
    const res = await api.post(`/v1/parameter-requests/${rid}/approve`);
    return unwrapApiData(res);
}

export async function rejectParameterRequest(id: number, decision_note: string): Promise<RejectParameterRequestResult> {
    const rid = Number(id);
    const note = String(decision_note ?? "").trim();

    const res = await api.post(`/v1/parameter-requests/${rid}/reject`, { decision_note: note });
    return unwrapApiData(res);
}