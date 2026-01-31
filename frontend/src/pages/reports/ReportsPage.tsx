import { useEffect, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { fetchReports, ReportRow, Paginator } from "../../services/reports";
import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";
import { ReportPreviewModal } from "../../components/reports/ReportPreviewModal";

type DateFilter = "all" | "today" | "7d" | "30d";

const PAGE_SIZE = 10;

type AnyDocRow = ReportRow & {
    // optional fields (for “all documents” mode / future backend expansion)
    file_url?: string | null;
    doc_type?: string | null;
    type?: string | null;

    // LOO-ish fields (if backend includes them in the same endpoint)
    lo_id?: number;
    number?: string | null; // e.g. 007/LAB-BM/LOO/2026
    loo_number?: string | null;
    loa_number?: string | null;
    loa_status?: string | null;

    // sample fields (sometimes the endpoint uses different names)
    lab_sample_code?: string | null;
    sample_code?: string | null;

    // time fields
    created_at?: string | null;
    updated_at?: string | null;
};

function resolvePublicFileUrl(fileUrl: string): string {
    // If already absolute URL
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;

    // If already absolute path
    if (fileUrl.startsWith("/")) return fileUrl;

    // Default: assume Laravel public disk -> /storage/...
    return `/storage/${fileUrl}`;
}

function fmtDate(iso?: string | null): string {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
}

function getDocLabel(r: AnyDocRow): string {
    // Prefer explicit type
    const t = (r.doc_type ?? r.type ?? "").toString().toLowerCase();

    if (t.includes("loo") || t.includes("letter_of_order") || t.includes("letter of order")) {
        return "LOO";
    }
    if (t.includes("loa") || t.includes("letter_of_acceptance") || t.includes("letter of acceptance")) {
        return "LOA";
    }
    if (t.includes("report") || t.includes("hasil") || t.includes("laporan")) {
        return "Report";
    }

    // Heuristics based on fields
    if (r.lo_id || r.number || r.loo_number || r.loa_number) return "LOO";
    if (r.report_no) return "Report";

    return "Document";
}

function getDocNo(r: AnyDocRow): string {
    // Prefer known document numbers
    const no =
        r.report_no ??
        r.number ??
        r.loo_number ??
        r.loa_number ??
        null;

    if (no && String(no).trim() !== "") return String(no);

    // fallback
    if (typeof r.report_id === "number") return `#${r.report_id}`;
    if (typeof r.lo_id === "number") return `#${r.lo_id}`;
    return "-";
}

function getSampleLabel(r: AnyDocRow): string {
    const code = r.lab_sample_code ?? r.sample_code;
    if (code && String(code).trim() !== "") return String(code);

    if (typeof r.sample_id === "number") return `#${r.sample_id}`;
    return "-";
}

export const ReportsPage = () => {
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewReports = !!roleId && roleId !== ROLE_ID.CLIENT;

    // ---- state ----
    const [pager, setPager] = useState<Paginator<ReportRow> | null>(null);
    const [reportDocs, setReportDocs] = useState<ReportDocumentRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // filters
    const [searchTerm, setSearchTerm] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [previewReportId, setPreviewReportId] = useState<number | null>(null);

    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState<string>("PDF Preview");
    const [previewOpen, setPreviewOpen] = useState(false);

    // ---- fetch ----
    const loadReports = async (opts?: { keepPage?: boolean }) => {
        try {
            setLoading(true);
            setError(null);

            const page = opts?.keepPage ? currentPage : 1;

            const [reportsData, docs] = await Promise.all([
                fetchReports({
                    page,
                    per_page: PAGE_SIZE,
                    q: searchTerm.trim() || undefined,
                    date: dateFilter !== "all" ? dateFilter : undefined,
                }),
                listReportDocuments(),
            ]);

            if (!reportsData || !Array.isArray((reportsData as any).data)) {
                console.warn("Unexpected reports response", reportsData);
            }

            setPager(reportsData);
            setReportDocs(docs ?? []);
            if (!opts?.keepPage) setCurrentPage(1);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.message ??
                "Failed to load reports.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    // initial + pagination
    useEffect(() => {
        if (!canViewReports) return;
        loadReports({ keepPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canViewReports, currentPage]);

    useEffect(() => {
        if (!canViewReports) return;
        setCurrentPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchTerm, dateFilter]);

    // ---- derived ----
    const items: AnyDocRow[] = ((pager?.data ?? []) as unknown) as AnyDocRow[];
    const totalReports = pager?.total ?? 0;
    const totalPages = pager?.last_page ?? 1;

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setCurrentPage(page);
    };

    const openPdf = (fileUrl: string) => {
        // NOTE:
        // Kalau fileUrl itu path storage biasa, sering 404 karena backoffice (Vite) tidak serve /storage.
        // Jadi kita preview saja di modal (kalau gagal, modal tampilkan error).
        const url = resolvePublicFileUrl(fileUrl);

        setPreviewPdfUrl(url);
        setPreviewTitle("PDF Preview");
        setPreviewOpen(true);
    };

    const filteredDocs = reportDocs.filter((d) => {
        const q = searchTerm.trim().toLowerCase();
        const hay =
            `${d.type ?? ""} ${d.number ?? ""} ${d.client_name ?? ""} ${d.client_org ?? ""} ${(d.sample_codes ?? []).join(" ")}`.toLowerCase();

        if (q && !hay.includes(q)) return false;

        const iso = d.generated_at ?? d.created_at;
        if (!iso || dateFilter === "all") return true;

        const dt = new Date(iso);
        if (Number.isNaN(dt.getTime())) return true;

        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const t = dt.getTime();

        if (dateFilter === "today") return t >= startOfToday;
        if (dateFilter === "7d") return t >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
        if (dateFilter === "30d") return t >= now.getTime() - 30 * 24 * 60 * 60 * 1000;

        return true;
    });

    if (!canViewReports) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role{" "}
                    <span className="font-semibold">({roleLabel})</span> is not
                    allowed to access reports.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        Reports
                    </h1>
                    <p className="text-xs text-gray-600 mt-1">
                        Semua dokumen PDF (Report, LOO, dll) ditampilkan di sini. Kalau tersedia file PDF, akan muncul tombol download/open.
                    </p>
                </div>
            </div>

            {/* Card */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="report-search">
                            Search reports
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <circle cx="11" cy="11" r="6" />
                                    <line x1="16" y1="16" x2="21" y2="21" />
                                </svg>
                            </span>
                            <input
                                id="report-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by document no, client, sample…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="sr-only" htmlFor="report-date-filter">
                            Date filter
                        </label>
                        <select
                            id="report-date-filter"
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
                        className="lims-btn-primary"
                        onClick={() => loadReports({ keepPage: false })}
                        disabled={loading}
                    >
                        Apply
                    </button>
                </div>

                {/* Documents (LOO now, extensible later) */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-4">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <div>
                            <h2 className="text-sm font-semibold text-gray-900">Documents</h2>
                            <p className="text-xs text-gray-500">
                                Letter of Order sekarang muncul di sini. Dokumen PDF lain nanti tinggal masuk via endpoint yang sama.
                            </p>
                        </div>
                        <div className="text-xs text-gray-500">
                            {filteredDocs.length} item(s)
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="text-xs text-gray-500">
                                <tr className="border-b border-gray-100">
                                    <th className="text-left px-4 py-3">Type</th>
                                    <th className="text-left px-4 py-3">Number</th>
                                    <th className="text-left px-4 py-3">Client</th>
                                    <th className="text-left px-4 py-3">Samples</th>
                                    <th className="text-left px-4 py-3">Generated</th>
                                    <th className="text-left px-4 py-3">Status</th>
                                    <th className="text-right px-4 py-3">Action</th>
                                </tr>
                            </thead>

                            <tbody className="divide-y divide-gray-100">
                                {filteredDocs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                                            No documents found.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredDocs.map((d) => {
                                        const docType = String(d.type ?? "").toLowerCase();
                                        const docId = d.id;
                                        const url =
                                            docType && docId
                                                ? `/v1/reports/documents/${docType}/${docId}/pdf`
                                                : null;
                                        return (
                                            <tr key={`${d.type}-${d.id}`} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium text-gray-900">{d.type}</td>
                                                <td className="px-4 py-3 text-gray-700">{d.number}</td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {d.client_name ?? "-"}
                                                    {d.client_org ? (
                                                        <div className="text-xs text-gray-500">{d.client_org}</div>
                                                    ) : null}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {(d.sample_codes ?? []).length ? (d.sample_codes ?? []).join(", ") : "-"}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">
                                                    {fmtDate(d.generated_at ?? d.created_at)}
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">{d.status ?? "-"}</td>
                                                <td className="px-4 py-3 text-right">
                                                    {url ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (!url) return;
                                                                setPreviewPdfUrl(url);
                                                                setPreviewTitle(`${d.type} Preview`);
                                                                setPreviewOpen(true);
                                                            }}
                                                            className="px-3 py-1 rounded-full text-xs bg-primary text-white hover:opacity-90"
                                                        >
                                                            Open PDF
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">No file</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Content */}
                <div className="px-4 md:px-6 py-4">
                    {loading && (
                        <div className="text-sm text-gray-600">
                            Loading reports...
                        </div>
                    )}

                    {error && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            {items.length === 0 ? (
                                <div className="text-sm text-gray-600">
                                    No documents found.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">
                                                    Document No
                                                </th>
                                                <th className="px-4 py-3 text-left">
                                                    Type
                                                </th>
                                                <th className="px-4 py-3 text-left">
                                                    Client
                                                </th>
                                                <th className="px-4 py-3 text-left">
                                                    Sample
                                                </th>
                                                <th className="px-4 py-3 text-left">
                                                    Generated At
                                                </th>
                                                <th className="px-4 py-3 text-right">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.map((r) => {
                                                const docNo = getDocNo(r);
                                                const docType = getDocLabel(r);
                                                const clientName = (r as any).client_name ?? "-";
                                                const sampleLabel = getSampleLabel(r);

                                                const generated =
                                                    (r as any).generated_at ??
                                                    r.created_at ??
                                                    null;

                                                const hasPreview =
                                                    typeof r.report_id === "number" &&
                                                    r.report_id > 0;

                                                const fileUrl =
                                                    (r as any).file_url ??
                                                    null;

                                                return (
                                                    <tr
                                                        key={`${r.report_id ?? "x"}-${(r as any).lo_id ?? "y"}-${docNo}`}
                                                        className="border-t border-gray-100 hover:bg-gray-50/60"
                                                    >
                                                        <td className="px-4 py-3 font-medium text-gray-900">
                                                            {docNo}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">
                                                            {docType}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">
                                                            {clientName}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">
                                                            {sampleLabel}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">
                                                            {fmtDate(generated)}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {/* View (modal) - only for report rows */}
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                    onClick={() => {
                                                                        if (!hasPreview) return;
                                                                        setPreviewReportId(r.report_id);
                                                                    }}
                                                                    aria-label="View document"
                                                                    disabled={!hasPreview}
                                                                    title={hasPreview ? "View" : "Preview not available"}
                                                                >
                                                                    <svg
                                                                        viewBox="0 0 24 24"
                                                                        className="h-4 w-4"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        strokeWidth="1.8"
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                    >
                                                                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                                                        <circle cx="12" cy="12" r="3" />
                                                                    </svg>
                                                                </button>

                                                                {/* Download/Open PDF if file_url exists */}
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                    onClick={() => {
                                                                        if (!fileUrl) return;
                                                                        openPdf(String(fileUrl));
                                                                    }}
                                                                    aria-label="Open PDF"
                                                                    disabled={!fileUrl}
                                                                    title={fileUrl ? "Open PDF" : "PDF not available"}
                                                                >
                                                                    <svg
                                                                        viewBox="0 0 24 24"
                                                                        className="h-4 w-4"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        strokeWidth="1.8"
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                    >
                                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                                        <path d="M7 10l5 5 5-5" />
                                                                        <path d="M12 15V3" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {/* Pagination */}
                                    <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-gray-600">
                                        <div>
                                            Showing{" "}
                                            <span className="font-semibold">
                                                {totalReports === 0
                                                    ? 0
                                                    : (currentPage - 1) * PAGE_SIZE + 1}
                                            </span>{" "}
                                            –{" "}
                                            <span className="font-semibold">
                                                {Math.min(currentPage * PAGE_SIZE, totalReports)}
                                            </span>{" "}
                                            of{" "}
                                            <span className="font-semibold">
                                                {totalReports}
                                            </span>{" "}
                                            documents
                                        </div>

                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handlePageChange(currentPage - 1)}
                                                disabled={currentPage === 1}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Previous
                                            </button>

                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                                <button
                                                    key={page}
                                                    type="button"
                                                    onClick={() => handlePageChange(page)}
                                                    className={`px-3 py-1 rounded-full text-xs border ${page === currentPage
                                                        ? "bg-primary text-white border-primary"
                                                        : "bg-white text-gray-700 hover:bg-gray-50"
                                                        }`}
                                                >
                                                    {page}
                                                </button>
                                            ))}

                                            <button
                                                type="button"
                                                onClick={() => handlePageChange(currentPage + 1)}
                                                disabled={currentPage === totalPages}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
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
