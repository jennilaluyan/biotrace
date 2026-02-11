import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";
import {
    fetchSampleArchiveDetail,
    type ArchiveDocument,
    type ArchiveTimelineEvent,
    type SampleArchiveDetail,
} from "../../services/sampleArchive";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function safeText(v: any) {
    if (v === null || v === undefined) return "-";
    const s = String(v).trim();
    return s.length ? s : "-";
}

function normalizeDocList(d?: SampleArchiveDetail | null): ArchiveDocument[] {
    const docs: ArchiveDocument[] = [];

    const fromArray = ((d as any)?.documents ?? []) as any[];
    for (const x of fromArray) {
        const file_url = x?.file_url ?? x?.url;
        if (file_url) {
            docs.push({
                type: String(x?.type ?? "document"),
                label: String(x?.label ?? x?.name ?? "Document"),
                file_url: String(file_url),
            });
        }
    }

    // fallback fields (best-effort) - support flat + nested
    // LOO (flat)
    if ((d as any)?.lo_file_url) {
        docs.push({
            type: "loo",
            label: `LOO (${safeText((d as any)?.lo_number ?? (d as any)?.lo_id)})`,
            file_url: String((d as any)?.lo_file_url),
        });
    }

    // LOO (nested)
    const loo = (d as any)?.loo ?? null;
    const loFile = loo?.file_url ?? loo?.pdf_url ?? null;
    if (loFile) {
        docs.push({
            type: "loo",
            label: `LOO (${safeText(loo?.number ?? (d as any)?.lo_id)})`,
            file_url: String(loFile),
        });
    }

    // Reagent request (optional)
    if ((d as any)?.reagent_request_file_url) {
        docs.push({
            type: "reagent_request",
            label: "Reagent Request PDF",
            file_url: String((d as any).reagent_request_file_url),
        });
    }

    // COA (flat)
    if ((d as any)?.coa_file_url) {
        docs.push({
            type: "coa",
            label: `COA (${safeText((d as any)?.coa_number ?? (d as any)?.coa_report_id)})`,
            file_url: String((d as any)?.coa_file_url),
        });
    }

    // COA (nested via reports[0])
    const reports = (((d as any)?.reports ?? []) as any[]) || [];
    const latest = reports?.[0] ?? null;
    const coaFile = latest?.file_url ?? latest?.pdf_url ?? null;
    if (coaFile) {
        docs.push({
            type: "coa",
            label: `COA (${safeText(latest?.report_no ?? latest?.number ?? latest?.report_id)})`,
            file_url: String(coaFile),
        });
    }

    // dedupe by url
    const seen = new Set<string>();
    return docs.filter((x) => {
        if (seen.has(x.file_url)) return false;
        seen.add(x.file_url);
        return true;
    });
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

    // sort ascending
    out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    return out;
}

export function SampleArchiveDetailPage() {
    const nav = useNavigate();
    const params = useParams();
    const sampleId = Number((params as any).sampleId ?? (params as any).sample_id);

    const [data, setData] = useState<SampleArchiveDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pageRefreshing, setPageRefreshing] = useState(false);

    async function load(opts?: { silent?: boolean }) {
        try {
            if (!opts?.silent) setLoading(true);
            setError(null);
            const res = await fetchSampleArchiveDetail(sampleId);
            setData((res as any)?.data ?? null);
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

    const docs = useMemo(() => normalizeDocList(data), [data]);
    const timeline = useMemo(() => normalizeTimeline(data), [data]);

    // Support nested payload: { sample, client, loo, reports[] }
    const sample = (data as any)?.sample ?? null;
    const client = (data as any)?.client ?? null;
    const loo = (data as any)?.loo ?? null;
    const reports = (((data as any)?.reports ?? []) as any[]) || [];
    const latestReport = reports?.[0] ?? null;

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
        (data as any)?.coa_number ??
        latestReport?.report_no ??
        latestReport?.number ??
        (data as any)?.coa_report_id ??
        null;

    const coaGeneratedAt =
        (data as any)?.coa_generated_at ?? latestReport?.generated_at ?? latestReport?.created_at ?? null;

    const archivedAt =
        (data as any)?.archived_at ??
        sample?.archived_at ??
        sample?.reported_at ??
        sample?.updated_at ??
        null;

    const requestedParams =
        ((data as any)?.requested_parameters ??
            (data as any)?.requestedParameters ??
            sample?.requestedParameters ??
            []) as any[];

    return (
        <div className="min-h-[60vh]">
            {/* Breadcrumb */}
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
                        {/* Header (mirip SampleDetailPage) */}
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

                        {/* Content */}
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                            {/* Overview */}
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden lg:col-span-2">
                                <div className="px-5 py-4 border-b border-gray-100 bg-white">
                                    <div className="text-sm font-extrabold text-gray-900">Overview</div>
                                    <div className="text-xs text-gray-500 mt-1">Ringkasan sample + dokumen yang terkait.</div>
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

                            {/* Documents */}
                            <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                                <div className="px-5 py-4 border-b border-gray-100 bg-white">
                                    <div className="text-sm font-extrabold text-gray-900">Documents</div>
                                    <div className="text-xs text-gray-500 mt-1">LOO / COA / dokumen lain (best-effort).</div>
                                </div>

                                <div className="px-5 py-5 space-y-3">
                                    {docs.length === 0 ? (
                                        <div className="text-sm text-gray-600">No documents found.</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {docs.map((d, idx) => (
                                                <a
                                                    key={`${d.type}-${idx}`}
                                                    href={d.file_url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
                                                >
                                                    <div className="min-w-0 flex items-start gap-2">
                                                        <span className="mt-0.5 text-gray-500">
                                                            <FileText size={16} />
                                                        </span>

                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-gray-900 truncate">{d.label}</div>
                                                            <div className="text-xs text-gray-500 truncate">{d.type}</div>
                                                        </div>
                                                    </div>

                                                    <ExternalLink className="h-4 w-4 text-gray-500 shrink-0" />
                                                </a>
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

                        {/* Timeline */}
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
        </div>
    );
}
