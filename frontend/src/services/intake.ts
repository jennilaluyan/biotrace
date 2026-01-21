import { apiPost } from "./api";

export type IntakeChecklistItem = {
    key: string;
    passed: boolean;
    note?: string | null;
};

export type IntakeChecklistPayload = {
    /**
     * Flexible payload:
     * - checks: object map (backend-friendly for Laravel validation)
     * - items: array (some backends prefer list)
     * We send both from UI to maximize compatibility.
     */
    checks?: Record<string, boolean>;
    notes?: Record<string, string | null | undefined>;
    items?: IntakeChecklistItem[];

    /** optional free note */
    note?: string | null;
};

export async function submitIntakeChecklist(
    sampleId: number,
    payload: IntakeChecklistPayload
) {
    return apiPost<any>(`/v1/samples/${sampleId}/intake-checklist`, payload);
}

export async function validateIntake(sampleId: number) {
    return apiPost<any>(`/v1/samples/${sampleId}/intake-validate`, {});
}
