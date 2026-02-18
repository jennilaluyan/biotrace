import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Eye, RefreshCw, Search, X } from "lucide-react";

import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";
import { fetchSampleArchive, type PaginatedMeta, type SampleArchiveListItem } from "../../services/sampleArchive";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function safeText(v: any, fallback = "—") {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim();
    return s.length ? s : fallback;
}

export function SampleArchivePage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

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

            const res = await fetchSampleArchive({
                page: nextPage,
                per_page: perPage,
                q: nextQ.trim() ? nextQ.trim() : undefined,
            });

            setItems(res.data ?? []);
            setMeta((res as any).meta ?? null);
        } catch (e) {
            setError(getErrorMessage(e) || t("archive.loadError", "Failed to load archive."));
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

    const total = meta?.total ?? items.length;
    const from = meta ? (meta.current_page - 1) * meta.per_page + 1 : items.length ? 1 : 0;
    const to = meta ? Math.min(meta.current_page * meta.per_page, meta.total) : items.length;

    const clearSearch = () => {
        setQ("");
        setPage(1);
        load(1, "");
    };

    const pageLabel = useMemo(() => {
        const current = meta?.current_page ?? page;
        const last = meta?.last_page ?? null;
        return last ? `${current} / ${last}` : `${current}`;
    }, [meta, page]);

    return (
        <div className="min-h-[60vh]">
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/samples" className="lims-breadcrumb-link">
                        {t("samples.title", "Samples")}
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">{t("archive.titleShort", "Archive")}</span>
                </nav>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("archive.title", "Samples Archive")}</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        {t("archive.subtitle", "Historical records that are read-only (useful for traceability and audits).")}
                    </p>
                </div>

                <button
                    type="button"
                    className="lims-icon-button self-start md:self-auto"
                    onClick={() => load(page, q)}
                    disabled={loading}
                    aria-label={t("common.refresh", "Refresh")}
                    title={t("common.refresh", "Refresh")}
                >
                    <RefreshCw size={16} className={cx(loading && "animate-spin")} />
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="archive-search">
                            {t("common.search", "Search")}
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search className="h-4 w-4" />
                            </span>

                            <input
                                id="archive-search"
                                type="text"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder={t("archive.searchPlaceholder", "Search lab code, client, or COA number…")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        setPage(1);
                                        load(1, q);
                                    }
                                }}
                            />

                            {q.trim().length > 0 ? (
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-2 my-auto h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                    aria-label={t("common.clear", "Clear")}
                                    title={t("common.clear", "Clear")}
                                    onClick={clearSearch}
                                >
                                    <X size={16} />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className="w-full md:w-auto flex items-center justify-start md:justify-end gap-2">
                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={() => {
                                setPage(1);
                                load(1, q);
                            }}
                            disabled={loading}
                            aria-label={t("common.search", "Search")}
                            title={t("common.search", "Search")}
                        >
                            <Search size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {error ? (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                        <div className="text-xs text-gray-600">
                            {t("common.showingRange", "Showing {{from}} to {{to}} of {{total}}.", {
                                from,
                                to,
                                total,
                            })}
                        </div>

                        <div className="text-xs text-gray-600">
                            {t("common.pageLabel", "Page {{page}}", { page: pageLabel })}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-white text-gray-700 border-b border-gray-100">
                                <tr>
                                    <th className="text-left font-semibold px-4 py-3">{t("archive.table.labCode", "Lab Code")}</th>
                                    <th className="text-left font-semibold px-4 py-3">{t("archive.table.client", "Client")}</th>
                                    <th className="text-left font-semibold px-4 py-3">{t("archive.table.workflow", "Workflow Group")}</th>
                                    <th className="text-left font-semibold px-4 py-3">{t("archive.table.coa", "COA")}</th>
                                    <th className="text-left font-semibold px-4 py-3">{t("archive.table.archived", "Archived")}</th>
                                    <th className="text-right font-semibold px-4 py-3">{t("archive.table.actions", "Actions")}</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td className="px-4 py-6 text-gray-600" colSpan={6}>
                                            <span className="inline-flex items-center gap-2">
                                                <RefreshCw size={16} className="animate-spin" />
                                                {t("common.loading", "Loading…")}
                                            </span>
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td className="px-4 py-8 text-gray-600" colSpan={6}>
                                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                                                <div className="text-sm font-semibold text-gray-900">
                                                    {t("archive.emptyTitle", "No archived samples")}
                                                </div>
                                                <div className="text-sm text-gray-600 mt-1">
                                                    {t("archive.emptyHint", "Nothing matches your search. Try a shorter keyword.")}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((s) => (
                                        <tr key={s.sample_id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-gray-900">
                                                <Link to={`/samples/archive/${s.sample_id}`} className="inline-flex items-center gap-2">
                                                    <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                                        {safeText(s.lab_sample_code ?? `#${s.sample_id}`, t("common.na", "—"))}
                                                    </span>
                                                </Link>
                                            </td>

                                            <td className="px-4 py-3 text-gray-700">
                                                {safeText(s.client_name ?? s.client_id, t("common.na", "—"))}
                                            </td>

                                            <td className="px-4 py-3 text-gray-700">{safeText(s.workflow_group, t("common.na", "—"))}</td>

                                            <td className="px-4 py-3 text-gray-700">
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-gray-900">
                                                        {safeText(s.coa_number ?? s.coa_report_id, t("common.na", "—"))}
                                                    </span>
                                                    {s.coa_generated_at ? (
                                                        <span className="text-xs text-gray-500">{formatDateTimeLocal(s.coa_generated_at)}</span>
                                                    ) : null}
                                                </div>
                                            </td>

                                            <td className="px-4 py-3 text-gray-700">
                                                {s.archived_at ? formatDateTimeLocal(s.archived_at) : t("common.na", "—")}
                                            </td>

                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        className="lims-icon-button"
                                                        aria-label={t("common.viewDetail", "View detail")}
                                                        title={t("common.viewDetail", "View detail")}
                                                        onClick={() => navigate(`/samples/archive/${s.sample_id}`)}
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                        <div className="text-xs text-gray-600">
                            {meta
                                ? t("common.pageOf", "Page {{page}} / {{totalPages}}", {
                                    page: meta.current_page,
                                    totalPages: meta.last_page,
                                })
                                : t("common.pageLabel", "Page {{page}}", { page })}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className={cx("lims-icon-button", (!canPrev || loading) && "opacity-40 cursor-not-allowed")}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={!canPrev || loading}
                                aria-label={t("common.previous", "Previous")}
                                title={t("common.previous", "Previous")}
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <button
                                type="button"
                                className={cx("lims-icon-button", (!canNext || loading) && "opacity-40 cursor-not-allowed")}
                                onClick={() => setPage((p) => p + 1)}
                                disabled={!canNext || loading}
                                aria-label={t("common.next", "Next")}
                                title={t("common.next", "Next")}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
