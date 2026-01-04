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

/**
 * Envelope-safe pager extractor.
 * Supports:
 * 1) ApiResponse: { data: paginator }
 * 2) Axios raw: { data: ApiResponse }
 * 3) Direct paginator: { data: [...], total, last_page }
 * 4) Direct array rows: [...]
 */
function extractPager(res: any): { data: ParameterRow[]; total: number; last_page: number } {
    const root = res?.data ?? res;            // axios -> payload OR already payload
    const maybeWrapped = root?.data ?? root;  // ApiResponse wraps in data

    // Case: array directly
    if (Array.isArray(maybeWrapped)) {
        return { data: maybeWrapped as ParameterRow[], total: maybeWrapped.length, last_page: 1 };
    }

    // Case: paginator object
    if (Array.isArray(maybeWrapped?.data)) {
        return {
            data: maybeWrapped.data as ParameterRow[],
            total: Number(maybeWrapped.total ?? maybeWrapped.data.length ?? 0),
            last_page: Number(maybeWrapped.last_page ?? 1),
        };
    }

    // fallback
    return { data: [], total: 0, last_page: 1 };
}

export const QAParametersPage = () => {
    const { user } = useAuth();
    const roleId = getUserRoleId(user);
    const roleLabel = (getUserRoleLabel(user) ?? "").toLowerCase();

    // ✅ Access: Analyst, Lab Head, Operational Manager ONLY (Admin tidak boleh)
    const canAccess = useMemo(() => {
        return (
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.LAB_HEAD ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER
        );
    }, [roleId]);

    // ✅ CRUD: Analyst ONLY
    const canWrite = useMemo(() => roleId === ROLE_ID.ANALYST, [roleId]);

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [items, setItems] = useState<ParameterRow[]>([]);
    const [page, setPage] = useState(1);
    const perPage = 20;

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

            const pager = extractPager(res);
            setItems(pager.data);
            setTotal(pager.total);
            setLastPage(pager.last_page);
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
        fetchList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, qDebounced]);

    // reset page when search changes
    useEffect(() => {
        setPage(1);
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

        try {
            if (formMode === "create") {
                await createParameter(payload);
            } else {
                await updateParameter(editing!.parameter_id, payload);
            }
            await fetchList();
        } catch (e: any) {
            // Optional: bikin error lebih manusiawi utk unique constraint code
            const raw =
                e?.response?.data?.message ??
                e?.data?.message ??
                e?.message ??
                "Failed to save parameter.";

            const nice =
                typeof raw === "string" && raw.toLowerCase().includes("duplicate")
                    ? "Code already exists. Please use another code."
                    : raw;

            setErr(nice);
            throw e;
        }
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

    if (!canAccess) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({getUserRoleLabel(user)})</span> is not allowed to
                    access the QA Parameters module.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header (samain kayak SamplesPage) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">QA Parameters</h1>
                    <div className="text-xs text-gray-500 mt-1">
                        Manage parameters (CRUD). {canWrite ? "You can edit." : "Read-only."}
                    </div>
                </div>

                {canWrite && (
                    <button type="button" onClick={openCreate} className="lims-btn-primary self-start md:self-auto">
                        + New parameter
                    </button>
                )}
            </div>

            {/* Card */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    {/* Search */}
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="param-search">
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
                                id="param-search"
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
                        className="w-full md:w-auto rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={loading}
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
                    {err && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{err}</div>
                    )}

                    {loading && <div className="text-sm text-gray-600">Loading parameters...</div>}

                    {!loading && (
                        <>
                            {items.length === 0 ? (
                                <div className="text-sm text-gray-600">No parameters found with current filters.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-[1050px] w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left w-[110px]">ID</th>
                                                <th className="px-4 py-3 text-left w-[170px]">Code</th>
                                                <th className="px-4 py-3 text-left w-[320px]">Name</th>
                                                <th className="px-4 py-3 text-left w-[140px]">Unit</th>
                                                <th className="px-4 py-3 text-left w-[120px]">Unit ID</th>
                                                <th className="px-4 py-3 text-left w-[180px]">Method Ref</th>
                                                <th className="px-4 py-3 text-left w-[140px]">Status</th>
                                                <th className="px-4 py-3 text-left w-40">Tag</th>
                                                <th className="px-4 py-3 text-right w-[170px]">Actions</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {items.map((p) => (
                                                <tr
                                                    key={p.parameter_id}
                                                    className="border-t border-gray-100 hover:bg-gray-50/60"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">#{p.parameter_id}</div>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700 font-mono text-xs">
                                                        {p.code ?? "—"}
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">{p.name ?? "—"}</div>
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
                                                            <div className="inline-flex gap-2">
                                                                <button
                                                                    className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                                                                    type="button"
                                                                    onClick={() => openEdit(p)}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    className={cx(
                                                                        "rounded-xl border px-3 py-1.5 text-xs",
                                                                        "border-red-200 text-red-700 hover:bg-red-50"
                                                                    )}
                                                                    type="button"
                                                                    onClick={() => openDeleteConfirm(p)}
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {/* Pagination (samain gaya SamplesPage) */}
                                    <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-gray-600">
                                        <div>
                                            Page <span className="font-semibold">{page}</span> of{" "}
                                            <span className="font-semibold">{lastPage}</span> • Total{" "}
                                            <span className="font-semibold">{total}</span>
                                        </div>

                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                                disabled={page <= 1 || loading}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Previous
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
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
                readOnly={!canWrite}
            />

            <DeleteConfirmModal
                open={openDelete}
                title="Delete parameter"
                message={deleting ? `Delete "${deleting.name ?? deleting.code ?? `#${deleting.parameter_id}`}" ?` : "Delete this parameter?"}
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
