// frontend/src/services/consumablesCatalog.ts
import { apiGet } from "./api";

const API_VER = "/v1";

export type ConsumablesCatalogType = "bhp" | "reagen";

export type ConsumablesCatalogRow = {
    catalog_id: number;

    // core
    type: ConsumablesCatalogType;
    item_name: string;
    item_code: string;

    // optional but common
    category?: string | null;
    default_unit?: string | null;

    // flags
    is_active: boolean;

    // traceability (optional)
    source_sheet?: string | null;

    created_at?: string | null;
    updated_at?: string | null;
};

export type ListConsumablesCatalogParams = {
    page?: number;
    perPage?: number;

    search?: string;
    type?: ConsumablesCatalogType;
    active?: boolean; // true/false
};

function buildListUrl(params?: ListConsumablesCatalogParams) {
    const qs = new URLSearchParams();

    if (params?.page) qs.set("page", String(params.page));
    if (params?.perPage) qs.set("per_page", String(params.perPage));

    if (params?.search) qs.set("search", params.search);
    if (params?.type) qs.set("type", params.type);
    if (typeof params?.active === "boolean") qs.set("active", params.active ? "1" : "0");

    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    // Endpoint dari Step 4.3
    return `${API_VER}/catalog/consumables${suffix}`;
}

export async function listConsumablesCatalog(params?: ListConsumablesCatalogParams) {
    return apiGet<any>(buildListUrl(params));
}
