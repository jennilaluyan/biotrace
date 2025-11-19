const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
    console.error("VITE_API_URL is not set");
}

// Helper untuk menangani JSON, HTML error, atau 204 No Content
async function handleResponse(res: Response) {
    const text = await res.text();

    try {
        return JSON.parse(text);
    } catch {
        return text || null;
    }
}

// ----------------------------
// GET
// ----------------------------
export async function apiGet(path: string, options?: RequestInit) {
    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: {
            Accept: "application/json",
            ...(options?.headers || {}),
        },
    });

    if (!res.ok) {
        const data = await handleResponse(res);
        throw { status: res.status, data };
    }

    return handleResponse(res);
}

// ----------------------------
// POST
// ----------------------------
export async function apiPost(path: string, body?: unknown, options?: RequestInit) {
    const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(options?.headers || {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const data = await handleResponse(res);
        throw { status: res.status, data };
    }

    return handleResponse(res);
}
