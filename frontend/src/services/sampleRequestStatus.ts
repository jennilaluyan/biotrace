import { apiPost } from "./api";

export type UpdateRequestStatusResponse = {
    success?: boolean;
    message?: string;
    data?: any;
};

export async function updateRequestStatus(
    sampleId: number,
    targetStatus: string,
    note?: string | null
): Promise<UpdateRequestStatusResponse> {
    const res = await apiPost<UpdateRequestStatusResponse>(`/v1/samples/${sampleId}/request-status`, {
        target_status: targetStatus, // ✅ match backend
        note: note ?? null,
    });

    return res as any;
}
