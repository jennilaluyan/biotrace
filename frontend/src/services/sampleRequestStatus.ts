import { apiPost } from "./api";

export type UpdateRequestStatusResponse = {
    success?: boolean;
    message?: string;
    data?: any;
};

function normalizeActionOrStatus(v: string) {
    const k = String(v ?? "").trim().toLowerCase();

    // alias yang sering kepake di UI
    if (k === "approve") return { action: "accept" as const };
    if (k === "accept") return { action: "accept" as const };
    if (k === "return") return { action: "return" as const };
    if (k === "received") return { action: "received" as const };

    return { request_status: v };
}

export async function updateRequestStatus(
    sampleId: number,
    actionOrStatus: string,
    note?: string | null
): Promise<UpdateRequestStatusResponse> {
    const payload: any = { note: note ?? null, ...normalizeActionOrStatus(actionOrStatus) };

    const res = await apiPost<UpdateRequestStatusResponse>(
        `/v1/samples/${sampleId}/request-status`,
        payload
    );

    return res as any;
}
