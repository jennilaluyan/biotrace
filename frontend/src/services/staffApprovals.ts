import { apiGet, apiPost } from "./api";

export type PendingStaff = {
    staff_id: number;
    name: string;
    email: string;
    role_id: number;
    is_active: boolean;
    created_at?: string | null;
};

export type StaffRow = {
    staff_id: number;
    name: string;
    email: string;
    role_id: number;
    is_active: boolean;

    // presence (online/offline) dari backend
    is_online?: boolean | null;
    last_seen_at?: string | null;

    role?: { role_id: number; name: string } | null;
    created_at?: string | null;
};

export const fetchStaffs = () =>
    apiGet<{ data: StaffRow[] }>("/v1/staffs");

export const fetchPendingStaffs = () =>
    apiGet<{ data: PendingStaff[] }>("/v1/staffs/pending");

export const approveStaff = (staffId: number) =>
    apiPost(`/v1/staffs/${staffId}/approve`, {});

export const rejectStaff = (staffId: number, payload: { reason: string }) =>
    apiPost(`/v1/staffs/${staffId}/reject`, payload);