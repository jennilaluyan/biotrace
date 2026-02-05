// frontend/src/utils/lastRoute.ts
type Actor = "staff" | "client";

const KEY_STAFF = "biotrace_last_route_staff";
const KEY_CLIENT = "biotrace_last_route_client";

function keyFor(actor: Actor) {
    return actor === "staff" ? KEY_STAFF : KEY_CLIENT;
}

// Very defensive: only allow internal routes, prevent weird injections
export function isSafeInternalPath(path: string) {
    if (!path) return false;
    if (!path.startsWith("/")) return false;
    if (path.startsWith("//")) return false;
    // ignore auth and error pages
    if (path.startsWith("/login")) return false;
    if (path.startsWith("/register")) return false;
    if (path.startsWith("/logout")) return false;
    return true;
}

export function setLastRoute(actor: Actor, path: string) {
    if (!isSafeInternalPath(path)) return;
    try {
        localStorage.setItem(keyFor(actor), path);
    } catch {
        // ignore
    }
}

export function getLastRoute(actor: Actor): string | null {
    try {
        const v = localStorage.getItem(keyFor(actor));
        if (!v) return null;
        return isSafeInternalPath(v) ? v : null;
    } catch {
        return null;
    }
}

export function clearLastRoute(actor: Actor) {
    try {
        localStorage.removeItem(keyFor(actor));
    } catch {
        // ignore
    }
}
