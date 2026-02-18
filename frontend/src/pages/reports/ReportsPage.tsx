import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, RefreshCw, Search, ChevronLeft, ChevronRight, X, FileText } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";

import { fetchReports, type ReportRow } from "../../services/reports";
import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";
import { ReportPreviewModal } from "../../components/reports/ReportPreviewModal";

type DateFilter = "all" | "today" | "7d" | "30d";

const DOC_PAGE_SIZE = 12;

type UnifiedDoc = {
    key: string;

    documentName: string;
    typeCode: string;
    codeOrNumber: string;
    generatedAt: string | null;
    status: string | null;

    kind: "pdf_url" | "report_preview";
    pdfUrl?: string | null;
    reportId?: number | null;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function resolvePublicFileUrl(fileUrl: string): string {
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    if (fileUrl.startsWith("/")) return fileUrl;
    return `/storage/${fileUrl}`;
}

function isWithinDateFilter(iso: string | null | undefined, filter: DateFilter): boolean {
    if (!iso || filter === "all") return true;

    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return true;

    const now = new Date();
    const t = dt.getTime();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (filter === "today") return t >= startOfToday;
    if (filter === "7d") return t >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
    if (filter === "30d") return t >= now.getTime() - 30 * 24 * 60 * 60 * 1000;

    return true;
}

function normalizeText(v: any): string | null {
    const raw = String(v ?? "").trim();
    return raw ? raw : null;
}

function StatusPill({ value }: { value: any }) {
    const { t } = useTranslation();

    const s = String(value ?? "").trim().toLowerCase();

    const label =
        s === "locked"
            ? t("common.status.locked", "Locked")
            : s === "draft"
                ? t("common.status.draft", "Draft")
                : s === "generated"
                    ? t("common.status.generated", "Generated")
                    : s === "approved"
                        ? t("common.status.approved", "Approved")
                        : s === "rejected"
                            ? t("common.status.rejected", "Rejected")
                            : s
                                ? s.charAt(0).toUpperCase() + s.slice(1)
                                : t("common.na", "—");

    const cls =
        s === "locked"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : s === "approved"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : s === "rejected"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : s === "draft"
                        ? "border-slate-200 bg-slate-50 text-slate-700"
                        : "border-gray-200 bg-gray-50 text-gray-700";

    return (
        <span className={cx("inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold", cls)}>
            {label}
        </span>
    );
}

export const ReportsPage = () => {
    const { t } = useTranslation();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewReports = !!roleId && roleId !== ROLE_ID.CLIENT;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [reportDocs, setReportDocs] = useState<ReportDocumentRow[]>([]);
    const [coaRows, setCoaRows] = useState<ReportRow[]>([]);

    const [searchTerm, setSearchTerm] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [page, setPage] = useState(1);

    const [previewReportId, setPreviewReportId] = useState<number | null>(null);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState<string>(t("reports.previewTitle", "PDF Preview"));
    const [previewOpen, setPreviewOpen] = useState(false);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);

            const q = searchTerm.trim() || undefined;

            const [docs, reportsData] = await Promise.all([
                listReportDocuments(),
                fetchReports({
                    page: 1,
                    per_page: 200,
                    q,
                    date: dateFilter !== "all" ? dateFilter : undefined,
                }),
            ]);

            setReportDocs(docs ?? []);
            setCoaRows(Array.isArray((reportsData as any)?.data) ? ((reportsData as any).data as ReportRow[]) : []);
            setPage(1);
        } catch (err: any) {
            setError(getErrorMessage(err) || t("reports.loadError", "Failed to load reports."));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!canViewReports) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canViewReports]);

    const unifiedDocs: UnifiedDoc[] = useMemo(() => {
        const docsFromEndpoint: UnifiedDoc[] = (reportDocs ?? []).map((d) => {
            const docName = (d.document_name ?? d.type ?? t("common.document", "Document")).trim() || t("common.document", "Document");
            const typeCode = (String(d.type ?? "").trim().toUpperCase() || "DOC") as string;
            const code = String(d.document_code ?? d.number ?? t("common.na", "—")).trim() || t("common.na", "—");
            const url = (d.download_url ?? d.file_url ?? null) as any;

            return {
                key: `doc:${typeCode}:${d.id}`,
                documentName: docName,
                typeCode,
                codeOrNumber: code,
                generatedAt: (d.generated_at ?? d.created_at ?? null) as any,
                status: normalizeText(d.status),
                kind: "pdf_url",
                pdfUrl: url ? String(url) : null,
            };
        });

        const docsFromCoa: UnifiedDoc[] = (coaRows ?? []).map((r: any) => {
            const code = r.report_no ?? (typeof r.report_id === "number" ? `#${r.report_id}` : t("common.na", "—"));
            const generatedAt = (r.generated_at ?? r.created_at ?? null) as string | null;

            const status =
                typeof r.is_locked === "boolean"
                    ? r.is_locked
                        ? "locked"
                        : "draft"
                    : normalizeText(r.status) ?? "generated";

            return {
                key: `coa:${r.report_id ?? code}:${r.sample_id ?? "x"}`,
                documentName: t("reports.coaName", "Certificate of Analysis"),
                typeCode: "COA",
                codeOrNumber: String(code ?? t("common.na", "—")),
                generatedAt,
                status,
                kind: "report_preview",
                reportId: typeof r.report_id === "number" ? r.report_id : null,
            };
        });

        const all = [...docsFromEndpoint, ...docsFromCoa];

        const q = searchTerm.trim().toLowerCase();
        const filtered = all.filter((x) => {
            if (!isWithinDateFilter(x.generatedAt, dateFilter)) return false;
            if (!q) return true;
            const hay = `${x.documentName} ${x.typeCode} ${x.codeOrNumber} ${x.status ?? ""}`.toLowerCase();
            return hay.includes(q);
        });

        filtered.sort((a, b) => {
            const ta = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
            const tb = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
            return tb - ta;
        });

        return filtered;
    }, [reportDocs, coaRows, searchTerm, dateFilter, t]);

    const total = unifiedDocs.length;
    const totalPages = Math.max(1, Math.ceil(total / DOC_PAGE_SIZE));
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = unifiedDocs.slice((clampedPage - 1) * DOC_PAGE_SIZE, clampedPage * DOC_PAGE_SIZE);

    const canPrev = clampedPage > 1;
    const canNext = clampedPage < totalPages;

    const openDoc = (d: UnifiedDoc) => {
        if (d.kind === "report_preview") {
            if (!d.reportId) return;
            setPreviewReportId(d.reportId);
            return;
        }

        const raw = String(d.pdfUrl ?? "").trim();
        if (!raw) return;

        const url = resolvePublicFileUrl(raw);
        setPreviewPdfUrl(url);
        setPreviewTitle(t("reports.previewDocTitle", "{{name}} — Preview", { name: d.documentName }));
        setPreviewOpen(true);
    };

    const clearSearch = () => {
        setSearchTerm("");
        setPage(1);
    };

    if (!canViewReports) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    {t("common.accessDeniedTitle", "403 – Access denied")}
                </h1>
                <p className="text-sm text-gray-600">
                    {t("reports.accessDenied", "Your role ({{role}}) is not allowed to access reports.", {
                        role: roleLabel,
                    })}
                </p>
            </div>
        );
    }

    const from = total === 0 ? 0 : (clampedPage - 1) * DOC_PAGE_SIZE + 1;
    const to = Math.min(clampedPage * DOC_PAGE_SIZE, total);

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("reports.title", "Reports")}</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        {t(
                            "reports.subtitle",
                            "Browse generated PDFs (LOO, Reagent Request, COA, and other report documents)."
                        )}
                    </p>
                </div>

                <button
                    type="button"
                    className="lims-icon-button self-start md:self-auto"
                    onClick={load}
                    aria-label={t("common.refresh", "Refresh")}
                    title={t("common.refresh", "Refresh")}
                    disabled={loading}
                >
                    <RefreshCw size={16} className={cx(loading && "animate-spin")} />
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="doc-search">
                            {t("common.search", "Search")}
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="doc-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setPage(1);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") load();
                                }}
                                placeholder={t("reports.searchPlaceholder", "Search by name, code, type, or status…")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />

                            {searchTerm.trim().length > 0 ? (
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

                    <div className="w-full md:w-52">
                        <label className="sr-only" htmlFor="doc-date-filter">
                            {t("common.dateFilter", "Date filter")}
                        </label>
                        <select
                            id="doc-date-filter"
                            value={dateFilter}
                            onChange={(e) => {
                                setDateFilter(e.target.value as DateFilter);
                                setPage(1);
                                // optional auto reload to keep COA endpoint filter behavior consistent
                                // but we keep manual by Search/Enter to avoid spam
                            }}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("common.date.all", "All dates")}</option>
                            <option value="today">{t("common.date.today", "Today")}</option>
                            <option value="7d">{t("common.date.last7d", "Last 7 days")}</option>
                            <option value="30d">{t("common.date.last30d", "Last 30 days")}</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={load}
                        aria-label={t("common.apply", "Apply")}
                        title={t("common.apply", "Apply")}
                        disabled={loading}
                    >
                        <Search size={16} />
                    </button>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {error && !loading && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
                        <div className="text-xs text-gray-600">
                            {t("common.showingRange", "Showing {{from}} to {{to}} of {{total}}.", {
                                from,
                                to,
                                total,
                            })}
                        </div>

                        <div className="text-xs text-gray-600">
                            {t("common.pageOf", "Page {{page}} / {{totalPages}}", {
                                page: clampedPage,
                                totalPages,
                            })}
                        </div>
                    </div>

                    {loading ? (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 flex items-center gap-2">
                            <RefreshCw size={16} className="animate-spin" />
                            {t("common.loading", "Loading…")}
                        </div>
                    ) : pageItems.length === 0 ? (
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6">
                            <div className="flex items-start gap-3">
                                <span className="mt-0.5 text-gray-500">
                                    <FileText size={18} />
                                </span>
                                <div>
                                    <div className="text-sm font-semibold text-gray-900">
                                        {t("reports.emptyTitle", "No documents found")}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        {t("reports.emptyHint", "Try adjusting the search keyword or date filter.")}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">
                                                {t("reports.table.document", "Document")}
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                {t("reports.table.code", "Code / Number")}
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                {t("reports.table.generated", "Generated")}
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                {t("reports.table.status", "Status")}
                                            </th>
                                            <th className="text-right font-semibold px-4 py-3">
                                                {t("reports.table.actions", "Actions")}
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {pageItems.map((d) => {
                                            const disabled =
                                                (d.kind === "report_preview" && !d.reportId) ||
                                                (d.kind === "pdf_url" && !String(d.pdfUrl ?? "").trim());

                                            return (
                                                <tr key={d.key} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-900">
                                                        <div className="font-semibold">{d.documentName}</div>
                                                        <div className="mt-1">
                                                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold text-gray-700">
                                                                {d.typeCode}
                                                            </span>
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <span className="font-mono text-xs">{d.codeOrNumber || t("common.na", "—")}</span>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        {d.generatedAt ? formatDateTimeLocal(d.generatedAt) : t("common.na", "—")}
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <StatusPill value={d.status} />
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                className={cx("lims-icon-button", disabled && "opacity-40 cursor-not-allowed")}
                                                                aria-label={
                                                                    disabled
                                                                        ? t("common.noPreview", "No preview available")
                                                                        : t("common.openPreview", "Open preview")
                                                                }
                                                                title={
                                                                    disabled
                                                                        ? t("common.noPreview", "No preview available")
                                                                        : t("common.openPreview", "Open preview")
                                                                }
                                                                onClick={() => openDoc(d)}
                                                                disabled={disabled}
                                                            >
                                                                <Eye size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    {t("common.showingRange", "Showing {{from}} to {{to}} of {{total}}.", {
                                        from,
                                        to,
                                        total,
                                    })}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={!canPrev}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label={t("common.previous", "Previous")}
                                        title={t("common.previous", "Previous")}
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    <div className="text-xs text-gray-600">
                                        {t("common.pageOf", "Page {{page}} / {{totalPages}}", {
                                            page: clampedPage,
                                            totalPages,
                                        })}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={!canNext}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label={t("common.next", "Next")}
                                        title={t("common.next", "Next")}
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
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
};
