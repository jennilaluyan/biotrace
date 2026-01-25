import { apiGet, apiPost } from "./api";

export type ClientApplication = {
    client_application_id: number;
    status: "pending" | "approved" | "rejected";
    type: "individual" | "institution";
    name: string;
    email: string;
    phone: string;

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

    created_at?: string;
};

type ApiResponse<T> = {
    status?: number;
    message?: string;
    data: T;
};

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

export const clientApprovalsService = {
    async listPending(): Promise<ClientApplication[]> {
        const res = await apiGet<ApiResponse<any>>("/v1/clients/pending");
        const payload = unwrapData<any>(res);

        // Your backend returns paginate object: { data: { data: [...] } }
        const pageData = payload?.data ?? payload;
        const items = pageData?.data ?? pageData;

        return (items ?? []) as ClientApplication[];
    },

    async approve(applicationId: number): Promise<any> {
        return apiPost(`/v1/clients/${applicationId}/approve`, {});
    },

    async reject(applicationId: number, reason?: string): Promise<any> {
        return apiPost(`/v1/clients/${applicationId}/reject`, reason ? { reason } : {});
    },
};
