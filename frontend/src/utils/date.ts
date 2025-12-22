// src/utils/date.ts

/**
 * Format tanggal + jam (tanpa detik) sesuai timezone browser user.
 * Cocok untuk: received_at, created_at, updated_at (umum di UI table/detail)
 */
export function formatDate(input?: string | null): string {
    if (!input) return "-";

    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return input;

    // Contoh output: 18 Dec 2025, 14:15
    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/**
 * Format tanggal + jam + detik sesuai timezone browser user.
 * Cocok untuk: audit trail logs (butuh detik)
 */
export function formatDateTimeLocal(input?: string | null): string {
    if (!input) return "-";

    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return input; // fallback kalau parsing gagal

    return d.toLocaleString(undefined, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}
