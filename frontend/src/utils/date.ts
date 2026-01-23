export type LabTz = "Asia/Makassar" | "Asia/Jakarta";

// ganti ke "Asia/Jakarta" kalau lab kamu WIB
export const LAB_TZ: LabTz = "Asia/Makassar";

// Indonesia tidak pakai DST, jadi offset fixed aman.
const TZ_OFFSETS: Record<LabTz, string> = {
    "Asia/Jakarta": "+07:00",
    "Asia/Makassar": "+08:00",
};

export const LAB_OFFSET = TZ_OFFSETS[LAB_TZ];

function normalizeIsoLike(input: string): string {
    let s = input.trim();

    // Keep milliseconds only:
    // 2025-12-23T03:00:00.000000Z -> 2025-12-23T03:00:00.000Z
    // 2025-12-23T11:00:00.123456+08:00 -> 2025-12-23T11:00:00.123+08:00
    s = s.replace(/(\.\d{3})\d+(?=Z$|[+-]\d{2}:\d{2}$)/, "$1");

    // If someone sends space instead of T but still has timezone suffix:
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

function hasTzSuffix(s: string): boolean {
    return /([+-]\d{2}:\d{2}|Z)$/i.test(s);
}

function parseBackendDate(input?: string | null): Date | null {
    if (!input) return null;

    const raw = input.trim();

    // 1) ISO 8601 (punya T)
    if (raw.includes("T")) {
        let iso = normalizeIsoLike(raw);

        // IMPORTANT:
        // Kalau ISO tidak punya timezone suffix, jangan biarkan Date() pakai timezone komputer.
        // Paksa interpretasi sebagai timezone lab.
        if (!hasTzSuffix(iso)) {
            iso = `${iso}${LAB_OFFSET}`;
        }

        const d = new Date(iso);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // 2) "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DD HH:mm" / optional microseconds
    // -> treat as LAB local time (NOT browser local)
    const m = raw.match(
        /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})(?::(\d{2}))?(?:\.(\d{1,6}))?$/
    );
    if (m) {
        const date = m[1];
        const hm = m[2];
        const ss = m[3] ?? "00";
        const isoLab = `${date}T${hm}:${ss}${LAB_OFFSET}`;
        const d = new Date(isoLab);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // 3) date-only "YYYY-MM-DD" (DOB)
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d = new Date(`${raw}T00:00:00${LAB_OFFSET}`);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    // fallback
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format tanggal + jam (tanpa detik) di timezone lab.
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
        timeZone: LAB_TZ,
    });
}

/**
 * Convert nilai dari <input type="datetime-local"> (YYYY-MM-DDTHH:mm)
 * ke string yang aman untuk backend: selalu punya offset.
 */
export function datetimeLocalToApi(datetimeLocal?: string | null): string {
    if (!datetimeLocal) return "";

    const s = datetimeLocal.trim();
    if (!s) return "";

    // kalau sudah ada timezone info, biarkan
    if (hasTzSuffix(s)) return s;

    const [d, t] = s.split("T");
    if (!d || !t) return s;

    return `${d}T${t}:00${LAB_OFFSET}`;
}

/**
 * Now untuk default datetime-local input, konsisten timezone lab.
 * Output: "YYYY-MM-DDTHH:mm"
 */
export function nowDatetimeLocal(): string {
    // buat Date "instant" sekarang, lalu format ke timezone lab
    const now = new Date();
    const parts = new Intl.DateTimeFormat("sv-SE", {
        timeZone: LAB_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(now);

    // sv-SE => "YYYY-MM-DD HH:mm"
    return parts.replace(" ", "T");
}
