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

    if (k === "approve") return { action: "accept" as const };
    if (k === "accept") return { action: "accept" as const };
    if (k === "reject") return { action: "reject" as const };
    if (k === "return") return { action: "return" as const };
    if (k === "received") return { action: "received" as const };

    // allow status-token callers
    if (k === "ready_for_delivery") return { action: "accept" as const };
    if (k === "physically_received") return { action: "received" as const };

    return { request_status: v };
}

export async function updateRequestStatus(
    sampleId: number,
    actionOrStatus: string,
    note?: string | null,
    testMethod?: number | string | null
): Promise<UpdateRequestStatusResponse> {
    const payload: any = { ...normalizeActionOrStatus(actionOrStatus) };

    if (typeof note === "string" && note.trim().length) {
        payload.note = note.trim();
    }

    // ✅ accept supports either ID or free text name
    if (typeof testMethod === "number") {
        const mid = Number(testMethod);
        if (Number.isFinite(mid) && mid > 0) {
            payload.test_method_id = mid;
            payload.method_id = mid; // legacy alias
        }
    } else if (typeof testMethod === "string") {
        const name = testMethod.trim();
        if (name.length) {
            payload.test_method_name = name;
            payload.method_name = name; // legacy alias
        }
    }

    const res = await apiPost<UpdateRequestStatusResponse>(`/v1/samples/${sampleId}/request-status`, payload);
    return res as any;
}