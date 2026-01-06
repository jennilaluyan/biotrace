// frontend/src/services/auditLogs.ts
import { apiGet } from "./api";

export type AuditLogRow = {
    log_id: number;
    staff_id?: number | null;
    entity_name?: string | null;
    entity_id?: number | null;
    action: string;
    timestamp: string;
    ip_address?: string | null;
    old_values?: any;
    new_values?: any;
};

export type Paginator<T> = {
    current_page: number;
    data: T[];
    first_page_url?: string | null;
    from?: number | null;
    last_page?: number;
    last_page_url?: string | null;
    next_page_url?: string | null;
    path?: string | null;
    per_page: number;
    prev_page_url?: string | null;
    to?: number | null;
    total: number;
};

export type AuditLogsQuery = {
    page?: number;
    per_page?: number;
    sample_id?: number;
    sample_test_id?: number;
    staff_id?: number;
    action?: string;
};

export async function fetchAuditLogs(
    query: AuditLogsQuery
): Promise<Paginator<AuditLogRow>> {
    const qs = new URLSearchParams();

    if (query.page) qs.set("page", String(query.page));
    qs.set("per_page", String(query.per_page ?? 25));

    if (query.sample_id) qs.set("sample_id", String(query.sample_id));
    if (query.sample_test_id) qs.set("sample_test_id", String(query.sample_test_id));
    if (query.staff_id) qs.set("staff_id", String(query.staff_id));
    if (query.action) qs.set("action", query.action);

    const res = await apiGet<any>(`/v1/audit-logs?${qs.toString()}`);

    // Backend kamu kadang bungkus: {status, message, data: paginator}
    // kadang langsung paginator → ini dibuat robust
    const pager: Paginator<AuditLogRow> = res?.data ?? res;
    return pager;
}
