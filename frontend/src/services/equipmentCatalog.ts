import { apiGet } from "./api";

export type EquipmentCatalogItem = {
    equipment_id: number;
    code?: string | null;
    name?: string | null;
    location?: string | null;
    status?: string | null;
};

/**
 * List/search equipment catalog (robust fallback).
 * - search kosong => list semua (default)
 * - support paging (page/per_page)
 *
 * NOTE:
 * Devtools kamu menunjukkan /v1/equipment/catalog = 404.
 * Jadi kita coba beberapa kandidat endpoint yang umum dipakai.
 */
export async function searchEquipmentCatalog(search?: string, page = 1, perPage = 60) {
    const qs = new URLSearchParams();
    const q = (search ?? "").trim();
    if (q) qs.set("search", q);
    qs.set("page", String(page));
    qs.set("per_page", String(perPage));

    const query = qs.toString();

    const candidates = [
        `/v1/equipment/catalog?${query}`,
        `/v1/equipment-catalog?${query}`,
        `/v1/equipment-catalog/search?${query}`,
        `/v1/equipments/catalog?${query}`,
        `/v1/equipments?${query}`,
        `/v1/equipment?${query}`,
    ];

    let lastErr: any = null;

    for (const url of candidates) {
        try {
            return await apiGet(url);
        } catch (e: any) {
            lastErr = e;
            const status = e?.response?.status;
            // Kalau 404, coba endpoint berikutnya
            if (status === 404) continue;
            // Kalau bukan 404 (401/500), jangan ditutupin
            throw e;
        }
    }

    // Semua kandidat 404
    throw lastErr ?? new Error("No equipment catalog endpoint matched");
}
