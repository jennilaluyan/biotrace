// frontend/src/utils/authSync.ts
type Actor = "staff" | "client";
type Action = "login" | "logout" | "session_expired" | "refresh";

export type AuthSyncEvent = {
    actor: Actor;
    action: Action;
    at: number;
    source?: string; // optional tab identifier
};

const STORAGE_KEY = "biotrace_auth_sync_event";
const CHANNEL_NAME = "biotrace_auth_sync";

function safeJsonParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function publishAuthEvent(actor: Actor, action: Action) {
    const evt: AuthSyncEvent = {
        actor,
        action,
        at: Date.now(),
        source: `${Math.random().toString(16).slice(2)}-${Date.now()}`,
    };

    // 1) Best: BroadcastChannel
    try {
        if ("BroadcastChannel" in window) {
            const ch = new BroadcastChannel(CHANNEL_NAME);
            ch.postMessage(evt);
            ch.close();
        }
    } catch {
        // ignore
    }

    // 2) Fallback: localStorage event (fires in other tabs)
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(evt));
    } catch {
        // ignore
    }
}

export function subscribeAuthEvents(onEvent: (evt: AuthSyncEvent) => void) {
    let bc: BroadcastChannel | null = null;

    // BroadcastChannel listener
    try {
        if ("BroadcastChannel" in window) {
            bc = new BroadcastChannel(CHANNEL_NAME);
            bc.onmessage = (e) => {
                const evt = e?.data as AuthSyncEvent | undefined;
                if (evt?.actor && evt?.action) onEvent(evt);
            };
        }
    } catch {
        bc = null;
    }

    // localStorage listener (fallback / also works alongside BC)
    const onStorage = (e: StorageEvent) => {
        if (e.key !== STORAGE_KEY) return;
        const evt = safeJsonParse<AuthSyncEvent>(e.newValue);
        if (!evt?.actor || !evt?.action) return;
        onEvent(evt);
    };

    window.addEventListener("storage", onStorage);

    return () => {
        window.removeEventListener("storage", onStorage);
        try {
            bc?.close();
        } catch {
            // ignore
        }
    };
}
