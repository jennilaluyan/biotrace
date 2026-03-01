type Actor = "staff" | "client";

const KEY_STAFF = "biotrace_last_route_staff";
const KEY_CLIENT = "biotrace_last_route_client";

function baseKeyFor(actor: Actor) {
    return actor === "staff" ? KEY_STAFF : KEY_CLIENT;
}

function keyFor(actor: Actor, subjectId?: number | string | null) {
    const base = baseKeyFor(actor);
    if (subjectId == null || subjectId === "") return base; // legacy fallback only
    return `${base}:${String(subjectId)}`;
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

export function setLastRoute(actor: Actor, path: string, subjectId?: number | string | null) {
    if (!isSafeInternalPath(path)) return;

    // IMPORTANT: write per-user key only (avoid cross-user bleed)
    const k = keyFor(actor, subjectId);
    if (k === baseKeyFor(actor)) return; // don't write global legacy key

    try {
        localStorage.setItem(k, path);
    } catch {
        // ignore
    }
}

export function getLastRoute(actor: Actor, subjectId?: number | string | null): string | null {
    try {
        // 1) preferred: per-user key
        const scopedKey = keyFor(actor, subjectId);
        if (scopedKey !== baseKeyFor(actor)) {
            const scoped = localStorage.getItem(scopedKey);
            if (scoped && isSafeInternalPath(scoped)) return scoped;
        }

        // 2) legacy fallback (older builds)
        const legacy = localStorage.getItem(baseKeyFor(actor));
        if (!legacy) return null;
        return isSafeInternalPath(legacy) ? legacy : null;
    } catch {
        return null;
    }
}

export function clearLastRoute(actor: Actor, subjectId?: number | string | null) {
    try {
        const scopedKey = keyFor(actor, subjectId);
        if (scopedKey !== baseKeyFor(actor)) localStorage.removeItem(scopedKey);
    } catch {
        // ignore
    }
}
