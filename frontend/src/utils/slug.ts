import type { Client } from "../services/clients";

export function toClientSlug(client: Client): string {
    const namePart = (client.name || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")   // buang karakter aneh
        .replace(/\s+/g, "-")           // spasi → -
        .replace(/-+/g, "-");           // multiple - → single

    return `${namePart || "client"}-${client.client_id}`;
}

export function clientIdFromSlug(slug?: string | null): number | null {
    if (!slug) return null;
    const parts = slug.split("-");
    const maybeId = parts[parts.length - 1];
    const id = Number(maybeId);
    return Number.isNaN(id) ? null : id;
}
