// src/components/requests/RequestStatusPill.tsx
import React from "react";
import type { SampleRequestStatus } from "../../services/sampleRequests";

const labelMap: Record<string, string> = {
    submitted: "Submitted",
    reviewed: "Reviewed",
    approved: "Approved",
    rejected: "Rejected",
    cancelled: "Cancelled",
    handed_over_to_collector: "Handed Over",
    intake_passed: "Intake Passed",
    intake_failed: "Intake Failed",
    converted_to_sample: "Converted to Sample",
};

function pillClass(status: SampleRequestStatus) {
    // simple tailwind classes
    if (status === "approved" || status === "converted_to_sample" || status === "intake_passed") {
        return "bg-green-100 text-green-700 border-green-200";
    }
    if (status === "rejected" || status === "intake_failed" || status === "cancelled") {
        return "bg-red-100 text-red-700 border-red-200";
    }
    if (status === "handed_over_to_collector") {
        return "bg-blue-100 text-blue-700 border-blue-200";
    }
    return "bg-gray-100 text-gray-700 border-gray-200";
}

export const RequestStatusPill = ({ status }: { status: SampleRequestStatus }) => {
    return (
        <span
            className={[
                "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                pillClass(status),
            ].join(" ")}
            title={status}
        >
            {labelMap[status] ?? status}
        </span>
    );
};
