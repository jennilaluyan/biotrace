import type { SampleStatus } from "../services/samples";

export function commentTargetLabelByStatus(status?: SampleStatus | null): string {
    switch (status) {
        case "received":
            return "Administrator, Sample Collector";
        case "in_progress":
            return "Analyst";
        case "testing_completed":
            return "Operational Manager";
        case "verified":
        case "validated":
        case "reported":
            return "Laboratory Head";
        default:
            return "-";
    }
}
