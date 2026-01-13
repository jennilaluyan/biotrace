// src/services/reports.ts
import { apiGet } from "./api";

export type ReportRow = {
    report_id: number;
    report_no: string;
    sample_id: number;
    client_name: string;
    generated_at: string;
    is_locked: boolean;
};

export type Paginator<T> = {
    current_page: number;
    data: T[];
    per_page: number;
    total: number;
    last_page: number;
};

export type ReportsQuery = {
    page?: number;
    per_page?: number;
    q?: string;
    date?: string;
};

export async function fetchReports(
    query: ReportsQuery
): Promise<Paginator<ReportRow>> {
    const qs = new URLSearchParams();

    if (query.page) qs.set("page", String(query.page));
    qs.set("per_page", String(query.per_page ?? 10));
    if (query.q) qs.set("q", query.q);
    if (query.date) qs.set("date", query.date);

    // apiGet SUDAH return data (BUKAN AxiosResponse)
    const payload = await apiGet<Paginator<ReportRow>>(
        `/v1/reports?${qs.toString()}`
    );

    // HARD ASSERT — sekarang PASTI lolos
    if (
        !payload ||
        !Array.isArray(payload.data) ||
        typeof payload.current_page !== "number"
    ) {
        console.error("Invalid reports paginator response:", payload);
        throw new Error("Invalid reports response format");
    }

    return payload;
}
