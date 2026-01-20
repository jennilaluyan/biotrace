import { apiPost } from "./api";
import type { Sample } from "./samples";

export type UpdateRequestStatusPayload = {
    target_status: string; // "returned" | "ready_for_delivery" | "physically_received" etc
    note?: string | null;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

export const sampleRequestStatusService = {
    // POST /v1/samples/:id/request-status
    async update(sampleId: number, payload: UpdateRequestStatusPayload): Promise<Sample> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/request-status`, payload);
        return unwrapData<Sample>(res);
    },
};
