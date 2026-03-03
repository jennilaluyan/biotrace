export type Tenant = "portal" | "backoffice";

export function getTenant(): Tenant {
    const host = window.location.hostname.toLowerCase();
    if (host === "lims.localhost") return "portal";
    if (host.startsWith("backoffice.")) return "backoffice";
    return "portal";
}