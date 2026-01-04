// frontend/src/pages/qa/QAParametersPage.tsx
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import {
    createParameter,
    deleteParameter,
    listParameters,
    updateParameter,
    type ParameterPayload,
    type ParameterRow,
} from "../../services/parameters";

import { ParameterFormModal } from "../../components/qa/ParameterFormModal";
import { DeleteConfirmModal } from "../../components/qa/DeleteConfirmModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function useDebounced<T>(value: T, delay = 300) {
    const [v, setV] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setV(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return v;
}

export const QAParametersPage = () => {
    const { user } = useAuth();

    const roleIdRaw = getUserRoleId(user);
    const roleId = roleIdRaw ?? ROLE_ID.CLIENT;
    const roleLabel = getUserRoleLabel(user);

    // ✅ Access hanya: Analyst, Lab Head, Operational Manager (Admin TIDAK boleh)
    const canAccess = useMemo(() => {
        return (
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.LAB_HEAD ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER
        );
    }, [roleId]);

    // ✅ Karena 3 role itu yang boleh buka, kita bikin mereka juga boleh CRUD
    const canWrite = canAccess;

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [items, setItems] = useState<ParameterRow[]>([]);
    const [page, setPage] = useState(1);
    const [perPage] = useState(20);
    const [total, setTotal] = useState(0);
    const [lastPage, setLastPage] = useState(1);

    const [q, setQ] = useState("");
    const qDebounced = useDebounced(q, 300);

    // modals
    const [openForm, setOpenForm] = useState(false);
    const [formMode, setFormMode] = useState<"create" | "edit">("create");
    const [editing, setEditing] = useState<ParameterRow | null>(null);

    const [openDelete, setOpenDelete] = useState(false);
    const [deleting, setDeleting] = useState<ParameterRow | null>(null);
    const [deletingBusy, setDeletingBusy] = useState(false);

    const fetchList = async () => {
        try {
            setLoading(true);
            setErr(null);

            const res = await listParameters({
                page,
                per_page: perPage,
                q: qDebounced.trim() || undefined,
            });

            // envelope-safe
            const pager = (res as any)?.data?.data ?? (res as any)?.data;
            const data = pager?.data ?? [];

            setItems(data);
            setTotal(pager?.total ?? data.length);
            setLastPage(pager?.last_page ?? 1);
        } catch (e: any) {
            const msg =
                e?.response?.data?.message ??
                e?.data?.message ??
                e?.message ??
                "Failed to load parameters.";
            setErr(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!canAccess) return;
        fetchList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canAccess, page, perPage, qDebounced]);

    // reset page when search changes
    useEffect(() => {
        if (!canAccess) return;
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [qDebounced]);

    const openCreate = () => {
        setFormMode("create");
        setEditing(null);
        setOpenForm(true);
    };

    const openEdit = (row: ParameterRow) => {
        setFormMode("edit");
        setEditing(row);
        setOpenForm(true);
    };

    const openDeleteConfirm = (row: ParameterRow) => {
        setDeleting(row);
        setOpenDelete(true);
    };

    const handleSubmit = async (payload: ParameterPayload) => {
        if (!canWrite) return;

        if (formMode === "create") {
            await createParameter(payload);
        } else {
            await updateParameter(editing!.parameter_id, payload);
        }
        await fetchList();
    };

    const handleDelete = async () => {
        if (!canWrite) return;
        if (!deleting) return;

        try {
            setDeletingBusy(true);
            await deleteParameter(deleting.parameter_id);
            setOpenDelete(false);
            setDeleting(null);
            await fetchList();
        } catch (e: any) {
            const msg =
                e?.response?.data?.message ??
                e?.data?.message ??
                e?.message ??
                "Failed to delete parameter.";
            setErr(msg);
        } finally {
            setDeletingBusy(false);
        }
    };

    const from = total === 0 ? 0 : (page - 1) * perPage + 1;
    const to = Math.min(page * perPage, total);

    const goToPage = (p: number) => {
        if (p < 1 || p > lastPage) return;
        setPage(p);
    };

    const pageButtons = useMemo(() => {
        // bikin tombol page gak kepanjangan (max 7)
        const max = 7;
        if (lastPage <= max) return Array.from({ length: lastPage }, (_, i) => i + 1);

        const left = Math.max(1, page - 2);
        const right = Math.min(lastPage, page + 2);

        const nums = new Set<number>();
        nums.add(1);
        nums.add(lastPage);
        for (let i = left; i <= right; i++) nums.add(i);

        return Array.from(nums).sort((a, b) => a - b);
    }, [page, lastPage]);

    if (!canAccess) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not
                    allowed to access QA Parameters.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header (samain SamplesPage) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        QA Parameters
                    </h1>
                    <div className="text-xs text-gray-500 mt-1">
                        Manage parameters (CRUD). {canWrite ? "You can edit." : "Read-only."}
                    </div>
                </div>

                {canWrite && (
                    <button
                        type="button"
                        onClick={openCreate}
                        className="lims-btn-primary self-start md:self-auto"
                    >
                        + New parameter
                    </button>
                )}
            </div>

            {/* Card (samain SamplesPage) */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    {/* Search */}
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="qa-parameter-search">
                            Search parameters
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
                                id="qa-parameter-search"
                                type="text"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Search by name or code…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={fetchList}
                        disabled={loading}
                        className="w-full md:w-auto rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {loading ? "Refreshing..." : "Refresh"}
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setQ("");
                            setPage(1);
                        }}
                        className="w-full md:w-auto rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Clear
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 md:px-6 py-4">
                    {loading && (
                        <div className="text-sm text-gray-600">Loading parameters...</div>
                    )}

                    {err && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {err}
                        </div>
                    )}

                    {!loading && !err && (
                        <>
                            {items.length === 0 ? (
                                <div className="text-sm text-gray-600">
                                    No parameters found with current filters.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">ID</th>
                                                <th className="px-4 py-3 text-left">Code</th>
                                                <th className="px-4 py-3 text-left">Name</th>
                                                <th className="px-4 py-3 text-left">Unit</th>
                                                <th className="px-4 py-3 text-left">Unit ID</th>
                                                <th className="px-4 py-3 text-left">Method Ref</th>
                                                <th className="px-4 py-3 text-left">Status</th>
                                                <th className="px-4 py-3 text-left">Tag</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {items.map((p) => (
                                                <tr
                                                    key={p.parameter_id}
                                                    className="border-t border-gray-100 hover:bg-gray-50/60"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">
                                                            #{p.parameter_id}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="text-[12px] text-gray-700 font-mono">
                                                            {p.code ?? "—"}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">
                                                            {p.name ?? "—"}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">{p.unit ?? "—"}</td>
                                                    <td className="px-4 py-3 text-gray-700">{p.unit_id ?? "—"}</td>
                                                    <td className="px-4 py-3 text-gray-700">{p.method_ref ?? "—"}</td>
                                                    <td className="px-4 py-3 text-gray-700">{p.status ?? "—"}</td>
                                                    <td className="px-4 py-3 text-gray-700">{p.tag ?? "—"}</td>

                                                    <td className="px-4 py-3 text-right">
                                                        {!canWrite ? (
                                                            <span className="text-xs text-gray-400">—</span>
                                                        ) : (
                                                            <div className="inline-flex gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-600"
                                                                    aria-label="Edit parameter"
                                                                    onClick={() => openEdit(p)}
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
                                                                        <path d="M12 20h9" />
                                                                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                                                    </svg>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "lims-icon-button",
                                                                        "lims-icon-button--danger"
                                                                    )}
                                                                    aria-label="Delete parameter"
                                                                    onClick={() => openDeleteConfirm(p)}
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
                                                                        <path d="M3 6h18" />
                                                                        <path d="M8 6V4h8v2" />
                                                                        <path d="M19 6l-1 14H6L5 6" />
                                                                        <path d="M10 11v6" />
                                                                        <path d="M14 11v6" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {/* Pagination (leave mirip SamplesPage) */}
                                    <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-gray-600">
                                        <div>
                                            Showing{" "}
                                            <span className="font-semibold">{from}</span> –{" "}
                                            <span className="font-semibold">{to}</span> of{" "}
                                            <span className="font-semibold">{total}</span> parameters
                                        </div>

                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() => goToPage(page - 1)}
                                                disabled={page <= 1 || loading}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Previous
                                            </button>

                                            {pageButtons.map((p, idx) => {
                                                const prev = pageButtons[idx - 1];
                                                const showEllipsis = prev && p - prev > 1;

                                                return (
                                                    <span key={p} className="flex items-center gap-1">
                                                        {showEllipsis && (
                                                            <span className="px-2 text-gray-400">…</span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => goToPage(p)}
                                                            className={`px-3 py-1 rounded-full text-xs border ${p === page
                                                                    ? "bg-primary text-white border-primary"
                                                                    : "bg-white text-gray-700 hover:bg-gray-50"
                                                                }`}
                                                        >
                                                            {p}
                                                        </button>
                                                    </span>
                                                );
                                            })}

                                            <button
                                                type="button"
                                                onClick={() => goToPage(page + 1)}
                                                disabled={page >= lastPage || loading}
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

            <ParameterFormModal
                open={openForm}
                mode={formMode}
                initial={editing}
                onClose={() => setOpenForm(false)}
                onSubmit={handleSubmit}
            />

            <DeleteConfirmModal
                open={openDelete}
                title="Delete parameter"
                message={
                    deleting
                        ? `Delete "${deleting.name ?? deleting.code ?? `#${deleting.parameter_id}`}" ?`
                        : "Delete this parameter?"
                }
                confirmText="Delete"
                loading={deletingBusy}
                onClose={() => {
                    setOpenDelete(false);
                    setDeleting(null);
                }}
                onConfirm={handleDelete}
            />
        </div>
    );
};
