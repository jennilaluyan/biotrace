// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\SampleTestsTab.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../../services/api";
import { formatDateTimeLocal } from "../../utils/date";
import { AddSampleTestsModal } from "../sampleTests/AddSampleTestsModal";
import { getLoaAssignmentGate } from "../../utils/loaGate";
import { getErrorMessage } from "../../utils/errors";

type ApiResponse<T> = {
    timestamp?: string;
    status: number;
    message?: string | null;
    data: T;
};

type Pagination<T> = {
    current_page: number;
    data: T[];
    first_page_url?: string | null;
    from?: number | null;
    last_page: number;
    last_page_url?: string | null;
    links?: any[];
    next_page_url?: string | null;
    path?: string;
    per_page: number;
    prev_page_url?: string | null;
    to?: number | null;
    total: number;
};

type SampleTestItem = {
    sample_test_id: number;
    sample_id: number;
    parameter_id: number;
    method_id: number | null;
    assigned_to: number | null;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    created_at?: string;
    updated_at?: string;

    parameter?: {
        parameter_id: number;
        code?: string | null;
        name?: string | null;
        unit?: string | null;
        unit_id?: number | null;
        method_ref?: string | null;
        status?: string | null;
        tag?: string | null;
    } | null;

    method?: {
        method_id: number;
        code?: string | null;
        name?: string | null;
        description?: string | null;
        is_active?: boolean;
    } | null;

    assignee?: {
        staff_id: number;
        name?: string | null;
        email?: string | null;
        role_id?: number | null;
        is_active?: boolean;
    } | null;

    latest_result?: {
        result_id: number;
        sample_test_id: number;
        value_raw?: any;
        value_final?: any;
        unit_id?: number | null;
        flags?: any;
        version_no?: number | null;
        created_by?: number | null;
        created_at?: string | null;
    } | null;
};

function prettifyStatus(s?: string | null) {
    if (!s) return "-";
    return s
        .split("_")
        .map((x) => (x ? x[0].toUpperCase() + x.slice(1) : x))
        .join(" ");
}

function statusChipClass(status?: string | null) {
    const s = (status ?? "").toLowerCase();
    switch (s) {
        case "draft":
            return "bg-gray-100 text-gray-700";
        case "in_progress":
            return "bg-yellow-100 text-yellow-800";
        case "measured":
            return "bg-blue-100 text-blue-800";
        case "completed":
            return "bg-green-100 text-green-800";
        default:
            return "bg-gray-100 text-gray-700";
    }
}

type Props = {
    sampleId: number;

    // Step 9 gate: pass sample object from SampleDetailPage if available
    sample?: any;

    defaultAssignedTo?: number | null;
    canBulkCreate?: boolean;
    showAddButton?: boolean;
};

export const SampleTestsTab = ({
    sampleId,
    sample,
    defaultAssignedTo = null,
    canBulkCreate = true,
    showAddButton = true,
}: Props) => {
    const [items, setItems] = useState<SampleTestItem[]>([]);
    const [meta, setMeta] = useState<Pagination<SampleTestItem> | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [page, setPage] = useState(1);
    const perPage = 50; // Step 10: keep stable (not state)
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const [showAddModal, setShowAddModal] = useState(false);

    const totalPages = meta?.last_page ?? 1;

    // Step 9 — LoA lock gate
    const loaGate = useMemo(() => {
        if (!sample) return null;
        return getLoaAssignmentGate(sample);
    }, [sample]);

    const assignBlocked = loaGate?.blocked ?? false;
    const assignBlockMessage =
        loaGate?.message ??
        "Test assignment dikunci sampai LoA berstatus locked. Selesaikan workflow LoA dulu.";

    // Step 10: prevent out-of-order responses from overwriting newest state
    const fetchSeq = useRef(0);

    const fetchTests = useCallback(async () => {
        const seq = ++fetchSeq.current;

        try {
            setLoading(true);
            setError(null);

            const params: Record<string, any> = { page, per_page: perPage };
            if (statusFilter !== "all") params.status = statusFilter;

            const res = await apiGet<ApiResponse<Pagination<SampleTestItem>>>(
                `/api/v1/samples/${sampleId}/sample-tests`,
                { params }
            );

            // ignore if a newer fetch finished first
            if (seq !== fetchSeq.current) return;

            setItems(res.data?.data ?? []);
            setMeta(res.data ?? null);
        } catch (err: any) {
            if (seq !== fetchSeq.current) return;
            setError(getErrorMessage(err, "Failed to load sample tests."));
        } finally {
            if (seq !== fetchSeq.current) return;
            setLoading(false);
        }
    }, [page, perPage, sampleId, statusFilter]);

    useEffect(() => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        fetchTests();
    }, [sampleId, page, statusFilter, fetchTests]);

    // reset page kalau filter berubah
    useEffect(() => {
        setPage(1);
    }, [statusFilter]);

    const summaryText = useMemo(() => {
        const total = meta?.total ?? 0;
        const from = meta?.from ?? 0;
        const to = meta?.to ?? 0;
        if (!meta) return "";
        return total === 0 ? "0 results" : `Showing ${from}-${to} of ${total}`;
    }, [meta]);

    return (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="lims-detail-section-title">Tests</h3>
                    <div className="text-xs text-gray-500 mt-1">{summaryText}</div>
                </div>

                <div className="flex flex-col md:flex-row gap-2 md:items-center">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="w-full md:w-48 rounded-xl border border-gray-300 px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                    >
                        <option value="all">All status</option>
                        <option value="draft">Draft</option>
                        <option value="in_progress">In Progress</option>
                        <option value="measured">Measured</option>
                        <option value="completed">Completed</option>
                    </select>

                    <button
                        type="button"
                        onClick={() => fetchTests()}
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Refresh
                    </button>

                    {showAddButton && (
                        <button
                            type="button"
                            onClick={() => setShowAddModal(true)}
                            className="rounded-xl bg-primary text-white px-3 py-2 text-sm hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={assignBlocked}
                            title={assignBlocked ? assignBlockMessage : undefined}
                        >
                            Add Tests
                        </button>
                    )}
                </div>
            </div>

            {/* Step 9 Banner */}
            {loaGate?.blocked && (
                <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
                    <div className="font-semibold text-amber-900">Test assignment terkunci</div>
                    <div className="text-amber-900/80 mt-1">{loaGate.message}</div>
                </div>
            )}

            <div className="mt-4">
                {loading && <div className="text-sm text-gray-600">Loading tests...</div>}

                {error && !loading && (
                    <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                        {error}
                    </div>
                )}

                {!loading && !error && items.length === 0 && (
                    <div className="text-sm text-gray-600">
                        No tests yet. Use <span className="font-semibold">Add Tests</span> (LoA must be locked).
                    </div>
                )}

                {!loading && !error && items.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50">
                                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                    <th className="px-4 py-3 text-left">Test ID</th>
                                    <th className="px-4 py-3 text-left">Parameter</th>
                                    <th className="px-4 py-3 text-left">Method</th>
                                    <th className="px-4 py-3 text-left">Assignee</th>
                                    <th className="px-4 py-3 text-left">Status</th>
                                    <th className="px-4 py-3 text-left">Latest Result</th>
                                    <th className="px-4 py-3 text-left">Updated</th>
                                </tr>
                            </thead>

                            <tbody>
                                {items.map((t) => {
                                    const paramLabel =
                                        t.parameter?.name ??
                                        (t.parameter?.code ? `${t.parameter.code}` : `#${t.parameter_id}`);
                                    const methodLabel = t.method?.name ?? (t.method_id ? `#${t.method_id}` : "-");
                                    const assigneeLabel =
                                        t.assignee?.name ??
                                        (t.assigned_to ? `Staff #${t.assigned_to}` : "—");

                                    const latestValue =
                                        t.latest_result?.value_final ??
                                        t.latest_result?.value_raw ??
                                        null;

                                    return (
                                        <tr
                                            key={t.sample_test_id}
                                            className="border-t border-gray-100 hover:bg-gray-50/60"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-900">
                                                    #{t.sample_test_id}
                                                </div>
                                                <div className="text-[11px] text-gray-500">
                                                    Sample #{t.sample_id}
                                                </div>
                                            </td>

                                            <td className="px-4 py-3 text-gray-700">
                                                <div className="font-medium text-gray-900">{paramLabel}</div>
                                                {t.parameter?.code && (
                                                    <div className="text-[11px] text-gray-500">
                                                        {t.parameter.code}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-4 py-3 text-gray-700">{methodLabel}</td>

                                            <td className="px-4 py-3 text-gray-700">
                                                <div className="font-medium text-gray-900">{assigneeLabel}</div>
                                                {t.assignee?.email && (
                                                    <div className="text-[11px] text-gray-500 break-all">
                                                        {t.assignee.email}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusChipClass(
                                                        t.status
                                                    )}`}
                                                >
                                                    {prettifyStatus(t.status)}
                                                </span>
                                            </td>

                                            <td className="px-4 py-3 text-gray-700">
                                                {latestValue == null ? "—" : String(latestValue)}
                                            </td>

                                            <td className="px-4 py-3 text-gray-700">
                                                {t.updated_at ? formatDateTimeLocal(t.updated_at) : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {/* Pagination minimal */}
                        <div className="flex items-center justify-between mt-4">
                            <button
                                type="button"
                                className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                Prev
                            </button>

                            <div className="text-xs text-gray-500">
                                Page <span className="font-semibold">{page}</span> /{" "}
                                <span className="font-semibold">{totalPages}</span>
                            </div>

                            <button
                                type="button"
                                className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <AddSampleTestsModal
                open={showAddModal}
                onClose={() => setShowAddModal(false)}
                sampleId={sampleId}
                defaultAssignedTo={defaultAssignedTo}
                onCreated={() => fetchTests()}
                canSubmit={canBulkCreate}
                assignmentBlocked={assignBlocked}
                assignmentBlockMessage={assignBlockMessage}
            />
        </div>
    );
};
