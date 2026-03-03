import { apiPost } from "./api";

export type UpdateRequestStatusResponse = {
    success?: boolean;
    message?: string;
    data?: any;
};

type ActionPayload =
    | { action: "accept" }
    | { action: "reject" }
    | { action: "return" }
    | { action: "received" }
    | { request_status: string };

function normalizeActionOrStatus(v: string): ActionPayload {
    const k = String(v ?? "").trim().toLowerCase();

    // alias yang sering kepake di UI
    if (k === "approve") return { action: "accept" as const };
    if (k === "accept") return { action: "accept" as const };
    if (k === "reject") return { action: "reject" as const };
    if (k === "return") return { action: "return" as const };
    if (k === "received") return { action: "received" as const };

    // fallback: status-based payload
    return { request_status: v };
}

export async function updateRequestStatus(
    sampleId: number,
    actionOrStatus: string,
    note?: string | null
): Promise<UpdateRequestStatusResponse> {
    const payload: any = { ...normalizeActionOrStatus(actionOrStatus) };

    // Only attach note when caller provides meaningful value
    if (typeof note === "string" && note.trim().length) {
        payload.note = note.trim();
    }

    const res = await apiPost<UpdateRequestStatusResponse>(
        `/v1/samples/${sampleId}/request-status`,
        payload
    );

    return res as any;
}