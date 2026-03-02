import { apiPost } from "./api";

export async function releaseCoaToClient(reportId: number, note?: string | null) {
    const payload = note ? { note } : {};
    const res = await apiPost(`/v1/reports/${reportId}/release-coa`, payload);
    return (res as any)?.data ?? res;
}

export async function markCoaChecked(reportId: number) {
    const res = await apiPost(`/v1/reports/${reportId}/coa-check`, {});
    return (res as any)?.data ?? res;
}