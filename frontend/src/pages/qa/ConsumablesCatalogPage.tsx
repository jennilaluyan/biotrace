// frontend/src/pages/qa/ConsumablesCatalogPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../..//hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../..//utils/roles";
import {
    listConsumablesCatalog,
    type ConsumablesCatalogRow,
    type ConsumablesCatalogType,
} from "../..//services/consumablesCatalog";

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
function extractPager(res: any): { data: ConsumablesCatalogRow[]; total: number; last_page: number } {
    const root = res?.data ?? res;
    const maybeWrapped = root?.data ?? root;

    if (Array.isArray(maybeWrapped)) {
        return { data: maybeWrapped as ConsumablesCatalogRow[], total: maybeWrapped.length, last_page: 1 };
    }

    if (Array.isArray(maybeWrapped?.data)) {
        return {
            data: maybeWrapped.data as ConsumablesCatalogRow[],
            total: Number(maybeWrapped.total ?? maybeWrapped.data.length ?? 0),
            last_page: Number(maybeWrapped.last_page ?? 1),
        };
    }

    return { data: [], total: 0, last_page: 1 };
}

export const ConsumablesCatalogPage = () => {
    const { user } = useAuth();
    const roleId = getUserRoleId(user);

    // Viewer ini untuk verifikasi import: izinkan Admin + Analyst + OM + LH
    const canAccess = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.LAB_HEAD
        );
    }, [roleId]);

    const [q, setQ] = useState("");
    const qDebounced = useDebounced(q, 300);

    const [typeFilter, setTypeFilter] = useState<"" | ConsumablesCatalogType>("");
    const [activeFilter, setActiveFilter] = useState<"" | "1" | "0">("1");

    const [page, setPage] = useState(1);
    const [items, setItems] = useState<ConsumablesCatalogRow[]>([]);
    const [total, setTotal] = useState(0);
    const [lastPage, setLastPage] = useState(1);

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const fetchList = async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await listConsumablesCatalog({
                page,
                perPage: 20,
                search: qDebounced || undefined,
                type: (typeFilter || undefined) as any,
                active: activeFilter === "" ? undefined : activeFilter === "1",
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
                "Failed to load consumables catalog.";
            setErr(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!canAccess) return;
        fetchList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, qDebounced, typeFilter, activeFilter, canAccess]);

    // reset page when filters/search change
    useEffect(() => {
        setPage(1);
    }, [qDebounced, typeFilter, activeFilter]);

    if (!canAccess) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({getUserRoleLabel(user)})</span> is not allowed to access
                    the Consumables Catalog viewer.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Consumables & Reagents Catalog</h1>
                    <div className="text-xs text-gray-500 mt-1">
                        Read-only viewer to validate Excel imports (search + filters).
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-2 md:items-center">
                    <input
                        className="h-10 w-full md:w-[320px] rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        placeholder="Search name / code / category..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                    />

                    <select
                        className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as any)}
                    >
                        <option value="">All Types</option>
                        <option value="bhp">BHP</option>
                        <option value="reagen">Reagen</option>
                    </select>

                    <select
                        className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        value={activeFilter}
                        onChange={(e) => setActiveFilter(e.target.value as any)}
                    >
                        <option value="">All</option>
                        <option value="1">Active</option>
                        <option value="0">Inactive</option>
                    </select>
                </div>
            </div>

            {err && (
                <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {err}
                </div>
            )}

            <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden bg-white">
                <div className="px-4 py-3 text-sm text-gray-600 flex items-center justify-between">
                    <div>
                        Total: <span className="font-semibold text-gray-900">{total}</span>
                    </div>
                    {loading && <div className="text-xs text-gray-500">Loading…</div>}
                </div>

                <div className="overflow-auto">
                    <table className="min-w-[900px] w-full text-sm">
                        <thead className="bg-gray-50 text-gray-700">
                            <tr>
                                <th className="text-left font-semibold px-4 py-3 w-[120px]">Type</th>
                                <th className="text-left font-semibold px-4 py-3 w-[220px]">Code</th>
                                <th className="text-left font-semibold px-4 py-3">Name</th>
                                <th className="text-left font-semibold px-4 py-3 w-[220px]">Category</th>
                                <th className="text-left font-semibold px-4 py-3 w-[130px]">Unit</th>
                                <th className="text-left font-semibold px-4 py-3 w-[120px]">Active</th>
                                <th className="text-left font-semibold px-4 py-3 w-[180px]">Source</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {!loading && items.length === 0 && (
                                <tr>
                                    <td className="px-4 py-6 text-gray-500" colSpan={7}>
                                        No items found.
                                    </td>
                                </tr>
                            )}

                            {items.map((row) => (
                                <tr key={row.catalog_id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3">
                                        <span
                                            className={cx(
                                                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                                                row.type === "reagen"
                                                    ? "bg-indigo-50 text-indigo-700"
                                                    : "bg-emerald-50 text-emerald-700"
                                            )}
                                        >
                                            {row.type === "reagen" ? "REAGEN" : "BHP"}
                                        </span>
                                    </td>

                                    <td className="px-4 py-3 font-mono text-xs text-gray-800">{row.item_code}</td>

                                    <td className="px-4 py-3 text-gray-900">{row.item_name}</td>

                                    <td className="px-4 py-3 text-gray-700">{row.category ?? "-"}</td>

                                    <td className="px-4 py-3 text-gray-700">{row.default_unit ?? "-"}</td>

                                    <td className="px-4 py-3">
                                        <span
                                            className={cx(
                                                "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                                                row.is_active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-700"
                                            )}
                                        >
                                            {row.is_active ? "ACTIVE" : "INACTIVE"}
                                        </span>
                                    </td>

                                    <td className="px-4 py-3 text-gray-600">{row.source_sheet ?? "-"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-4 py-3 flex items-center justify-between border-t border-gray-200">
                    <div className="text-xs text-gray-600">
                        Page <span className="font-semibold text-gray-900">{page}</span> /{" "}
                        <span className="font-semibold text-gray-900">{lastPage}</span>
                    </div>

                    <div className="flex gap-2">
                        <button
                            className="h-9 px-3 rounded-md border border-gray-200 text-sm disabled:opacity-50"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                            Prev
                        </button>
                        <button
                            className="h-9 px-3 rounded-md border border-gray-200 text-sm disabled:opacity-50"
                            disabled={page >= lastPage || loading}
                            onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>

            <div className="mt-3 text-xs text-gray-500">
                Note: This page is read-only by design. Any fixes should be done by re-importing Excel (Step 4.2).
            </div>
        </div>
    );
};
