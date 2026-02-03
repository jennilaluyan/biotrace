import { apiGet } from "./api";

export type EquipmentCatalogItem = {
    equipment_id: number;
    code?: string | null;
    name?: string | null;
    location?: string | null;
    status?: string | null;
};

export async function searchEquipmentCatalog(search: string) {
    // NOTE: kalau endpoint backend kamu beda, ganti string path ini saja.
    // Saran endpoint: GET /v1/equipment/catalog?search=...
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    qs.set("per_page", "20");
    return apiGet(`/v1/equipment/catalog?${qs.toString()}`);
}
