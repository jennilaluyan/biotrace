import type { SampleStatus } from "../services/samples";
import { ROLE_ID } from "./roles";

const TRANSITIONS: Record<number, Partial<Record<SampleStatus, SampleStatus[]>>> = {
    // Sample Collector: received → in_progress
    [ROLE_ID.SAMPLE_COLLECTOR]: {
        received: ["in_progress"],
    },

    // Analyst: in_progress → testing_completed
    [ROLE_ID.ANALYST]: {
        in_progress: ["testing_completed"],
    },

    // Operational Manager: testing_completed → verified
    [ROLE_ID.OPERATIONAL_MANAGER]: {
        testing_completed: ["verified"],
    },

    // Lab Head: verified → validated → reported
    [ROLE_ID.LAB_HEAD]: {
        verified: ["validated"],
        validated: ["reported"],
    },

    // Administrator: received → in_progress (only)
    [ROLE_ID.ADMIN]: {
        received: ["in_progress"],
    },
};

export function getAllowedSampleStatusTargets(
    roleId: number | null | undefined,
    currentStatus: SampleStatus | null | undefined
): SampleStatus[] {
    if (!roleId || !currentStatus) return [];
    return TRANSITIONS[roleId]?.[currentStatus] ?? [];
}

export function sampleStatusLabel(status: SampleStatus): string {
    switch (status) {
        case "received":
            return "Received";
        case "in_progress":
            return "In Progress";
        case "testing_completed":
            return "Testing Completed";
        case "verified":
            return "Verified";
        case "validated":
            return "Validated";
        case "reported":
            return "Reported";
        default:
            return status;
    }
}
