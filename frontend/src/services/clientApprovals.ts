import { apiPost } from "./api";
import { clientService, type Client } from "./clients";

export const clientApprovalsService = {
    async listPending(): Promise<Client[]> {
        const all = await clientService.getAll(); // ✅ sudah unwrap
        return (all ?? []).filter((c) => c.is_active === false && !c.deleted_at);
    },

    async approve(clientId: number) {
        return apiPost(`/v1/clients/${clientId}/approve`, {});
    },

    async reject(clientId: number) {
        return apiPost(`/v1/clients/${clientId}/reject`, {});
    },
};