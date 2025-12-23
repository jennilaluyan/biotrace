export type Tenant = "portal" | "backoffice";

export function getTenant(): Tenant {
    const host = window.location.hostname.toLowerCase();
    // root domain = portal
    if (host === "lims.localhost") return "portal";
    if (host.startsWith("backoffice.")) return "backoffice";
    // fallback
    return "portal";
}
