import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { useDebouncedValue } from "../../utils/useDebouncedValue";

/* ----------------------------- Types (ringan) ----------------------------- */
type ParameterLite = {
    parameter_id: number;
    code?: string | null;
    name?: string | null;
    unit?: string | null;
    unit_id?: number | null;
    method_ref?: string | null;
    status?: string | null;
    tag?: string | null;
};

type MethodLite = {
    method_id: number;
    code?: string | null;
    name?: string | null;
    description?: string | null;
    is_active?: boolean | null;
};

type Paginator<T> = {
    current_page: number;
    data: T[];
    first_page_url?: string | null;
    from?: number | null;
    last_page?: number;
    last_page_url?: string | null;
    next_page_url?: string | null;
    path?: string | null;
    per_page: number;
    prev_page_url?: string | null;
    to?: number | null;
    total: number;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    onClose: () => void;
    sampleId: number;
    defaultAssignedTo: number | null;
    onCreated: () => void;
    canSubmit?: boolean;

    // Step 9 gate
    assignmentBlocked?: boolean;
    assignmentBlockMessage?: string;
};

export function AddSampleTestsModal({
    open,
    onClose,
    sampleId,
    defaultAssignedTo,
    onCreated,
    canSubmit = true,
    assignmentBlocked = false,
    assignmentBlockMessage,
}: Props) {
    const [paramSearch, setParamSearch] = useState("");
    const debouncedParamSearch = useDebouncedValue(paramSearch, 350);

    const [paramPage, setParamPage] = useState(1);
    const [paramLoading, setParamLoading] = useState(false);
    const [paramError, setParamError] = useState<string | null>(null);
    const [parameters, setParameters] = useState<Paginator<ParameterLite> | null>(null);

    const [methodLoading, setMethodLoading] = useState(false);
    const [methodError, setMethodError] = useState<string | null>(null);
    const [methods, setMethods] = useState<Paginator<MethodLite> | null>(null);

    const [methodId, setMethodId] = useState<number | "">("");
    const [assignedTo, setAssignedTo] = useState<string>(
        defaultAssignedTo ? String(defaultAssignedTo) : ""
    );

    const [selectedParamIds, setSelectedParamIds] = useState<Set<number>>(new Set());

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSummary, setSubmitSummary] = useState<{
        created_count: number;
        skipped_count: number;
        skipped_parameter_ids?: number[];
    } | null>(null);

    // Step 10: prevent out-of-order overwrites
    const paramSeq = useRef(0);
    const methodSeq = useRef(0);

    // Step 10: cache methods for the session (don’t refetch every open)
    const methodsLoadedOnce = useRef(false);

    // reset ringan saat buka
    useEffect(() => {
        if (!open) return;
        setSubmitError(null);
        setSubmitSummary(null);
        setParamError(null);
        setMethodError(null);
        // keep selections by default
    }, [open]);

    const loadParameters = async () => {
        const seq = ++paramSeq.current;
        try {
            setParamLoading(true);
            setParamError(null);

            const res = await apiGet<any>(
                `/v1/parameters?page=${paramPage}&per_page=12&search=${encodeURIComponent(
                    debouncedParamSearch
                )}`
            );

            if (seq !== paramSeq.current) return;

            const pager: Paginator<ParameterLite> = res?.data;
            setParameters(pager);
        } catch (err: any) {
            if (seq !== paramSeq.current) return;
            setParamError(getErrorMessage(err, "Failed to load parameters."));
        } finally {
            if (seq !== paramSeq.current) return;
            setParamLoading(false);
        }
    };

    const loadMethods = async () => {
        const seq = ++methodSeq.current;
        try {
            setMethodLoading(true);
            setMethodError(null);

            const res = await apiGet<any>(`/v1/methods?page=1&per_page=100`);
            if (seq !== methodSeq.current) return;

            const pager: Paginator<MethodLite> = res?.data;
            setMethods(pager);
            methodsLoadedOnce.current = true;
        } catch (err: any) {
            if (seq !== methodSeq.current) return;
            setMethodError(getErrorMessage(err, "Failed to load methods."));
        } finally {
            if (seq !== methodSeq.current) return;
            setMethodLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;

        // Step 10: cache methods
        if (!methodsLoadedOnce.current) {
            loadMethods();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        loadParameters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, paramPage, debouncedParamSearch]);

    // Step 10: reset to page 1 when search changes (debounced already)
    useEffect(() => {
        if (!open) return;
        setParamPage(1);
    }, [debouncedParamSearch, open]);

    const toggleParam = (id: number) => {
        setSelectedParamIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const clearAll = () => {
        setSelectedParamIds(new Set());
    };

    const hardDisabled =
        assignmentBlocked ||
        !canSubmit ||
        submitting ||
        !methodId ||
        selectedParamIds.size === 0;

    const submit = async () => {
        // Step 9 gate: stop early
        if (assignmentBlocked) {
            setSubmitError(
                assignmentBlockMessage ??
                "Assignment ditolak karena LoA belum locked. Selesaikan workflow LoA sampai locked."
            );
            return;
        }

        if (!canSubmit) {
            setSubmitError("You don’t have permission to bulk create sample tests.");
            return;
        }

        try {
            setSubmitting(true);
            setSubmitError(null);
            setSubmitSummary(null);

            if (!methodId) {
                setSubmitError("Please choose a method.");
                return;
            }
            if (selectedParamIds.size === 0) {
                setSubmitError("Please select at least 1 parameter.");
                return;
            }

            const assigned = assignedTo.trim() === "" ? null : Number(assignedTo.trim());

            const tests = Array.from(selectedParamIds).map((pid) => ({
                parameter_id: pid,
                method_id: Number(methodId),
                ...(assigned ? { assigned_to: assigned } : {}),
            }));

            const res = await apiPost<any>(`/v1/samples/${sampleId}/sample-tests/bulk`, {
                tests,
            });

            const d = res?.data ?? {};
            setSubmitSummary({
                created_count: d.created_count ?? 0,
                skipped_count: d.skipped_count ?? 0,
                skipped_parameter_ids: d.skipped_parameter_ids ?? [],
            });

            onCreated();
        } catch (err: any) {
            setSubmitError(getErrorMessage(err, "Failed to bulk create sample tests."));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const paramRows = parameters?.data ?? [];
    const methodRows = methods?.data ?? [];
    const selectedCount = selectedParamIds.size;

    return (
        <div className="fixed inset-0 z-80 bg-black/40 flex items-center justify-center px-3">
            <div className="w-full max-w-4xl bg-white rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.18)] border border-gray-100 overflow-hidden">
                {/* header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div>
                        <div className="text-base font-bold text-gray-900">Add Tests</div>
                        <div className="text-xs text-gray-500 mt-1">
                            Select parameters, choose a method, then submit.
                        </div>
                    </div>
                    <button className="lims-btn" onClick={onClose} type="button">
                        Close
                    </button>
                </div>

                {/* body */}
                <div className="p-5">
                    {assignmentBlocked && (
                        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-100 px-3 py-2 rounded-xl mb-4">
                            <div className="font-semibold">Tidak bisa assign test dulu</div>
                            <div className="mt-1 text-amber-900/80">
                                {assignmentBlockMessage ??
                                    "LoA belum locked. Selesaikan workflow LoA sampai locked."}
                            </div>
                        </div>
                    )}

                    {submitError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {submitError}
                        </div>
                    )}

                    {submitSummary && (
                        <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl mb-4">
                            Bulk created:{" "}
                            <span className="font-semibold">{submitSummary.created_count}</span>,{" "}
                            skipped:{" "}
                            <span className="font-semibold">{submitSummary.skipped_count}</span>
                            {submitSummary.skipped_parameter_ids &&
                                submitSummary.skipped_parameter_ids.length > 0 && (
                                    <div className="text-xs text-emerald-900/80 mt-1">
                                        Skipped parameter IDs:{" "}
                                        {submitSummary.skipped_parameter_ids.join(", ")}
                                    </div>
                                )}
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* left: parameters */}
                        <div className="lg:col-span-2 border border-gray-100 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3">
                                <div className="text-sm font-semibold text-gray-900">
                                    Parameters{" "}
                                    <span className="text-xs text-gray-500 font-normal">
                                        ({selectedCount} selected)
                                    </span>
                                </div>

                                <button
                                    className="text-xs text-gray-600 hover:text-gray-800"
                                    type="button"
                                    onClick={clearAll}
                                    disabled={assignmentBlocked}
                                >
                                    Clear
                                </button>
                            </div>

                            <div className="p-4">
                                <div className="flex items-center gap-2">
                                    <input
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="Search parameter..."
                                        value={paramSearch}
                                        onChange={(e) => setParamSearch(e.target.value)}
                                        disabled={assignmentBlocked}
                                    />
                                </div>

                                {paramError && (
                                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mt-3">
                                        {paramError}
                                    </div>
                                )}

                                <div className="mt-3 space-y-2 max-h-[330px] overflow-auto pr-1">
                                    {paramLoading && (
                                        <div className="text-sm text-gray-600">
                                            Loading parameters...
                                        </div>
                                    )}

                                    {!paramLoading && paramRows.length === 0 && (
                                        <div className="text-sm text-gray-500">
                                            No parameters found.
                                        </div>
                                    )}

                                    {!paramLoading &&
                                        paramRows.map((p) => {
                                            const checked = selectedParamIds.has(p.parameter_id);
                                            return (
                                                <label
                                                    key={p.parameter_id}
                                                    className={cx(
                                                        "flex items-start gap-3 p-3 rounded-2xl border cursor-pointer",
                                                        checked
                                                            ? "border-primary/30 bg-primary/5"
                                                            : "border-gray-100 hover:bg-gray-50",
                                                        assignmentBlocked && "opacity-60 cursor-not-allowed"
                                                    )}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => toggleParam(p.parameter_id)}
                                                        className="mt-1"
                                                        disabled={assignmentBlocked}
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-semibold text-gray-900">
                                                            {p.name ??
                                                                `Parameter #${p.parameter_id}`}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1 wrap-break-word">
                                                            <span className="font-mono">
                                                                {p.code ?? "-"}
                                                            </span>
                                                            {p.tag ? (
                                                                <>
                                                                    {" "}
                                                                    • <span>{p.tag}</span>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                </div>

                                {/* pagination */}
                                {parameters && (
                                    <div className="mt-3 flex items-center justify-between">
                                        <button
                                            className="lims-btn"
                                            type="button"
                                            disabled={assignmentBlocked || paramPage <= 1}
                                            onClick={() =>
                                                setParamPage((p) => Math.max(1, p - 1))
                                            }
                                        >
                                            Prev
                                        </button>
                                        <div className="text-xs text-gray-500">
                                            Page{" "}
                                            <span className="font-semibold text-gray-700">
                                                {parameters.current_page}
                                            </span>{" "}
                                            /{" "}
                                            <span className="font-semibold text-gray-700">
                                                {parameters.last_page ?? 1}
                                            </span>
                                        </div>
                                        <button
                                            className="lims-btn"
                                            type="button"
                                            disabled={
                                                assignmentBlocked ||
                                                (parameters.last_page ?? 1) <= paramPage
                                            }
                                            onClick={() => setParamPage((p) => p + 1)}
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* right: method + assigned + submit */}
                        <div className="border border-gray-100 rounded-2xl overflow-hidden">
                            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                <div className="text-sm font-semibold text-gray-900">Settings</div>
                                <div className="text-xs text-gray-500 mt-1">
                                    Choose method & assignee.
                                </div>
                            </div>

                            <div className="p-4 space-y-3">
                                <div>
                                    <div className="text-xs font-semibold text-gray-600 mb-1">
                                        Method
                                    </div>
                                    {methodError && (
                                        <div className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-2">
                                            {methodError}
                                        </div>
                                    )}
                                    <select
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                        value={methodId}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setMethodId(v ? Number(v) : "");
                                        }}
                                        disabled={methodLoading || assignmentBlocked}
                                    >
                                        <option value="">Select method...</option>
                                        {methodRows.map((m) => (
                                            <option key={m.method_id} value={m.method_id}>
                                                {m.name ?? `Method #${m.method_id}`}
                                            </option>
                                        ))}
                                    </select>
                                    {methodLoading && (
                                        <div className="text-xs text-gray-500 mt-1">
                                            Loading methods...
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div className="text-xs font-semibold text-gray-600 mb-1">
                                        Assigned To (optional)
                                    </div>
                                    <input
                                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="staff_id"
                                        value={assignedTo}
                                        onChange={(e) => setAssignedTo(e.target.value)}
                                        disabled={assignmentBlocked}
                                    />
                                    <div className="text-[11px] text-gray-500 mt-1">
                                        Kosongkan jika tidak mau set assignee.
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <button
                                        className={cx(
                                            "w-full lims-btn-primary",
                                            hardDisabled && "opacity-60 cursor-not-allowed"
                                        )}
                                        type="button"
                                        disabled={hardDisabled}
                                        onClick={submit}
                                        title={assignmentBlocked ? assignmentBlockMessage : undefined}
                                    >
                                        {submitting ? "Submitting..." : "Submit Bulk Create"}
                                    </button>

                                    <div className="mt-2 text-xs text-gray-500">
                                        Endpoint:{" "}
                                        <span className="font-mono">
                                            POST /v1/samples/{sampleId}/sample-tests/bulk
                                        </span>
                                    </div>
                                </div>

                                {!canSubmit && (
                                    <div className="text-xs text-red-600">
                                        You don’t have permission to create sample tests.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-xs text-gray-500">
                        Tip: LoA harus locked sebelum bisa bulk assign tests.
                    </div>
                    <button className="lims-btn" onClick={onClose} type="button">
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
