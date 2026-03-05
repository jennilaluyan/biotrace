import { apiGet, apiPost } from "./api";

export type StaffRow = {
    staff_id: number;
    name: string;
    email: string;
    role_id: number;
    is_active: boolean;
    created_at?: string | null;
    last_seen_at?: string | null;
    is_online?: boolean;
    role?: { role_id: number; name: string };
};

export type PendingStaff = {
    staff_id: number;
    name: string;
    email: string;
    role_id: number;
    is_active: boolean;
    created_at: string;
    role?: { role_id: number; name: string };
};

function qs(params: Record<string, unknown>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (!s) continue;
        sp.set(k, s);
    }
    const q = sp.toString();
    return q ? `?${q}` : "";
}

export const fetchStaffs = async (opts?: { q?: string }) => {
    return apiGet<{ data: StaffRow[] }>(`/v1/staffs${qs({ q: opts?.q })}`);
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