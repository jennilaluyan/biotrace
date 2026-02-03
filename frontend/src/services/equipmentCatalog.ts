import { apiGet } from "./api";

export type EquipmentCatalogItem = {
    equipment_id: number;
    code?: string | null;
    name?: string | null;
    location?: string | null;
    status?: string | null;
};

function is404(e: any) {
    const httpStatus = e?.response?.status;
    const status1 = e?.status;
    const status2 = e?.response?.data?.status;
    const code = e?.code ?? e?.response?.data?.code;
    const msg = String(e?.message ?? e?.response?.data?.message ?? "");
    return (
        httpStatus === 404 ||
        status1 === 404 ||
        status2 === 404 ||
        code === "HTTP_404" ||
        msg.toLowerCase().includes("404") ||
        msg.toLowerCase().includes("could not be found")
    );
}

/**
 * List/search equipment catalog (robust fallback).
 * - search kosong => list semua (default)
 * - support paging (page/per_page)
 */
export async function searchEquipmentCatalog(search?: string, page = 1, perPage = 60) {
    const qs = new URLSearchParams();
    const q = (search ?? "").trim();
    if (q) qs.set("search", q);
    qs.set("page", String(page));
    qs.set("per_page", String(perPage));

    const query = qs.toString();

    // Tambah kandidat yang lebih mungkin (banyak backend taruh "catalog" di depan)
    const candidates = [
        `/v1/equipment/catalog?${query}`,
        `/v1/catalog/equipment?${query}`,
        `/v1/catalog/equipments?${query}`,
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
            if (is404(e)) continue; // coba endpoint berikutnya
            throw e; // selain 404 jangan ditutupi
        }
    }

    throw lastErr ?? new Error("No equipment catalog endpoint matched");
}
