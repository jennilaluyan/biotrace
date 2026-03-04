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

    // ✅ allow status-token callers (UI sometimes passes the target status)
    if (k === "ready_for_delivery") return { action: "accept" as const };
    if (k === "physically_received") return { action: "received" as const };

    // fallback: status-based payload
    return { request_status: v };
}

export async function updateRequestStatus(
    sampleId: number,
    actionOrStatus: string,
    note?: string | null,
    methodId?: number | null
): Promise<UpdateRequestStatusResponse> {
    const payload: any = { ...normalizeActionOrStatus(actionOrStatus) };

    // Only attach note when caller provides meaningful value
    if (typeof note === "string" && note.trim().length) {
        payload.note = note.trim();
    }

    // Attach method_id only when valid (used by Accept flow)
    const mid = Number(methodId);
    if (Number.isFinite(mid) && mid > 0) {
        payload.method_id = mid;
    }

    const res = await apiPost<UpdateRequestStatusResponse>(
        `/v1/samples/${sampleId}/request-status`,
        payload
    );

    return res as any;
}