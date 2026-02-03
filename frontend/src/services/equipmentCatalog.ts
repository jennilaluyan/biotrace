import { apiGet } from "./api";

export type EquipmentCatalogItem = {
    equipment_id: number;
    code?: string | null;
    name?: string | null;
    location?: string | null;
    status?: string | null;
};

/**
 * List/search equipment catalog.
 * - search kosong => list semua (default)
 * - support paging (page/per_page)
 */
export async function searchEquipmentCatalog(search?: string, page = 1, perPage = 60) {
    // NOTE: kalau endpoint backend kamu beda, ganti string path ini saja.
    // Endpoint saat ini: GET /v1/equipment/catalog?search=...&page=...&per_page=...
    const qs = new URLSearchParams();

    const q = (search ?? "").trim();
    if (q) qs.set("search", q);

    qs.set("page", String(page));
    qs.set("per_page", String(perPage));

    return apiGet(`/v1/equipment/catalog?${qs.toString()}`);
}
