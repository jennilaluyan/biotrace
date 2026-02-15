import { apiGet } from "./api";

export type ReportDocumentRow = {
    type: string;
    id: number;
    number: string;

    document_name?: string | null;
    document_code?: string | null;

    status?: string | null;
    generated_at?: string | null;
    created_at?: string | null;

    file_url?: string | null;
    download_url?: string | null;

    // Step 17 (optional)
    record_no?: string | null;
    form_code?: string | null;
    pdf_file_id?: number | null;

    sample_ids?: number[];
    lo_id?: number | null;
    reagent_request_id?: number | null;
    report_id?: number | null;
};

type ReportDocumentsResponse =
    | { data: ReportDocumentRow[] }
    | { data: { data: ReportDocumentRow[] } }
    | ReportDocumentRow[];

function unwrap(res: any): ReportDocumentRow[] {
    if (Array.isArray(res)) return res as ReportDocumentRow[];
    if (res && Array.isArray(res.data)) return res.data as ReportDocumentRow[];
    if (res && res.data && Array.isArray(res.data.data)) return res.data.data as ReportDocumentRow[];
    return [];
}

export async function listReportDocuments(opts?: { sampleId?: number }): Promise<ReportDocumentRow[]> {
    const params = opts?.sampleId ? { sample_id: opts.sampleId } : undefined;
    const res = await apiGet<ReportDocumentsResponse>("/v1/reports/documents", params ? { params } : undefined);
    return unwrap(res);
}
