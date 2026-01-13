// src/pages/reports/ReportsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";

type DateFilter = "all" | "today" | "7d" | "30d";

type ReportRow = {
    report_id: number;
    report_no: string;
    client_name: string;
    sample_code: string;
    generated_at: string;
    status: "draft" | "locked";
};

const PAGE_SIZE = 10;

export const ReportsPage = () => {
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewReports =
        roleId === ROLE_ID.OPERATIONAL_MANAGER ||
        roleId === ROLE_ID.LAB_HEAD;

    // --- UI states ---
    const [reports, setReports] = useState<ReportRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // filters
    const [searchTerm, setSearchTerm] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [currentPage, setCurrentPage] = useState(1);

    /**
     * STEP 2:
     * Belum fetch API.
     * Dummy empty state agar UI & routing valid.
     */
    useEffect(() => {
        if (!canViewReports) return;
        setLoading(false);
        setReports([]);
    }, [canViewReports]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, dateFilter, reports.length]);

    // --- Filtering (future-proof) ---
    const filteredReports = useMemo(() => {
        if (!searchTerm.trim()) return reports;

        const term = searchTerm.toLowerCase();
        return reports.filter((r) =>
            [r.report_no, r.client_name, r.sample_code]
                .join(" ")
                .toLowerCase()
                .includes(term)
        );
    }, [reports, searchTerm]);

    const totalReports = filteredReports.length;
    const totalPages = Math.max(1, Math.ceil(totalReports / PAGE_SIZE));

    const paginatedReports = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredReports.slice(start, start + PAGE_SIZE);
    }, [filteredReports, currentPage]);

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setCurrentPage(page);
    };

    if (!canViewReports) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role{" "}
                    <span className="font-semibold">({roleLabel})</span> is not allowed to
                    access reports.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Page header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <h1 className="text-lg md:text-xl font-bold text-gray-900">
                    Reports
                </h1>
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
                                placeholder="Search by report no, client, sample…"
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
                            onChange={(e) =>
                                setDateFilter(e.target.value as DateFilter)
                            }
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All dates</option>
                            <option value="today">Today</option>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                        </select>
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
                            {filteredReports.length === 0 ? (
                                <div className="text-sm text-gray-600">
                                    No reports found.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">Report No</th>
                                                <th className="px-4 py-3 text-left">Client</th>
                                                <th className="px-4 py-3 text-left">Sample</th>
                                                <th className="px-4 py-3 text-left">Generated At</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedReports.map((r) => (
                                                <tr
                                                    key={r.report_id}
                                                    className="border-t border-gray-100 hover:bg-gray-50/60"
                                                >
                                                    <td className="px-4 py-3 font-medium text-gray-900">
                                                        {r.report_no}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {r.client_name}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {r.sample_code}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {r.generated_at}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            className="lims-icon-button text-gray-600"
                                                            aria-label="View report"
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
                                                    </td>
                                                </tr>
                                            ))}
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
                                                {Math.min(
                                                    currentPage * PAGE_SIZE,
                                                    totalReports
                                                )}
                                            </span>{" "}
                                            of{" "}
                                            <span className="font-semibold">
                                                {totalReports}
                                            </span>{" "}
                                            reports
                                        </div>

                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    handlePageChange(currentPage - 1)
                                                }
                                                disabled={currentPage === 1}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Previous
                                            </button>

                                            {Array.from(
                                                { length: totalPages },
                                                (_, i) => i + 1
                                            ).map((page) => (
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
                                                onClick={() =>
                                                    handlePageChange(currentPage + 1)
                                                }
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
        </div>
    );
};
