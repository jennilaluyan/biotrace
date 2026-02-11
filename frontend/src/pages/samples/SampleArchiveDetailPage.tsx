import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, FileText, RefreshCw } from "lucide-react";

import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";

import {
    fetchSampleArchiveDetail,
    type ArchiveDocument,
    type ArchiveTimelineEvent,
    type SampleArchiveDetail,
} from "../../services/sampleArchive";

import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";
import { ReportPreviewModal } from "../../components/reports/ReportPreviewModal";

type RenderDoc = {
    type: string;
    label: string;
    kind: "pdf_url" | "report_preview";
    pdfUrl?: string | null;
    reportId?: number | null;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function safeText(v: any) {
    if (v === null || v === undefined) return "-";
    const s = String(v).trim();
    return s.length ? s : "-";
}

function buildLabel(row: ReportDocumentRow) {
    const name = (row.document_name ?? row.type ?? "Document").trim();
    const code = (row.document_code ?? row.number ?? "").trim();
    return code ? `${name} (${code})` : name;
}

function normalizeTimeline(d?: SampleArchiveDetail | null): ArchiveTimelineEvent[] {
    const raw =
        ((d as any)?.timeline ??
            (d as any)?.history ??
            (d as any)?.events ??
            (d as any)?.status_history ??
            (d as any)?.audit_logs ??
            []) as any[];

    const out: ArchiveTimelineEvent[] = [];
    for (const x of raw) {
        const at = x?.at ?? x?.created_at ?? x?.time ?? x?.timestamp;
        const title = x?.title ?? x?.action ?? x?.event ?? x?.event_name ?? x?.status ?? "Event";
        if (!at) continue;

        out.push({
            at: String(at),
            title: String(title),
            actor_name: x?.actor_name ?? x?.staff_name ?? x?.by ?? x?.actor_email ?? null,
            note: x?.note ?? x?.message ?? x?.description ?? null,
            meta: x?.meta ?? null,
        });
    }

    out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return out;
}

function normalizeFallbackDocs(d?: SampleArchiveDetail | null, latestReportId?: number | null): RenderDoc[] {
    const docs: RenderDoc[] = [];
    const fromArray = ((d as any)?.documents ?? []) as Array<ArchiveDocument & { download_url?: string | null }>;

    for (const x of fromArray) {
        const url = x?.download_url ?? x?.file_url;
        if (!url) continue;
        docs.push({
            type: String(x?.type ?? "document"),
            label: String(x?.label ?? "Document"),
            kind: "pdf_url",
            pdfUrl: String(url),
        });
    }

    const loo = (d as any)?.loo ?? null;
    const loId = (d as any)?.lo_id ?? null;
    const loNumber = (d as any)?.lo_number ?? loo?.number ?? null;
    const loFile = (d as any)?.lo_file_url ?? loo?.file_url ?? loo?.pdf_url ?? null;

    if (loId) {
        docs.push({
            type: "LOO",
            label: loNumber ? `Letter of Order (LOO) (${loNumber})` : "Letter of Order (LOO)",
            kind: "pdf_url",
            pdfUrl: `/api/v1/reports/documents/loo/${loId}/pdf`,
        });
    } else if (loFile) {
        docs.push({
            type: "LOO",
            label: loNumber ? `Letter of Order (LOO) (${loNumber})` : "Letter of Order (LOO)",
            kind: "pdf_url",
            pdfUrl: String(loFile),
        });
    }

    const reports = (((d as any)?.reports ?? []) as any[]) || [];
    const latest = reports?.[0] ?? null;

    const reportId =
        typeof latest?.report_id === "number"
            ? (latest.report_id as number)
            : typeof latestReportId === "number"
                ? latestReportId
                : null;

    if (reportId) {
        docs.push({
            type: "COA",
            label: "Certificate of Analysis (CoA)",
            kind: "report_preview",
            reportId,
        });
    }

    const seen = new Set<string>();
    return docs.filter((x) => {
        const k = x.kind === "report_preview" ? `report:${x.reportId ?? ""}` : `url:${x.pdfUrl ?? ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

export function SampleArchiveDetailPage() {
    const nav = useNavigate();
    const params = useParams();
    const sampleId = Number((params as any).sampleId ?? (params as any).sample_id);

    const [data, setData] = useState<SampleArchiveDetail | null>(null);
    const [repoDocs, setRepoDocs] = useState<ReportDocumentRow[]>([]);
    const [repoDocsError, setRepoDocsError] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pageRefreshing, setPageRefreshing] = useState(false);

    const [previewReportId, setPreviewReportId] = useState<number | null>(null);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState<string>("PDF Preview");
    const [previewOpen, setPreviewOpen] = useState(false);

    async function load(opts?: { silent?: boolean }) {
        try {
            if (!opts?.silent) setLoading(true);
            setError(null);

            const res = await fetchSampleArchiveDetail(sampleId);
            setData((res as any)?.data ?? null);

            try {
                const docs = await listReportDocuments({ sampleId });
                setRepoDocs(docs);
                setRepoDocsError(null);
            } catch (e) {
                setRepoDocs([]);
                setRepoDocsError(getErrorMessage(e));
            }
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            if (!opts?.silent) setLoading(false);
        }
    }

    const refresh = async () => {
        try {
            setPageRefreshing(true);
            await load({ silent: true });
        } finally {
            setPageRefreshing(false);
        }
    };

    useEffect(() => {
        if (!Number.isFinite(sampleId) || sampleId <= 0) {
            setError("Invalid sample id.");
            return;
        }
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId]);

    const sample = (data as any)?.sample ?? null;
    const client = (data as any)?.client ?? null;
    const loo = (data as any)?.loo ?? null;
    const reports = (((data as any)?.reports ?? []) as any[]) || [];
    const latestReport = reports?.[0] ?? null;

    const latestReportId =
        typeof latestReport?.report_id === "number"
            ? (latestReport.report_id as number)
            : typeof (data as any)?.coa_report_id === "number"
                ? ((data as any).coa_report_id as number)
                : null;

    const docs = useMemo<RenderDoc[]>(() => {
        if (repoDocs.length) {
            return repoDocs
                .map((r) => {
                    const url = (r.download_url ?? r.file_url ?? "").trim();
                    if (!url) return null;
                    return {
                        type: String(r.type ?? "document"),
                        label: buildLabel(r),
                        kind: "pdf_url" as const,
                        pdfUrl: url,
                    };
                })
                .filter(Boolean) as RenderDoc[];
        }

        return normalizeFallbackDocs(data, latestReportId);
    }, [repoDocs, data, latestReportId]);

    const timeline = useMemo(() => normalizeTimeline(data), [data]);

    const labCode = (data as any)?.lab_sample_code ?? sample?.lab_sample_code ?? `#${sampleId}`;
    const clientName = (data as any)?.client_name ?? client?.name ?? (data as any)?.client_id ?? sample?.client_id;
    const workflowGroup = (data as any)?.workflow_group ?? sample?.workflow_group;

    const finalStatus =
        (data as any)?.current_status ??
        sample?.current_status ??
        (data as any)?.request_status ??
        sample?.request_status;

    const loNumber = (data as any)?.lo_number ?? loo?.number ?? (data as any)?.lo_id ?? null;
    const loGeneratedAt = (data as any)?.lo_generated_at ?? loo?.generated_at ?? loo?.created_at ?? null;

    const coaNumber =
        (data as any)?.coa_number ?? latestReport?.report_no ?? latestReport?.number ?? (data as any)?.coa_report_id ?? null;

    const coaGeneratedAt =
        (data as any)?.coa_generated_at ?? latestReport?.generated_at ?? latestReport?.created_at ?? null;

    const archivedAt =
        (data as any)?.archived_at ?? sample?.archived_at ?? sample?.reported_at ?? sample?.updated_at ?? null;

    const requestedParams =
        ((data as any)?.requested_parameters ?? (data as any)?.requestedParameters ?? sample?.requestedParameters ?? []) as any[];

    const openDocPreview = (doc: RenderDoc) => {
        if (doc.kind === "report_preview" && doc.reportId) {
            setPreviewReportId(doc.reportId);
            return;
        }

        const url = String(doc.pdfUrl ?? "").trim();
        if (!url) return;

        setPreviewPdfUrl(url);
        setPreviewTitle(`${doc.label} Preview`);
        setPreviewOpen(true);
    };

    return (
        <div className="min-h-[60vh]">
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/samples" className="lims-breadcrumb-link">
                        Samples
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <Link to="/samples/archive" className="lims-breadcrumb-link">
                        Archive
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">Detail</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {loading && <div className="text-sm text-gray-600">Loading…</div>}

                {error && !loading && (
                    <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
                )}

                {!loading && !error && (
                    <div className="space-y-6">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3">
                                <button
                                    type="button"
                                    className="lims-icon-button"
                                    onClick={() => nav(-1)}
                                    aria-label="Back"
                                    title="Back"
                                >
                                    <ArrowLeft size={16} />
                                </button>

                                <div>
                                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample Archive</h1>

                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-gray-500">Lab code</span>
                                        <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                            {safeText(labCode)}
                                        </span>

                                        {archivedAt ? (
                                            <span className="text-[11px] text-gray-500">
                                                archived {formatDateTimeLocal(archivedAt)}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="lims-icon-button"
                                    onClick={refresh}
                                    disabled={pageRefreshing}
                                    aria-label="Refresh"
                                    title="Refresh"
                                >
                                    <RefreshCw size={16} className={cx(pageRefreshing && "animate-spin")} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden lg:col-span-2">
                                <div className="px-5 py-4 border-b border-gray-100 bg-white">
                                    <div className="text-sm font-extrabold text-gray-900">Overview</div>
                                    <div className="text-xs text-gray-500 mt-1">Ringkasan sample + status akhir.</div>
                                </div>

                                <div className="px-5 py-5">
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div>
                                            <div className="text-xs text-gray-500">Client</div>
                                            <div className="text-sm font-semibold text-gray-900">{safeText(clientName)}</div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">Workflow Group</div>
                                            <div className="text-sm font-semibold text-gray-900">{safeText(workflowGroup)}</div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">Status (Final)</div>
                                            <div className="text-sm font-semibold text-gray-900">{safeText(finalStatus)}</div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">Archived At</div>
                                            <div className="text-sm font-semibold text-gray-900">
                                                {archivedAt ? formatDateTimeLocal(archivedAt) : "-"}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">LOO</div>
                                            <div className="text-sm font-semibold text-gray-900">{safeText(loNumber)}</div>
                                            {loGeneratedAt ? (
                                                <div className="text-xs text-gray-500">{formatDateTimeLocal(loGeneratedAt)}</div>
                                            ) : null}
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">COA</div>
                                            <div className="text-sm font-semibold text-gray-900">{safeText(coaNumber)}</div>
                                            {coaGeneratedAt ? (
                                                <div className="text-xs text-gray-500">{formatDateTimeLocal(coaGeneratedAt)}</div>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-6">
                                        <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                            Requested Parameters
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {requestedParams.length ? (
                                                requestedParams.map((p: any, idx: number) => (
                                                    <span
                                                        key={`${p?.parameter_id ?? p?.id ?? p?.name ?? idx}`}
                                                        className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                                                    >
                                                        {safeText(p?.name ?? p?.parameter_name ?? p?.label)}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-sm text-gray-500">-</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 bg-white">
                                    <div className="text-sm font-extrabold text-gray-900">Documents</div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        Dokumen diambil dari repository dokumen (sample-scoped).
                                    </div>
                                </div>

                                <div className="px-5 py-5 space-y-3">
                                    {repoDocsError ? (
                                        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                            Failed to load documents repository: {repoDocsError}
                                        </div>
                                    ) : null}

                                    {docs.length === 0 ? (
                                        <div className="text-sm text-gray-600">No documents found.</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {docs.map((d, idx) => (
                                                <button
                                                    key={`${d.type}-${idx}`}
                                                    type="button"
                                                    onClick={() => openDocPreview(d)}
                                                    className="w-full text-left flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                                                >
                                                    <div className="min-w-0 flex items-start gap-2">
                                                        <span className="mt-0.5 text-gray-500">
                                                            <FileText size={16} />
                                                        </span>

                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-gray-900 truncate">{d.label}</div>
                                                            <div className="text-xs text-gray-500 truncate">
                                                                {safeText(d.type)?.toUpperCase?.() ?? d.type}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <span className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shrink-0">
                                                        <Eye size={16} />
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className="pt-2">
                                        <Link className="text-sm text-gray-700 underline" to="/samples/archive">
                                            Back to Archive List
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-white">
                                <div className="text-sm font-extrabold text-gray-900">Workflow Timeline</div>
                                <div className="text-xs text-gray-500 mt-1">Event workflow dari audit logs / timeline payload.</div>
                            </div>

                            <div className="px-5 py-5">
                                {timeline.length === 0 ? (
                                    <div className="text-sm text-gray-600">No timeline events.</div>
                                ) : (
                                    <ol className="space-y-2">
                                        {timeline.map((e, idx) => (
                                            <li key={`${e.at}-${idx}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                                    <div className="text-sm font-semibold text-gray-900">{e.title}</div>
                                                    <div className="text-xs text-gray-600">{formatDateTimeLocal(e.at)}</div>
                                                </div>

                                                <div className="mt-1 text-xs text-gray-600">
                                                    {e.actor_name ? <span>By: {e.actor_name}</span> : <span>By: -</span>}
                                                </div>

                                                {e.note ? (
                                                    <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{e.note}</div>
                                                ) : null}
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ReportPreviewModal open={previewReportId !== null} reportId={previewReportId} onClose={() => setPreviewReportId(null)} />

            <ReportPreviewModal
                open={previewOpen}
                onClose={() => {
                    setPreviewOpen(false);
                    setPreviewPdfUrl(null);
                }}
                pdfUrl={previewPdfUrl}
                title={previewTitle}
            />
        </div>
    );
}
