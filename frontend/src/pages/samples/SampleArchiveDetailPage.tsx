// frontend/src/pages/samples/SampleArchiveDetailPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, RefreshCw } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";
import { fetchSampleArchiveDetail, type ArchiveDocument, type ArchiveTimelineEvent, type SampleArchiveDetail } from "../../services/sampleArchive";

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

    const fromArray = (d?.documents ?? []) as any[];
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

    // fallback fields (best-effort)
    if (d?.lo_file_url) docs.push({ type: "loo", label: `LOO (${safeText(d.lo_number)})`, file_url: d.lo_file_url });
    if ((d as any)?.reagent_request_file_url)
        docs.push({ type: "reagent_request", label: "Reagent Request PDF", file_url: String((d as any).reagent_request_file_url) });
    if (d?.coa_file_url) docs.push({ type: "coa", label: `COA (${safeText(d.coa_number)})`, file_url: d.coa_file_url });

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
        ((d as any)?.timeline ?? (d as any)?.history ?? (d as any)?.events ?? (d as any)?.status_history ?? []) as any[];

    const out: ArchiveTimelineEvent[] = [];
    for (const x of raw) {
        const at = x?.at ?? x?.created_at ?? x?.time ?? x?.timestamp;
        const title = x?.title ?? x?.action ?? x?.event ?? x?.status ?? "Event";
        if (!at) continue;
        out.push({
            at: String(at),
            title: String(title),
            actor_name: x?.actor_name ?? x?.staff_name ?? x?.by ?? null,
            note: x?.note ?? x?.message ?? null,
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
    const sampleId = Number(params.sampleId ?? params.sample_id);

    const [data, setData] = useState<SampleArchiveDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load() {
        try {
            setLoading(true);
            setError(null);
            const res = await fetchSampleArchiveDetail(sampleId);
            setData((res as any).data ?? null);
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

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

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button
                        className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                        onClick={() => nav(-1)}
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </button>

                    <div>
                        <h1 className="text-xl font-semibold">Sample Archive Detail</h1>
                        <p className="text-sm text-slate-600">Detail lengkap sample + dokumen + timeline workflow.</p>
                    </div>
                </div>

                <button
                    className={cx(
                        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                        "bg-white hover:bg-slate-50"
                    )}
                    onClick={load}
                    disabled={loading}
                >
                    <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
                    Refresh
                </button>
            </div>

            {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="rounded-lg border bg-white p-4 lg:col-span-2 space-y-3">
                    <h2 className="text-sm font-semibold text-slate-900">Overview</h2>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <div className="text-xs text-slate-500">Lab Sample Code</div>
                            <div className="text-sm font-medium">{safeText(data?.lab_sample_code ?? `#${sampleId}`)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">Client</div>
                            <div className="text-sm font-medium">{safeText(data?.client_name ?? data?.client_id)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">Workflow Group</div>
                            <div className="text-sm font-medium">{safeText(data?.workflow_group)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">Status (Final)</div>
                            <div className="text-sm font-medium">{safeText(data?.current_status ?? data?.request_status)}</div>
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">LOO</div>
                            <div className="text-sm font-medium">{safeText(data?.lo_number ?? data?.lo_id)}</div>
                            {data?.lo_generated_at ? (
                                <div className="text-xs text-slate-500">{formatDateTimeLocal(data.lo_generated_at)}</div>
                            ) : null}
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">COA</div>
                            <div className="text-sm font-medium">{safeText(data?.coa_number ?? data?.coa_report_id)}</div>
                            {data?.coa_generated_at ? (
                                <div className="text-xs text-slate-500">{formatDateTimeLocal(data.coa_generated_at)}</div>
                            ) : null}
                        </div>
                        <div>
                            <div className="text-xs text-slate-500">Archived At</div>
                            <div className="text-sm font-medium">{data?.archived_at ? formatDateTimeLocal(data.archived_at) : "-"}</div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <h3 className="text-sm font-semibold text-slate-900">Requested Parameters</h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {(data?.requested_parameters ?? []).length ? (
                                (data?.requested_parameters ?? []).map((p) => (
                                    <span key={p.parameter_id} className="rounded-full border bg-slate-50 px-3 py-1 text-xs">
                                        {p.name}
                                    </span>
                                ))
                            ) : (
                                <span className="text-sm text-slate-500">-</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border bg-white p-4 space-y-3">
                    <h2 className="text-sm font-semibold text-slate-900">Documents</h2>

                    {docs.length === 0 ? (
                        <div className="text-sm text-slate-500">No documents found.</div>
                    ) : (
                        <div className="space-y-2">
                            {docs.map((d, idx) => (
                                <a
                                    key={`${d.type}-${idx}`}
                                    href={d.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center justify-between rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium text-slate-900">{d.label}</div>
                                        <div className="text-xs text-slate-500">{d.type}</div>
                                    </div>
                                    <ExternalLink className="h-4 w-4 text-slate-500" />
                                </a>
                            ))}
                        </div>
                    )}

                    <div className="pt-2 text-xs text-slate-500">
                        * Dokumen yang muncul tergantung payload backend. Field fallback sudah disiapkan supaya tetap tampil “best-effort”.
                    </div>

                    <div className="pt-2">
                        <Link className="text-sm text-slate-700 underline" to="/samples/archive">
                            Back to Archive List
                        </Link>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border bg-white p-4 space-y-3">
                <h2 className="text-sm font-semibold text-slate-900">Workflow Timeline</h2>

                {timeline.length === 0 ? (
                    <div className="text-sm text-slate-500">No timeline events.</div>
                ) : (
                    <ol className="space-y-2">
                        {timeline.map((e, idx) => (
                            <li key={`${e.at}-${idx}`} className="rounded-md border bg-slate-50 p-3">
                                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                    <div className="text-sm font-medium text-slate-900">{e.title}</div>
                                    <div className="text-xs text-slate-600">{formatDateTimeLocal(e.at)}</div>
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                    {e.actor_name ? <span>By: {e.actor_name}</span> : <span>By: -</span>}
                                </div>
                                {e.note ? <div className="mt-1 text-sm text-slate-700">{e.note}</div> : null}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </div>
    );
}
