// frontend/src/pages/samples/SampleArchivePage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";
import { fetchSampleArchive, type PaginatedMeta, type SampleArchiveListItem } from "../../services/sampleArchive";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function safeText(v: any) {
    if (v === null || v === undefined) return "-";
    const s = String(v).trim();
    return s.length ? s : "-";
}

export function SampleArchivePage() {
    const [items, setItems] = useState<SampleArchiveListItem[]>([]);
    const [meta, setMeta] = useState<PaginatedMeta | null>(null);
    const [q, setQ] = useState("");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const perPage = 15;

    async function load(nextPage = page, nextQ = q) {
        try {
            setLoading(true);
            setError(null);
            const res = await fetchSampleArchive({ page: nextPage, per_page: perPage, q: nextQ || undefined });
            setItems(res.data ?? []);
            setMeta((res as any).meta ?? null);
        } catch (e) {
            setError(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load(page, q);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const canPrev = (meta?.current_page ?? page) > 1;
    const canNext = meta ? meta.current_page < meta.last_page : items.length === perPage;

    const totalText = useMemo(() => {
        if (!meta) return "";
        return `Total: ${meta.total}`;
    }, [meta]);

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold">Samples Archive</h1>
                    <p className="text-sm text-slate-600">
                        Semua sample yang workflow-nya sudah selesai (COA sudah keluar). {totalText}
                    </p>
                </div>

                <button
                    className={cx(
                        "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                        "bg-white hover:bg-slate-50"
                    )}
                    onClick={() => load(page, q)}
                    disabled={loading}
                >
                    <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
                    Refresh
                </button>
            </div>

            <div className="rounded-lg border bg-white p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                    <div className="w-full md:max-w-md">
                        <label className="block text-sm font-medium text-slate-700">Search</label>
                        <div className="mt-1 flex gap-2">
                            <input
                                className="w-full rounded-md border px-3 py-2 text-sm"
                                placeholder="Cari lab sample code / client name / COA number..."
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        setPage(1);
                                        load(1, q);
                                    }
                                }}
                            />
                            <button
                                className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
                                onClick={() => {
                                    setPage(1);
                                    load(1, q);
                                }}
                                disabled={loading}
                            >
                                <Search className="h-4 w-4" />
                                Search
                            </button>
                        </div>
                    </div>

                    <div className="text-sm text-slate-600">
                        Page: {meta?.current_page ?? page}
                        {meta ? ` / ${meta.last_page}` : ""}
                    </div>
                </div>

                {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-slate-50 text-left">
                                <th className="px-3 py-2">Lab Code</th>
                                <th className="px-3 py-2">Client</th>
                                <th className="px-3 py-2">Workflow</th>
                                <th className="px-3 py-2">COA</th>
                                <th className="px-3 py-2">Archived At</th>
                                <th className="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td className="px-3 py-6 text-slate-500" colSpan={6}>
                                        Loading...
                                    </td>
                                </tr>
                            )}

                            {!loading && items.length === 0 && (
                                <tr>
                                    <td className="px-3 py-6 text-slate-500" colSpan={6}>
                                        Tidak ada data.
                                    </td>
                                </tr>
                            )}

                            {!loading &&
                                items.map((s) => (
                                    <tr key={s.sample_id} className="border-b last:border-b-0">
                                        <td className="px-3 py-2 font-medium">
                                            <Link className="text-slate-900 hover:underline" to={`/samples/archive/${s.sample_id}`}>
                                                {safeText(s.lab_sample_code ?? `#${s.sample_id}`)}
                                            </Link>
                                        </td>
                                        <td className="px-3 py-2">{safeText(s.client_name ?? s.client_id)}</td>
                                        <td className="px-3 py-2">{safeText(s.workflow_group)}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-col">
                                                <span>{safeText(s.coa_number ?? s.coa_report_id)}</span>
                                                {s.coa_generated_at ? (
                                                    <span className="text-xs text-slate-500">{formatDateTimeLocal(s.coa_generated_at)}</span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">{s.archived_at ? formatDateTimeLocal(s.archived_at) : "-"}</td>
                                        <td className="px-3 py-2 text-right">
                                            <Link
                                                className="inline-flex items-center rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-slate-50"
                                                to={`/samples/archive/${s.sample_id}`}
                                            >
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between pt-2">
                    <button
                        className={cx(
                            "rounded-md border px-3 py-2 text-sm",
                            canPrev ? "bg-white hover:bg-slate-50" : "bg-slate-50 text-slate-400"
                        )}
                        disabled={!canPrev || loading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        Prev
                    </button>

                    <button
                        className={cx(
                            "rounded-md border px-3 py-2 text-sm",
                            canNext ? "bg-white hover:bg-slate-50" : "bg-slate-50 text-slate-400"
                        )}
                        disabled={!canNext || loading}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}
