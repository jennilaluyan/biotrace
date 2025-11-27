// src/services/clients.ts
import { apiGet, apiPost } from "./api";

// Bentuk response standar dari backend (ApiResponse helper)
type ApiResponse<T> = {
    timestamp: string;
    status: number;
    message: string;
    data: T;
    context?: any;
};

// Sesuai migration clients table
export interface Client {
    client_id: number;
    staff_id: number;
    type: "individual" | "institution";

    // Common fields
    name: string;
    phone: string | null;
    email: string | null;

    // Individual only
    national_id: string | null;
    date_of_birth: string | null; // ISO string dari backend: "2025-01-20"
    gender: string | null;
    address_ktp: string | null;
    address_domicile: string | null;

    // Institutional only
    institution_name: string | null;
    institution_address: string | null;
    contact_person_name: string | null;
    contact_person_phone: string | null;
    contact_person_email: string | null;

    // Timestamps
    created_at: string;   // Laravel timestampTz → string
    updated_at: string | null;
}

// Payload untuk membuat client baru
export interface CreateClientPayload {
    staff_id: number;
    type: "individual" | "institution";

    // Common fields
    name: string;
    phone?: string | null;
    email?: string | null;

    // Individual fields
    national_id?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    address_ktp?: string | null;
    address_domicile?: string | null;

    // Institutional fields
    institution_name?: string | null;
    institution_address?: string | null;
    contact_person_name?: string | null;
    contact_person_phone?: string | null;
    contact_person_email?: string | null;
}

// Kumpulan fungsi untuk operasi Clients
export const clientService = {
    // GET /v1/clients
    async getAll(): Promise<Client[]> {
        const res = await apiGet<ApiResponse<Client[]>>("/v1/clients");
        return res.data; // <- ambil array di dalam wrapper
    },

    // GET /v1/clients/:id
    async getById(id: number): Promise<Client> {
        const res = await apiGet<ApiResponse<Client>>(`/v1/clients/${id}`);
        return res.data;
    },

    // POST /v1/clients
    async create(payload: CreateClientPayload): Promise<Client> {
        const res = await apiPost<ApiResponse<Client>>("/v1/clients", payload);
        return res.data;
    }
};
