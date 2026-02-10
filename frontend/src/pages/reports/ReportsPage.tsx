import { useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { fetchReports, ReportRow } from "../../services/reports";
import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";
import { ReportPreviewModal } from "../../components/reports/ReportPreviewModal";

type DateFilter = "all" | "today" | "7d" | "30d";

const DOC_PAGE_SIZE = 12; // UI pagination (gabungan semua dokumen)

type UnifiedDoc = {
    key: string;
    documentName: string;
    typeCode: string; // small label under document name
    codeOrNumber: string;
    generatedAt: string | null;
    status: string | null;

    // actions
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

function fmtDate(iso?: string | null): string {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
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

function normalizeDocStatus(s: any): string | null {
    const raw = String(s ?? "").trim();
    return raw ? raw : null;
}

export const ReportsPage = () => {
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewReports = !!roleId && roleId !== ROLE_ID.CLIENT;

    // ---- state ----
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // sources
    const [reportDocs, setReportDocs] = useState<ReportDocumentRow[]>([]);
    const [coaRows, setCoaRows] = useState<ReportRow[]>([]);

    // filters
    const [searchTerm, setSearchTerm] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");

    // UI pagination (gabungan)
    const [page, setPage] = useState(1);

    // preview modals
    const [previewReportId, setPreviewReportId] = useState<number | null>(null);
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState<string>("PDF Preview");
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
                    per_page: 200, // ambil banyak supaya COA bisa “nyatu” di list atas
                    q,
                    date: dateFilter !== "all" ? dateFilter : undefined,
                }),
            ]);

            setReportDocs(docs ?? []);
            setCoaRows(Array.isArray((reportsData as any)?.data) ? ((reportsData as any).data as ReportRow[]) : []);
            setPage(1);
        } catch (err: any) {
            const msg = err?.data?.message ?? err?.message ?? "Failed to load reports.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!canViewReports) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canViewReports]);

    // ---- derived (unified table) ----
    const unifiedDocs: UnifiedDoc[] = useMemo(() => {
        const docsFromEndpoint: UnifiedDoc[] = (reportDocs ?? []).map((d) => {
            const docName = d.document_name ?? d.type ?? "Document";
            const typeCode = String(d.type ?? "").toUpperCase();
            const code = d.document_code ?? d.number ?? "-";
            const url = d.download_url ?? null;

            return {
                key: `doc:${typeCode}:${d.id}`,
                documentName: docName,
                typeCode: typeCode || "DOC",
                codeOrNumber: code || "-",
                generatedAt: (d.generated_at ?? d.created_at ?? null) as any,
                status: normalizeDocStatus(d.status) ?? "-",
                kind: url ? "pdf_url" : "pdf_url",
                pdfUrl: url,
            };
        });

        // ✅ COA (dari reports endpoint) => masuk bareng list atas
        const docsFromCoa: UnifiedDoc[] = (coaRows ?? []).map((r: any) => {
            const code = r.report_no ?? (typeof r.report_id === "number" ? `#${r.report_id}` : "-");
            const generatedAt = (r.generated_at ?? r.created_at ?? null) as string | null;

            const status =
                typeof r.is_locked === "boolean"
                    ? r.is_locked
                        ? "locked"
                        : "draft"
                    : normalizeDocStatus(r.status) ?? "generated";

            return {
                key: `coa:${r.report_id ?? code}:${r.sample_id ?? "x"}`,
                documentName: "Certificate of Analysis",
                typeCode: "COA",
                codeOrNumber: String(code ?? "-"),
                generatedAt,
                status,
                kind: "report_preview",
                reportId: typeof r.report_id === "number" ? r.report_id : null,
            };
        });

        // merge + filter + sort
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
    }, [reportDocs, coaRows, searchTerm, dateFilter]);

    const total = unifiedDocs.length;
    const totalPages = Math.max(1, Math.ceil(total / DOC_PAGE_SIZE));
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = unifiedDocs.slice((clampedPage - 1) * DOC_PAGE_SIZE, clampedPage * DOC_PAGE_SIZE);

    const canPrev = clampedPage > 1;
    const canNext = clampedPage < totalPages;

    const openPdf = (fileUrl: string, title?: string) => {
        const url = resolvePublicFileUrl(fileUrl);
        setPreviewPdfUrl(url);
        setPreviewTitle(title ?? "PDF Preview");
        setPreviewOpen(true);
    };

    if (!canViewReports) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to access reports.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Reports</h1>
                    <p className="text-xs text-gray-500 mt-1">Semua dokumen PDF (LOO, Reagent Request, COA, dll).</p>
                </div>

                <button
                    type="button"
                    className="lims-icon-button self-start md:self-auto"
                    onClick={load}
                    aria-label="Refresh"
                    title="Refresh"
                    disabled={loading}
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar (gaya SamplesPage) */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="doc-search">
                            Search documents
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="doc-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") load();
                                }}
                                placeholder="Search by document name / code / status…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="sr-only" htmlFor="doc-date-filter">
                            Date filter
                        </label>
                        <select
                            id="doc-date-filter"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All dates</option>
                            <option value="today">Today</option>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={load}
                        aria-label="Apply filters"
                        title="Apply filters"
                        disabled={loading}
                    >
                        <Search size={16} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 md:px-6 py-4">
                    {error && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
                    )}

                    {loading ? (
                        <div className="text-sm text-gray-600">Loading documents…</div>
                    ) : pageItems.length === 0 ? (
                        <div className="text-sm text-gray-600">No documents found.</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">Document</th>
                                            <th className="text-left font-semibold px-4 py-3">Code / Number</th>
                                            <th className="text-left font-semibold px-4 py-3">Generated</th>
                                            <th className="text-left font-semibold px-4 py-3">Status</th>
                                            <th className="text-right font-semibold px-4 py-3">Actions</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {pageItems.map((d) => {
                                            return (
                                                <tr key={d.key} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-900">
                                                        <div className="font-medium">{d.documentName}</div>
                                                        <div className="text-xs text-gray-500">{d.typeCode}</div>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <span className="font-mono text-xs">{d.codeOrNumber}</span>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">{fmtDate(d.generatedAt)}</td>

                                                    <td className="px-4 py-3 text-gray-700">{d.status ?? "-"}</td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {/* Open */}
                                                            <button
                                                                type="button"
                                                                className="lims-icon-button"
                                                                aria-label="Open PDF"
                                                                title="Open PDF"
                                                                onClick={() => {
                                                                    if (d.kind === "report_preview" && d.reportId) {
                                                                        setPreviewReportId(d.reportId);
                                                                        return;
                                                                    }

                                                                    const url = d.pdfUrl ?? null;
                                                                    if (!url) return;

                                                                    // url dari endpoint docs biasanya sudah absolute API URL
                                                                    setPreviewPdfUrl(url);
                                                                    setPreviewTitle(`${d.documentName} Preview`);
                                                                    setPreviewOpen(true);
                                                                }}
                                                                disabled={d.kind === "pdf_url" && !d.pdfUrl}
                                                            >
                                                                <Eye size={16} />
                                                            </button>

                                                            {/* Optional: if pdfUrl is storage path (legacy) */}
                                                            {d.kind === "pdf_url" && d.pdfUrl && !/^https?:\/\//i.test(d.pdfUrl) ? (
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button"
                                                                    aria-label="Open storage PDF"
                                                                    title="Open storage PDF"
                                                                    onClick={() => openPdf(d.pdfUrl!, `${d.documentName} Preview`)}
                                                                >
                                                                    <Eye size={16} />
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    Showing{" "}
                                    <span className="font-semibold">{total === 0 ? 0 : (clampedPage - 1) * DOC_PAGE_SIZE + 1}</span>{" "}
                                    to <span className="font-semibold">{Math.min(clampedPage * DOC_PAGE_SIZE, total)}</span> of{" "}
                                    <span className="font-semibold">{total}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={!canPrev}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label="Previous"
                                        title="Previous"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    <div className="text-xs text-gray-600">
                                        Page <span className="font-semibold">{clampedPage}</span> /{" "}
                                        <span className="font-semibold">{totalPages}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => p + 1)}
                                        disabled={!canNext}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label="Next"
                                        title="Next"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* COA preview (by reportId) */}
            <ReportPreviewModal open={previewReportId !== null} reportId={previewReportId} onClose={() => setPreviewReportId(null)} />

            {/* PDF preview (by url) */}
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
