import { apiPost } from "./api";

export type UpdateRequestStatusPayload = {
    status: string;
    note?: string | null;
};

export type UpdateRequestStatusResponse = {
    success?: boolean;
    message?: string;
    data?: any;
};

export async function updateRequestStatus(
    sampleId: number,
    status: string,
    note?: string | null
): Promise<UpdateRequestStatusResponse> {
    const payload: UpdateRequestStatusPayload = {
        status,
        note: note ?? null,
    };

    // apiPost biasanya return data langsung (bukan AxiosResponse)
    const res = await apiPost<UpdateRequestStatusResponse>(
        `/v1/samples/${sampleId}/request-status`,
        payload
    );

    return res as any;
}
