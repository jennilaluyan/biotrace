const LAB_TZ = "Asia/Makassar"; // ganti ke "Asia/Jakarta" kalau lab kamu WIB

function normalizeIsoLike(input: string): string {
    let s = input.trim();

    // Normalize ISO fractional seconds: keep milliseconds only
    // e.g. 2025-12-23T03:00:00.000000Z -> 2025-12-23T03:00:00.000Z
    // e.g. 2025-12-23T11:00:00.123456+08:00 -> 2025-12-23T11:00:00.123+08:00
    s = s.replace(/(\.\d{3})\d+(?=Z$|[+-]\d{2}:\d{2}$)/, "$1");

    // If someone sends space instead of T but still has timezone suffix, normalize
    // 2025-12-23 11:00:00+08:00 -> 2025-12-23T11:00:00+08:00
    if (
        !s.includes("T") &&
        /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(s) &&
        /([+-]\d{2}:\d{2}|Z)$/.test(s)
    ) {
        s = s.replace(" ", "T");
    }

    return s;
}

function parseBackendDate(input?: string | null): Date | null {
    if (!input) return null;

    const raw = input.trim();

    // 1) ISO 8601 (punya T) -> normalize dulu (microseconds, dll)
    //    NOTE: Kalau string punya offset/Z, Date akan parse sebagai "instant" yang benar.
    if (raw.includes("T")) {
        const iso = normalizeIsoLike(raw);
        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // 2) "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DD HH:mm" / + optional microseconds
    //    -> parse sebagai LOCAL time (tanpa timezone)
    const m = raw.match(
        /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d{1,6}))?$/
    );
    if (m) {
        const date = m[1];
        const hm = m[2];
        const ss = m[3] ?? "00";
        const isoLocal = `${date}T${hm}:${ss}`; // TANPA Z => local time
        const d = new Date(isoLocal);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // 3) date-only "YYYY-MM-DD" (DOB)
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d = new Date(`${raw}T00:00:00`);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // fallback
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format tanggal + jam (tanpa detik).
 * Backend sudah kirim offset +08:00, tapi kita kunci tampilan ke timezone lab
 * supaya semua PC konsisten.
 */
export function formatDate(input?: string | null): string {
    const d = parseBackendDate(input);
    if (!d) return input ?? "-";

    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: LAB_TZ,
    });
}

/** Format tanggal saja (untuk DOB). */
export function formatDateOnly(input?: string | null): string {
    const d = parseBackendDate(input);
    if (!d) return input ?? "-";

    return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        timeZone: LAB_TZ,
    });
}

/** Format tanggal + jam + detik (audit trail / logs / comments). */
export function formatDateTimeLocal(input?: string | null): string {
    const d = parseBackendDate(input);
    if (!d) return input ?? "-";

    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: LAB_TZ, // ❌ jangan UTC, biar tidak geser lagi
    });
}
