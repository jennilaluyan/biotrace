const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
    console.error("VITE_API_URL is not set");
}

export async function apiGet(path: string, options?: RequestInit) {
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
        },
    });

    if (!res.ok) {
        // nanti bisa dibikin handler error proper
        throw new Error(`Request failed: ${res.status}`);
    }

    return res.json();
}

export async function apiPost(path: string, body: unknown, options?: RequestInit) {
    const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options?.headers || {}),
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`);
    }

    return res.json();
}