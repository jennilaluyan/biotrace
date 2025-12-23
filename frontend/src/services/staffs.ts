import { apiGet, apiPost } from "./api";

export type PendingStaff = {
    staff_id: number;
    name: string;
    email: string;
    role_id: number;
    is_active: boolean;
    created_at: string;
    role?: { role_id: number; name: string };
};

export const fetchPendingStaffs = async () => {
    return apiGet<{ data: PendingStaff[] }>("/v1/staffs/pending");
};

export const approveStaff = async (staffId: number) => {
    return apiPost(`/v1/staffs/${staffId}/approve`);
};

export const rejectStaff = async (staffId: number, note?: string) => {
    return apiPost(`/v1/staffs/${staffId}/reject`, { note });
};
