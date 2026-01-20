import { apiGet, apiPost } from "./api";

export type ClientType = "individual" | "institution";

export type Client = {
    client_id: number;
    staff_id?: number | null;

    type: "individual" | "institution";
    name: string;
    email?: string | null;
    phone?: string | null;

    // fields lain...
    institution_name?: string | null;
    institution_address?: string | null;
    contact_person_name?: string | null;
    contact_person_phone?: string | null;
    contact_person_email?: string | null;

    national_id?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    address_ktp?: string | null;
    address_domicile?: string | null;

    created_at?: string;
    updated_at?: string | null;
    is_active?: boolean | null;
    deleted_at?: string | null;
};

// Payload untuk CREATE (staff_id diisi di backend dari user login)
export interface CreateClientPayload {
    type: ClientType;

    name: string;
    phone?: string | null;
    email?: string | null;

    national_id?: string | null;
    date_of_birth?: string | null;
    gender?: string | null;
    address_ktp?: string | null;
    address_domicile?: string | null;

    institution_name?: string | null;
    institution_address?: string | null;
    contact_person_name?: string | null;
    contact_person_phone?: string | null;
    contact_person_email?: string | null;
}

// Payload untuk UPDATE – partial dari create
export type UpdateClientPayload = Partial<CreateClientPayload>;

// Helper untuk ambil `data` dari ApiResponse { data: ... } atau langsung object
function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) {
        return res.data as T;
    }
    return res as T;
}

export const clientService = {
    // GET /v1/clients
    async getAll(): Promise<Client[]> {
        const res = await apiGet<any>("/v1/clients");
        return unwrapData<Client[]>(res);
    },

    // GET /v1/clients/:id
    async getById(id: number): Promise<Client> {
        const res = await apiGet<any>(`/v1/clients/${id}`);
        return unwrapData<Client>(res);
    },

    // POST /v1/clients
    async create(payload: CreateClientPayload): Promise<Client> {
        const res = await apiPost<any>("/v1/clients", payload);
        return unwrapData<Client>(res);
    },

    // PATCH /v1/clients/:id  (pakai _method=PATCH karena kita cuma punya apiPost)
    async update(id: number, payload: UpdateClientPayload): Promise<Client> {
        const res = await apiPost<any>(`/v1/clients/${id}?_method=PATCH`, payload);
        return unwrapData<Client>(res);
    },

    // DELETE /v1/clients/:id  (soft delete sesuai backend)
    async destroy(id: number): Promise<void> {
        await apiPost(`/v1/clients/${id}?_method=DELETE`);
    },
};