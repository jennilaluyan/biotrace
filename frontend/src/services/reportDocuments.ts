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
    record_no?: string | null;
    form_code?: string | null;
    pdf_file_id?: number | null;
    sample_ids?: number[];
    batch_total?: number;
    lo_id?: number | null;
    reagent_request_id?: number | null;
    report_id?: number | null;
};

type ReportDocumentsResponse =
    | { data: ReportDocumentRow[] }
    | { data: { data: ReportDocumentRow[] } }
    | ReportDocumentRow[];

function unwrap(res: unknown): ReportDocumentRow[] {
    if (Array.isArray(res)) return res as ReportDocumentRow[];
    if (res && typeof res === "object" && Array.isArray((res as any).data)) {
        return (res as any).data as ReportDocumentRow[];
    }
    if (
        res &&
        typeof res === "object" &&
        (res as any).data &&
        Array.isArray((res as any).data.data)
    ) {
        return (res as any).data.data as ReportDocumentRow[];
    }
    return [];
}

export async function listReportDocuments(opts?: {
    sampleId?: number;
}): Promise<ReportDocumentRow[]> {
    const params = opts?.sampleId ? { sample_id: opts.sampleId } : undefined;
    const res = await apiGet<ReportDocumentsResponse>(
        "/v1/reports/documents",
        params ? { params } : undefined
    );

    return unwrap(res);
}