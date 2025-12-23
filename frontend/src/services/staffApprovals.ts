import { apiGet, apiPost } from "./api";

export type PendingStaff = {
    staff_id: number;
    name: string;
    email: string;
    role_id: number;
    created_at?: string;
};

export const staffApprovalsService = {
    async listPending(): Promise<PendingStaff[]> {
        return (await apiGet<PendingStaff[]>("/v1/staffs/pending")) ?? [];
    },
    async approve(staffId: number) {
        return apiPost(`/v1/staffs/${staffId}/approve`, {});
    },
    async reject(staffId: number) {
        return apiPost(`/v1/staffs/${staffId}/reject`, {});
    },
};
