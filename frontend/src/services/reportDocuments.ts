import { apiGet } from "./api";

export type ReportDocumentRow = {
    type: "LOO" | string;
    id: number;
    number: string;
    status?: string | null;
    generated_at?: string | null;
    created_at?: string | null;
    client_name?: string | null;
    client_org?: string | null;
    sample_codes?: string[];
    file_url?: string | null;
    download_url?: string | null;
};

type ReportDocumentsResponse =
    | { data: ReportDocumentRow[] }                 // expected shape
    | { data: { data: ReportDocumentRow[] } }       // axios-ish nested shape
    | ReportDocumentRow[];                          // if API returns array directly

export async function listReportDocuments(): Promise<ReportDocumentRow[]> {
    const res = (await apiGet<ReportDocumentsResponse>("/v1/reports/documents")) as any;

    // Normalize safely across possible apiGet return shapes
    if (Array.isArray(res)) return res as ReportDocumentRow[];

    if (res && Array.isArray(res.data)) return res.data as ReportDocumentRow[];

    if (res && res.data && Array.isArray(res.data.data)) return res.data.data as ReportDocumentRow[];

    return [];
}
