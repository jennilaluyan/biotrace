// L:\Campus\Final Countdown\biotrace\frontend\src\pages\samples\SampleArchiveDetailPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

function safeText(v: any, fallback = "—") {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim();
    return s.length ? s : fallback;
}

function buildLabel(row: ReportDocumentRow, fallbackDocLabel: string) {
    const name = (row.document_name ?? row.type ?? fallbackDocLabel).trim();
    const code = (row.document_code ?? row.number ?? "").trim();
    return code ? `${name} (${code})` : name || fallbackDocLabel;
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

function normalizeFallbackDocs(
    d?: SampleArchiveDetail | null,
    latestReportId?: number | null,
    labels?: { docFallback: string; loo: string; coa: string }
): RenderDoc[] {
    const docs: RenderDoc[] = [];
    const fromArray = ((d as any)?.documents ?? []) as Array<ArchiveDocument & { download_url?: string | null }>;

    for (const x of fromArray) {
        const url = x?.download_url ?? x?.file_url;
        if (!url) continue;
        docs.push({
            type: String(x?.type ?? "document"),
            label: String(x?.label ?? labels?.docFallback ?? "Document"),
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
            label: loNumber ? `${labels?.loo ?? "Letter of Order (LOO)"} (${loNumber})` : labels?.loo ?? "Letter of Order (LOO)",
            kind: "pdf_url",
            pdfUrl: `/api/v1/reports/documents/loo/${loId}/pdf`,
        });
    } else if (loFile) {
        docs.push({
            type: "LOO",
            label: loNumber ? `${labels?.loo ?? "Letter of Order (LOO)"} (${loNumber})` : labels?.loo ?? "Letter of Order (LOO)",
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
            label: labels?.coa ?? "Certificate of Analysis (COA)",
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
    const { t } = useTranslation();

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
    const [previewTitle, setPreviewTitle] = useState<string>(() =>
        t("samples.pages.archiveDetail.previewTitle", { defaultValue: "PDF Preview" })
    );
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
            setError(getErrorMessage(e) || t("samples.pages.archiveDetail.detailLoadError", { defaultValue: "Failed to load archive detail." }));
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
            setError(t("invalidId", { defaultValue: "Invalid id." }));
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
        const docFallback = t("document", { defaultValue: "Document" });
        const looLabel = t("samples.pages.archiveDetail.docs.loo", { defaultValue: "Letter of Order (LOO)" });
        const coaLabel = t("samples.pages.archiveDetail.docs.coa", { defaultValue: "Certificate of Analysis (COA)" });

        const primary: RenderDoc[] = repoDocs.length
            ? (repoDocs
                .map((r) => {
                    const url = (r.download_url ?? r.file_url ?? "").trim();
                    if (!url) return null;
                    return {
                        type: String(r.type ?? "document"),
                        label: buildLabel(r, docFallback),
                        kind: "pdf_url" as const,
                        pdfUrl: url,
                    };
                })
                .filter(Boolean) as RenderDoc[])
            : [];

        const fallback = normalizeFallbackDocs(data, latestReportId, {
            docFallback,
            loo: looLabel,
            coa: coaLabel,
        });

        const out: RenderDoc[] = [];
        const seen = new Set<string>();

        for (const d of [...primary, ...fallback]) {
            const key = d.kind === "report_preview" ? `report:${d.reportId ?? ""}` : `url:${String(d.pdfUrl ?? "").trim()}`;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(d);
        }

        return out;
    }, [repoDocs, data, latestReportId, t]);

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

    const coaGeneratedAt = (data as any)?.coa_generated_at ?? latestReport?.generated_at ?? latestReport?.created_at ?? null;

    const archivedAt =
        (data as any)?.archived_at ?? sample?.archived_at ?? sample?.reported_at ?? sample?.updated_at ?? null;

    const requestedParams =
        ((data as any)?.requested_parameters ??
            (data as any)?.requestedParameters ??
            sample?.requestedParameters ??
            []) as any[];

    const openDocPreview = (doc: RenderDoc) => {
        if (doc.kind === "report_preview" && doc.reportId) {
            setPreviewReportId(doc.reportId);
            return;
        }

        const url = String(doc.pdfUrl ?? "").trim();
        if (!url) return;

        setPreviewPdfUrl(url);
        setPreviewTitle(
            t("samples.pages.archiveDetail.previewDocTitle", {
                name: doc.label,
                defaultValue: "{{name}} — Preview",
            })
        );
        setPreviewOpen(true);
    };

    return (
        <div className="min-h-[60vh]">
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/samples" className="lims-breadcrumb-link">
                        {t("samplesPage.title", { defaultValue: "Samples" })}
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <Link to="/samples/archive" className="lims-breadcrumb-link">
                        {t("samples.pages.archive.titleShort", { defaultValue: "Archive" })}
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">{t("common.detail", { defaultValue: "Detail" })}</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {loading && <div className="text-sm text-gray-600">{t("loading", { defaultValue: "Loading…" })}</div>}

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
                                    aria-label={t("back", { defaultValue: "Back" })}
                                    title={t("back", { defaultValue: "Back" })}
                                >
                                    <ArrowLeft size={16} />
                                </button>

                                <div>
                                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                                        {t("samples.pages.archiveDetail.detailTitle", { defaultValue: "Sample Archive Detail" })}
                                    </h1>

                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-gray-500">
                                            {t("samples.pages.archive.table.labCode", { defaultValue: "Lab Code" })}
                                        </span>
                                        <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                            {safeText(labCode, t("na", { defaultValue: "—" }))}
                                        </span>

                                        {archivedAt ? (
                                            <span className="text-[11px] text-gray-500">
                                                {t("samples.pages.archiveDetail.archivedAtLabel", "archived {{at}}", {
                                                    at: formatDateTimeLocal(archivedAt),
                                                })}
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
                                    aria-label={t("refresh", { defaultValue: "Refresh" })}
                                    title={t("refresh", { defaultValue: "Refresh" })}
                                >
                                    <RefreshCw size={16} className={cx(pageRefreshing && "animate-spin")} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                            {/* Overview */}
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden lg:col-span-2">
                                <div className="px-5 py-4 border-b border-gray-100 bg-white">
                                    <div className="text-sm font-extrabold text-gray-900">
                                        {t("overview", { defaultValue: "Overview" })}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {t("samples.pages.archiveDetail.overviewHint", { defaultValue: "Summary of the archived sample and final status." })}
                                    </div>
                                </div>

                                <div className="px-5 py-5">
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div>
                                            <div className="text-xs text-gray-500">{t("client", { defaultValue: "Client" })}</div>
                                            <div className="text-sm font-semibold text-gray-900">
                                                {safeText(clientName, t("na", { defaultValue: "—" }))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">
                                                {t("samples.workflowGroup", { defaultValue: "Workflow Group" })}
                                            </div>
                                            <div className="text-sm font-semibold text-gray-900">
                                                {safeText(workflowGroup, t("na", { defaultValue: "—" }))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">
                                                {t("samples.pages.archiveDetail.finalStatus", { defaultValue: "Status (Final)" })}
                                            </div>
                                            <div className="text-sm font-semibold text-gray-900">
                                                {safeText(finalStatus, t("na", { defaultValue: "—" }))}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">
                                                {t("samples.pages.archiveDetail.archivedAt", { defaultValue: "Archived At" })}
                                            </div>
                                            <div className="text-sm font-semibold text-gray-900">
                                                {archivedAt ? formatDateTimeLocal(archivedAt) : t("na", { defaultValue: "—" })}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">
                                                {t("samples.pages.archiveDetail.docs.looShort", { defaultValue: "LOO" })}
                                            </div>
                                            <div className="text-sm font-semibold text-gray-900">
                                                {safeText(loNumber, t("na", { defaultValue: "—" }))}
                                            </div>
                                            {loGeneratedAt ? (
                                                <div className="text-xs text-gray-500">{formatDateTimeLocal(loGeneratedAt)}</div>
                                            ) : null}
                                        </div>

                                        <div>
                                            <div className="text-xs text-gray-500">
                                                {t("samples.pages.archiveDetail.docs.coaShort", { defaultValue: "COA" })}
                                            </div>
                                            <div className="text-sm font-semibold text-gray-900">
                                                {safeText(coaNumber, t("na", { defaultValue: "—" }))}
                                            </div>
                                            {coaGeneratedAt ? (
                                                <div className="text-xs text-gray-500">{formatDateTimeLocal(coaGeneratedAt)}</div>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="mt-6">
                                        <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                                            {t("samples.requestedParameters", { defaultValue: "Requested Parameters" })}
                                        </div>

                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {requestedParams.length ? (
                                                requestedParams.map((p: any, idx: number) => (
                                                    <span
                                                        key={`${p?.parameter_id ?? p?.id ?? p?.name ?? idx}`}
                                                        className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                                                    >
                                                        {safeText(p?.name ?? p?.parameter_name ?? p?.label, t("na", { defaultValue: "—" }))}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-sm text-gray-500">{t("na", { defaultValue: "—" })}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Documents */}
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 bg-white">
                                    <div className="text-sm font-extrabold text-gray-900">
                                        {t("documents", { defaultValue: "Documents" })}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        {t("samples.pages.archiveDetail.docsHint", {
                                            defaultValue: "Documents are loaded from the sample document repository.",
                                        })}
                                    </div>
                                </div>

                                <div className="px-5 py-5 space-y-3">
                                    {repoDocsError ? (
                                        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                            {t("samples.pages.archiveDetail.repoDocsError", {
                                                msg: repoDocsError,
                                                defaultValue: "Failed to load documents: {{msg}}",
                                            })}
                                        </div>
                                    ) : null}

                                    {docs.length === 0 ? (
                                        <div className="text-sm text-gray-600">
                                            {t("samples.pages.archiveDetail.docsEmptyHint", { defaultValue: "No documents found." })}
                                        </div>
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
                                                                {safeText(d.type, t("na", { defaultValue: "—" })).toUpperCase()}
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
                                            {t("samples.pages.archiveDetail.backToList", { defaultValue: "Back to Archive List" })}
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Timeline */}
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                            <div className="px-5 py-4 border-b border-gray-100 bg-white">
                                <div className="text-sm font-extrabold text-gray-900">
                                    {t("samples.pages.archiveDetail.timelineTitle", { defaultValue: "Workflow Timeline" })}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {t("samples.pages.archiveDetail.timelineHint", { defaultValue: "Events derived from audit logs / timeline payload." })}
                                </div>
                            </div>

                            <div className="px-5 py-5">
                                {timeline.length === 0 ? (
                                    <div className="text-sm text-gray-600">
                                        {t("samples.pages.archiveDetail.timelineEmpty", { defaultValue: "No timeline events." })}
                                    </div>
                                ) : (
                                    <ol className="space-y-2">
                                        {timeline.map((e, idx) => (
                                            <li key={`${e.at}-${idx}`} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                                                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                                    <div className="text-sm font-semibold text-gray-900">{e.title}</div>
                                                    <div className="text-xs text-gray-600">{formatDateTimeLocal(e.at)}</div>
                                                </div>

                                                <div className="mt-1 text-xs text-gray-600">
                                                    {t("samples.pages.archiveDetail.timelineBy", {
                                                        name: e.actor_name || t("na", { defaultValue: "—" }),
                                                        defaultValue: "By: {{name}}",
                                                    })}
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

            <ReportPreviewModal
                open={previewReportId !== null}
                reportId={previewReportId}
                onClose={() => setPreviewReportId(null)}
            />

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
