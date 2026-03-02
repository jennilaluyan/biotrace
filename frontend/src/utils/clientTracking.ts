type TFn = (k: string, opt?: any) => string;

const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

function chip(kind: "gray" | "primary" | "amber" | "indigo" | "emerald" | "violet") {
    switch (kind) {
        case "primary":
            return `${base} bg-primary-soft/10 text-primary`;
        case "amber":
            return `${base} bg-amber-50 text-amber-800`;
        case "indigo":
            return `${base} bg-indigo-50 text-indigo-700`;
        case "emerald":
            return `${base} bg-emerald-50 text-emerald-700`;
        case "violet":
            return `${base} bg-violet-50 text-violet-700`;
        default:
            return `${base} bg-slate-100 text-slate-700`;
    }
}

export type ClientTracking = {
    label: string;
    cls: string;
    canDownloadCoa: boolean;
    code:
    | "draft"
    | "submitted"
    | "needs_revision"
    | "returned"
    | "ready_for_delivery"
    | "physically_received"
    | "in_progress"
    | "testing_completed"
    | "verified"
    | "validated"
    | "coa_pending_admin"
    | "coa_available"
    | "reported"
    | "unknown";
};

export function getClientTracking(sample: any, t: TFn): ClientTracking {
    const requestStatus = String(sample?.request_status ?? "").trim().toLowerCase();
    const currentStatus = String(sample?.current_status ?? "").trim().toLowerCase();

    const coaReleasedAt = sample?.coa_released_to_client_at ?? null;
    const coaLocked = !!sample?.coa_is_locked;

    // Highest priority (end state)
    if (coaReleasedAt) {
        return {
            code: "coa_available",
            label: t("portal.status.coaAvailable"),
            cls: chip("emerald"),
            canDownloadCoa: true,
        };
    }

    // COA exists but not released yet
    if (coaLocked) {
        return {
            code: "coa_pending_admin",
            label: t("portal.status.coaPendingAdmin"),
            cls: chip("indigo"),
            canDownloadCoa: false,
        };
    }

    // Lab workflow
    if (currentStatus === "reported") {
        return { code: "reported", label: t("portal.status.reported"), cls: chip("emerald"), canDownloadCoa: false };
    }
    if (currentStatus === "validated") {
        return { code: "validated", label: t("portal.status.validated"), cls: chip("violet"), canDownloadCoa: false };
    }
    if (currentStatus === "verified") {
        return { code: "verified", label: t("portal.status.verified"), cls: chip("indigo"), canDownloadCoa: false };
    }
    if (currentStatus === "testing_completed") {
        return { code: "testing_completed", label: t("portal.status.testingCompleted"), cls: chip("indigo"), canDownloadCoa: false };
    }
    if (currentStatus === "in_progress") {
        return { code: "in_progress", label: t("portal.status.inProgress"), cls: chip("primary"), canDownloadCoa: false };
    }

    // Request workflow (early stages)
    if (requestStatus === "draft") return { code: "draft", label: t("portal.status.draft"), cls: chip("gray"), canDownloadCoa: false };
    if (requestStatus === "submitted") return { code: "submitted", label: t("portal.status.submitted"), cls: chip("primary"), canDownloadCoa: false };
    if (requestStatus === "needs_revision") return { code: "needs_revision", label: t("portal.status.needsRevision"), cls: chip("amber"), canDownloadCoa: false };
    if (requestStatus === "returned") return { code: "returned", label: t("portal.status.returned"), cls: chip("amber"), canDownloadCoa: false };
    if (requestStatus === "ready_for_delivery") return { code: "ready_for_delivery", label: t("portal.status.readyForDelivery"), cls: chip("indigo"), canDownloadCoa: false };
    if (requestStatus === "physically_received") return { code: "physically_received", label: t("portal.status.physicallyReceived"), cls: chip("emerald"), canDownloadCoa: false };

    return { code: "unknown", label: t("portal.status.unknown"), cls: chip("gray"), canDownloadCoa: false };
}