// frontend/src/pages/audit/AuditLogsPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getRoleLabelById, getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";
import { fetchAuditLogs, type AuditLogRow, type Paginator } from "../../services/auditLogs";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function safeJson(v: any) {
    try {
        if (v === null || v === undefined) return "";
        if (typeof v === "string") return v;
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v ?? "");
    }
}

export const AuditLogsPage = () => {
    const { user } = useAuth();

    const roleId = getUserRoleId(user);

    // ✅ FIX: label harus dari user / roleId, bukan getUserRoleLabel(roleId)
    const roleLabel =
        getRoleLabelById(roleId) ??
        getUserRoleLabel(user) ?? // fallback
        "UNKNOWN";

    // ✅ FIX: audit logs visible for all STAFF roles (exclude client)
    const canView = useMemo(() => {
        if (!roleId) return false;
        return roleId !== ROLE_ID.CLIENT;
    }, [roleId]);

    const [pager, setPager] = useState<Paginator<AuditLogRow> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // filters
    const [sampleId, setSampleId] = useState<string>("");
    const [sampleTestId, setSampleTestId] = useState<string>("");
    const [staffId, setStaffId] = useState<string>("");
    const [action, setAction] = useState<string>("");

    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);

    const load = async (opts?: { keepPage?: boolean }) => {
        if (!canView) return;

        try {
            setLoading(true);
            setError(null);

            const p = opts?.keepPage ? page : 1;

            const q = {
                page: p,
                per_page: perPage,
                sample_id: sampleId ? Number(sampleId) : undefined,
                sample_test_id: sampleTestId ? Number(sampleTestId) : undefined,
                staff_id: staffId ? Number(staffId) : undefined,
                action: action ? action : undefined,
            };

            const data = await fetchAuditLogs(q);
            setPager(data);

            if (!opts?.keepPage) setPage(1);
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.message ??
                "Failed to load audit logs.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!canView) return;
        load({ keepPage: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canView, page, perPage]);

    const items = pager?.data ?? [];
    const total = pager?.total ?? items.length;
    const lastPage = pager?.last_page ?? 1;

    if (!canView) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to access audit logs.
                </p>
                <Link to="/" className="mt-4 lims-btn-primary">
                    Back to dashboard
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh] space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Audit Logs</h1>
                    <div className="text-xs text-gray-500 mt-1">
                        {loading ? "Loading..." : `${total} log(s)`}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        className="lims-btn"
                        type="button"
                        onClick={() => load({ keepPage: true })}
                        disabled={loading}
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)]">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-1">
                        <div className="text-xs text-gray-500 mb-1">sample_id</div>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            placeholder="e.g. 35"
                            value={sampleId}
                            onChange={(e) => setSampleId(e.target.value)}
                        />
                    </div>

                    <div className="md:col-span-1">
                        <div className="text-xs text-gray-500 mb-1">sample_test_id</div>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            placeholder="e.g. 22"
                            value={sampleTestId}
                            onChange={(e) => setSampleTestId(e.target.value)}
                        />
                    </div>

                    <div className="md:col-span-1">
                        <div className="text-xs text-gray-500 mb-1">staff_id</div>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            placeholder="e.g. 4"
                            value={staffId}
                            onChange={(e) => setStaffId(e.target.value)}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <div className="text-xs text-gray-500 mb-1">action</div>
                        <input
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            placeholder='e.g. SAMPLE_TEST_OM_VERIFIED'
                            value={action}
                            onChange={(e) => setAction(e.target.value)}
                        />
                    </div>

                    <div className="md:col-span-1">
                        <div className="text-xs text-gray-500 mb-1">per_page</div>
                        <select
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                            value={perPage}
                            onChange={(e) => setPerPage(Number(e.target.value))}
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>

                <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button
                        className="lims-btn-primary"
                        type="button"
                        onClick={() => load({ keepPage: false })}
                        disabled={loading}
                    >
                        Apply filters
                    </button>

                    <button
                        className="lims-btn"
                        type="button"
                        onClick={() => {
                            setSampleId("");
                            setSampleTestId("");
                            setStaffId("");
                            setAction("");
                            setPage(1);
                            setTimeout(() => load({ keepPage: false }), 0);
                        }}
                        disabled={loading}
                    >
                        Clear
                    </button>

                    <div className="text-xs text-gray-500">
                        Tip: isi salah satu filter untuk memperkecil hasil.
                    </div>
                </div>
            </div>

            {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                    {error}
                </div>
            )}

            {/* Table */}
            <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-sm font-semibold text-gray-900">Logs</div>
                    <div className="text-xs text-gray-500">
                        Page <span className="font-semibold">{pager?.current_page ?? page}</span>{" "}
                        / <span className="font-semibold">{lastPage}</span>
                    </div>
                </div>

                <div className="overflow-auto">
                    <table className="min-w-[1100px] w-full text-sm">
                        <thead className="bg-white sticky top-0 z-10">
                            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">Action</th>
                                <th className="px-4 py-3">Entity</th>
                                <th className="px-4 py-3">Staff</th>
                                <th className="px-4 py-3">IP</th>
                                <th className="px-4 py-3">Old</th>
                                <th className="px-4 py-3">New</th>
                            </tr>
                        </thead>

                        <tbody>
                            {!loading && items.length === 0 && (
                                <tr>
                                    <td className="px-4 py-6 text-sm text-gray-600" colSpan={7}>
                                        No audit logs found.
                                    </td>
                                </tr>
                            )}

                            {items.map((r) => (
                                <tr
                                    key={r.log_id}
                                    className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors"
                                >
                                    <td className="px-4 py-4 text-xs text-gray-600 whitespace-nowrap">
                                        {formatDateTimeLocal(r.timestamp)}
                                        <div className="text-[10px] text-gray-400 mt-0.5 font-mono">
                                            #{r.log_id}
                                        </div>
                                    </td>

                                    <td className="px-4 py-4">
                                        <div className="font-semibold text-gray-900">{r.action}</div>
                                    </td>

                                    <td className="px-4 py-4 text-gray-700">
                                        <div className="font-medium">{r.entity_name ?? "-"}</div>
                                        <div className="text-xs text-gray-500 font-mono">
                                            id={r.entity_id ?? "-"}
                                        </div>
                                    </td>

                                    <td className="px-4 py-4 text-gray-700 font-mono">
                                        {r.staff_id ?? "-"}
                                    </td>

                                    <td className="px-4 py-4 text-gray-700 font-mono">
                                        {r.ip_address ?? "-"}
                                    </td>

                                    <td className="px-4 py-4">
                                        <details className="group">
                                            <summary className="cursor-pointer text-xs font-semibold text-gray-600 hover:text-primary">
                                                View
                                            </summary>
                                            <pre className="mt-2 text-[11px] bg-gray-50 border border-gray-100 rounded-xl p-2 max-w-[420px] overflow-auto">
                                                {safeJson(r.old_values)}
                                            </pre>
                                        </details>
                                    </td>

                                    <td className="px-4 py-4">
                                        <details className="group">
                                            <summary className="cursor-pointer text-xs font-semibold text-gray-600 hover:text-primary">
                                                View
                                            </summary>
                                            <pre className="mt-2 text-[11px] bg-gray-50 border border-gray-100 rounded-xl p-2 max-w-[420px] overflow-auto">
                                                {safeJson(r.new_values)}
                                            </pre>
                                        </details>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="px-4 py-3 flex items-center justify-between gap-2 bg-white border-t border-gray-100">
                    <button
                        className={cx("lims-btn", (page <= 1 || loading) && "opacity-60 cursor-not-allowed")}
                        type="button"
                        disabled={page <= 1 || loading}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        Prev
                    </button>

                    <div className="text-xs text-gray-500">
                        Page <span className="font-semibold text-gray-700">{page}</span> /{" "}
                        <span className="font-semibold text-gray-700">{lastPage}</span>
                        <span className="mx-2">•</span>
                        Total <span className="font-semibold text-gray-700">{total}</span>
                    </div>

                    <button
                        className={cx("lims-btn", (page >= lastPage || loading) && "opacity-60 cursor-not-allowed")}
                        type="button"
                        disabled={page >= lastPage || loading}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};
