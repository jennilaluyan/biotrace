const STORAGE_KEY = "biotrace_locale";

function readStoredLocale(): "id" | "en" {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === "en" ? "en" : "id";
    } catch {
        return "id";
    }
}

function defaultFallback() {
    const loc = readStoredLocale();
    return loc === "en" ? "Something went wrong." : "Terjadi kesalahan.";
}

export function getErrorMessage(err: any, fallback?: string) {
    const fb = fallback ?? defaultFallback();

    return (
        err?.data?.message ??
        err?.data?.error ??
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message ??
        fb
    );
}
