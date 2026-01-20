import { apiPost } from "./api";
import type { Sample } from "./samples";

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

// Payload fleksibel dulu (biar gak nebak field checklist sebelum Step 6)
export type IntakeChecklistPayload = {
    // contoh: { item_packaging_ok: true, item_label_ok: false, notes: "..." }
    [key: string]: any;
    notes?: string | null;
};

export const intakeService = {
    // POST /v1/samples/:id/intake-checklist
    async submitChecklist(sampleId: number, payload: IntakeChecklistPayload): Promise<Sample> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/intake-checklist`, payload);
        return unwrapData<Sample>(res);
    },

    // POST /v1/samples/:id/intake-validate
    async validateIntake(sampleId: number): Promise<Sample> {
        const res = await apiPost<any>(`/v1/samples/${sampleId}/intake-validate`);
        return unwrapData<Sample>(res);
    },
};
