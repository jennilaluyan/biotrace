import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    ArrowLeft,
    Check,
    ChevronDown,
    Loader2,
    RefreshCw,
    Save,
    Search,
    Send,
} from "lucide-react";

import type { Sample } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
import { listParameters, type ParameterRow } from "../../services/parameters";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

const fmtDate = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
};

const getValidationMessage = (e: any, fallback: string) => {
    const details = e?.data?.details;
    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstVal = firstKey ? details[firstKey] : undefined;
        if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
        if (typeof firstVal === "string" && firstVal) return firstVal;
    }
    return e?.data?.message ?? e?.data?.error ?? fallback;
};

const statusTone = (raw?: string | null) => {
    const s = (raw ?? "").toLowerCase();
    if (s === "draft") return "bg-gray-100 text-gray-700";
    if (s === "submitted") return "bg-primary-soft/10 text-primary-soft";
    if (s === "needs_revision" || s === "returned") return "bg-amber-100 text-amber-900";
    if (s === "returned_to_admin") return "bg-amber-100 text-amber-900"; // pickup required (client-facing)
    if (s === "ready_for_delivery") return "bg-indigo-50 text-indigo-700";
    if (s === "physically_received") return "bg-emerald-100 text-emerald-900";
    return "bg-gray-100 text-gray-700";
};

function datetimeLocalFromIso(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractPaginatedRows<T>(res: any): T[] {
    const root = res?.data ?? res;
    const d = root?.data ?? root;

    if (Array.isArray(d)) return d as T[];
    if (Array.isArray(d?.data)) return d.data as T[];

    const d2 = d?.data ?? null;
    if (Array.isArray(d2)) return d2 as T[];
    if (Array.isArray(d2?.data)) return d2.data as T[];

    return [];
}

function parameterLabel(p: any) {
    const id = Number(p?.parameter_id);
    const code = String(p?.code ?? "").trim();
    const name = String(p?.name ?? "").trim();
    return (code ? `${code} — ` : "") + (name || `Parameter #${id}`);
}

export default function ClientRequestDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const numericId = useMemo(() => {
        const n = Number(id);
        return Number.isFinite(n) && n > 0 ? n : NaN;
    }, [id]);

    const [data, setData] = useState<Sample | null>(null);
    const [loading, setLoading] = useState(true);

    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    // form
    const [sampleType, setSampleType] = useState("");
    const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState("");
    const [examinationPurpose, setExaminationPurpose] = useState("");
    const [additionalNotes, setAdditionalNotes] = useState("");

    // parameters
    const [paramQuery, setParamQuery] = useState("");
    const [paramLoading, setParamLoading] = useState(false);
    const [paramItems, setParamItems] = useState<ParameterRow[]>([]);

    // ✅ ONLY ONE selection
    const [selectedParamId, setSelectedParamId] = useState<number | null>(null);

    // ✅ picker UI show/hide
    const [paramPickerOpen, setParamPickerOpen] = useState(true);

    const effectiveStatus = useMemo(() => String((data as any)?.request_status ?? ""), [data]);

    const canEdit = useMemo(() => {
        const s = effectiveStatus.toLowerCase();
        return s === "draft" || s === "needs_revision" || s === "returned" || s === "";
    }, [effectiveStatus]);

    const requestedParameterRows = useMemo(() => {
        const arr = (data as any)?.requested_parameters;
        return Array.isArray(arr) ? arr : [];
    }, [data]);

    const requestReturnNote = useMemo(() => {
        const note = String((data as any)?.request_return_note ?? "").trim();
        return note || null;
    }, [data]);

    const loadParams = async (q?: string) => {
        try {
            setParamLoading(true);

            const res = await listParameters({
                scope: "client",
                page: 1,
                per_page: 20,
                q: (q ?? "").trim() || undefined,
            });

            const rows = extractPaginatedRows<ParameterRow>(res);
            setParamItems(Array.isArray(rows) ? rows : []);
        } catch {
            setParamItems([]);
        } finally {
            setParamLoading(false);
        }
    };

    const hydrateForm = (s: Sample) => {
        setSampleType(String((s as any).sample_type ?? ""));
        setScheduledDeliveryAt(datetimeLocalFromIso((s as any).scheduled_delivery_at ?? null));
        setExaminationPurpose(String((s as any).examination_purpose ?? ""));
        setAdditionalNotes(String((s as any).additional_notes ?? ""));

        const ids = Array.isArray((s as any).requested_parameters)
            ? (s as any).requested_parameters
                .map((p: any) => Number(p.parameter_id))
                .filter((x: any) => Number.isFinite(x))
            : [];

        setSelectedParamId(ids.length ? ids[0] : null);
        setParamPickerOpen(ids.length ? false : true);
    };

    const load = async (opts?: { silent?: boolean }) => {
        const silent = !!opts?.silent;

        if (!Number.isFinite(numericId) || Number.isNaN(numericId)) {
            setError("Invalid request id.");
            setLoading(false);
            return;
        }

        try {
            setError(null);
            setInfo(null);
            if (!silent) setLoading(true);
            if (silent) setRefreshing(true);

            const s = await clientSampleRequestService.getById(numericId);
            setData(s);
            hydrateForm(s);

            // keep params list warm for search UX
            if (!silent) await loadParams("");
        } catch (e: any) {
            setError(getValidationMessage(e, "Failed to load request detail."));
            setData(null);
        } finally {
            if (!silent) setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (cancelled) return;
            await load();
        };
        run();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numericId]);

    const selectedParamLabel = useMemo(() => {
        if (!selectedParamId) return null;

        const fromList = paramItems.find((p) => Number(p.parameter_id) === selectedParamId);
        if (fromList) return parameterLabel(fromList);

        const fromPayload = requestedParameterRows.find((p: any) => Number(p?.parameter_id) === selectedParamId);
        if (fromPayload) return parameterLabel(fromPayload);

        return `Parameter #${selectedParamId}`;
    }, [selectedParamId, paramItems, requestedParameterRows]);

    const buildPayload = () => {
        return {
            sample_type: sampleType.trim(),
            scheduled_delivery_at: scheduledDeliveryAt ? scheduledDeliveryAt : null,
            examination_purpose: examinationPurpose.trim() || null,
            additional_notes: additionalNotes.trim() || null,
            parameter_ids: selectedParamId ? [selectedParamId] : [],
        };
    };

    const canSubmit = useMemo(() => {
        return canEdit && !!sampleType.trim() && !!scheduledDeliveryAt.trim() && !!selectedParamId && !submitting;
    }, [canEdit, sampleType, scheduledDeliveryAt, selectedParamId, submitting]);

    const saveDraft = async () => {
        if (!Number.isFinite(numericId) || Number.isNaN(numericId)) return;
        if (!sampleType.trim()) {
            setError("Sample type is required.");
            return;
        }
        try {
            setInfo(null);
            setError(null);
            setSaving(true);
            const updated = await clientSampleRequestService.updateDraft(numericId, buildPayload());
            setData(updated);
            hydrateForm(updated);
            setInfo("Draft saved.");
        } catch (e: any) {
            setError(getValidationMessage(e, "Failed to save draft."));
        } finally {
            setSaving(false);
        }
    };

    const submit = async () => {
        if (!Number.isFinite(numericId) || Number.isNaN(numericId)) return;

        if (!sampleType.trim()) {
            setError("Sample type is required.");
            return;
        }
        if (!scheduledDeliveryAt.trim()) {
            setError("Scheduled delivery time is required.");
            return;
        }
        if (!selectedParamId) {
            setError("Please select one parameter.");
            return;
        }

        try {
            setInfo(null);
            setError(null);
            setSubmitting(true);

            await clientSampleRequestService.submit(numericId, buildPayload() as any);

            navigate("/portal/requests", {
                replace: true,
                state: {
                    flash: {
                        type: "success",
                        message: `Request #${(data as any)?.sample_id ?? numericId} submitted. Admin will review it next.`,
                    },
                },
            });
        } catch (e: any) {
            setError(getValidationMessage(e, "Failed to submit request."));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-sm text-gray-600 flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Loading…
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-[60vh]">
                <div className="px-0 py-2">
                    <nav className="lims-breadcrumb">
                        <button
                            type="button"
                            className="lims-breadcrumb-link inline-flex items-center gap-2"
                            onClick={() => navigate("/portal/requests")}
                        >
                            <ArrowLeft size={16} />
                            Sample Requests
                        </button>
                        <span className="lims-breadcrumb-separator">›</span>
                        <span className="lims-breadcrumb-current">Request detail</span>
                    </nav>
                </div>

                <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-rose-700">{error ?? "Request not found."}</div>
                </div>
            </div>
        );
    }

    const updatedAt = fmtDate((data as any).updated_at ?? (data as any).created_at);
    const statusLabel = effectiveStatus || "Unknown";
    const statusLower = statusLabel.toLowerCase();
    const requestIdLabel = (data as any).sample_id ?? numericId;

    const showHelpDraft = canEdit && (statusLower === "draft" || statusLower === "");
    const showHelpSubmitted = !canEdit && statusLower === "submitted";

    return (
        <div className="min-h-[60vh]">
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <button
                        type="button"
                        className="lims-breadcrumb-link inline-flex items-center gap-2"
                        onClick={() => navigate("/portal/requests")}
                    >
                        <ArrowLeft size={16} />
                        Sample Requests
                    </button>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">Request detail</span>
                </nav>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between px-0 py-2">
                <div>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">Request #{requestIdLabel}</h1>
                        <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", statusTone(statusLabel))}>
                            {statusLabel}
                        </span>

                        <button
                            type="button"
                            className={cx("lims-icon-button", refreshing && "opacity-60 cursor-not-allowed")}
                            onClick={() => load({ silent: true })}
                            disabled={refreshing || submitting || saving}
                            aria-label="Refresh request"
                            title="Refresh"
                        >
                            <RefreshCw size={16} className={cx(refreshing && "animate-spin")} />
                        </button>
                    </div>

                    <div className="text-sm text-gray-600 mt-1">
                        Last updated <span className="font-semibold text-gray-900">{updatedAt}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {canEdit ? (
                        <button
                            type="button"
                            onClick={saveDraft}
                            disabled={saving}
                            className={cx("lims-btn inline-flex items-center gap-2", saving && "opacity-60 cursor-not-allowed")}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {saving ? "Saving…" : "Save draft"}
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSubmit}
                        className={cx(
                            "lims-btn-primary inline-flex items-center gap-2",
                            (!canSubmit || submitting) && "opacity-60 cursor-not-allowed"
                        )}
                        aria-disabled={!canSubmit || submitting}
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {submitting ? "Submitting…" : "Submit"}
                    </button>
                </div>
            </div>

            {error ? (
                <div className="mt-2 text-sm text-rose-900 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl">
                    {error}
                </div>
            ) : null}

            {info ? (
                <div className="mt-2 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl">
                    {info}
                </div>
            ) : null}

            {requestReturnNote && (statusLower === "returned" || statusLower === "needs_revision") ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="text-sm font-semibold text-amber-900">Revision requested</div>
                    <div className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{requestReturnNote}</div>
                </div>
            ) : null}

            {showHelpDraft ? (
                <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                    <div className="font-medium text-gray-900">Ready to submit?</div>
                    <div className="mt-1 text-gray-600">
                        Fill <span className="font-medium">sample type</span>, <span className="font-medium">scheduled delivery</span>, and pick{" "}
                        <span className="font-medium">one parameter</span>, then submit for admin review.
                    </div>
                </div>
            ) : null}

            {showHelpSubmitted ? (
                <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                    This request is submitted and waiting for admin review. Editing is disabled to prevent conflicting changes.
                </div>
            ) : null}

            <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white">
                    <div className="text-sm font-semibold text-gray-900">Request details</div>
                    <div className="text-xs text-gray-500 mt-1">
                        Editable while <span className="font-medium">Draft</span> / <span className="font-medium">Needs revision</span>.
                    </div>
                </div>

                <div className="px-4 md:px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Sample type <span className="text-rose-600">*</span>
                        </label>
                        <input
                            value={sampleType}
                            onChange={(e) => setSampleType(e.target.value)}
                            disabled={!canEdit}
                            placeholder="e.g., Swab, Blood, Tissue…"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Scheduled delivery <span className="text-rose-600">*</span>
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduledDeliveryAt}
                            onChange={(e) => setScheduledDeliveryAt(e.target.value)}
                            disabled={!canEdit}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                        <div className="mt-1 text-[11px] text-gray-500">
                            Use a realistic time you can deliver the sample. This helps scheduling.
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Parameter <span className="text-rose-600">*</span>
                        </label>

                        {selectedParamLabel ? (
                            <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 text-gray-900 px-3 py-1 text-xs font-semibold">
                                    <Check size={14} />
                                    {selectedParamLabel}
                                </span>
                            </div>
                        ) : null}

                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                    <Search size={16} />
                                </span>
                                <input
                                    value={paramQuery}
                                    onChange={(e) => setParamQuery(e.target.value)}
                                    onFocus={() => {
                                        if (!canEdit) return;
                                        setParamPickerOpen(true);
                                        if (paramItems.length === 0 && !paramLoading) {
                                            void loadParams(paramQuery);
                                        }
                                    }}
                                    onMouseDown={() => {
                                        if (!canEdit) return;
                                        setParamPickerOpen(true);
                                    }}
                                    placeholder="Search parameter…"
                                    disabled={!canEdit}
                                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                                />
                            </div>

                            <button
                                type="button"
                                className="lims-btn inline-flex items-center gap-2"
                                onClick={async () => {
                                    setParamPickerOpen(true);
                                    await loadParams(paramQuery);
                                }}
                                disabled={!canEdit || paramLoading}
                            >
                                {paramLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                                Search
                            </button>

                            {canEdit ? (
                                <button
                                    type="button"
                                    className="lims-btn inline-flex items-center gap-2"
                                    onClick={() => setParamPickerOpen((v) => !v)}
                                >
                                    <ChevronDown size={16} className={cx(paramPickerOpen && "rotate-180 transition-transform")} />
                                    {paramPickerOpen ? "Hide" : "Show"}
                                </button>
                            ) : null}
                        </div>

                        {paramPickerOpen ? (
                            <div className="mt-3 rounded-2xl border border-gray-200 bg-white max-h-56 overflow-auto">
                                {paramLoading ? (
                                    <div className="p-3 text-sm text-gray-600 flex items-center gap-2">
                                        <Loader2 size={16} className="animate-spin" />
                                        Loading…
                                    </div>
                                ) : paramItems.length === 0 ? (
                                    <div className="p-3 text-sm text-gray-600">No parameters found.</div>
                                ) : (
                                    <ul className="divide-y divide-gray-100">
                                        {paramItems.map((p) => {
                                            const pid = Number(p.parameter_id);
                                            const checked = selectedParamId === pid;

                                            return (
                                                <li key={pid} className="p-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium text-gray-900 truncate">{parameterLabel(p)}</div>
                                                        <div className="text-xs text-gray-500 truncate">
                                                            {p.unit ? `Unit: ${p.unit}` : "—"}
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedParamId(pid)}
                                                        disabled={!canEdit}
                                                        className={cx(
                                                            "px-3 py-1 rounded-full text-xs border inline-flex items-center gap-2",
                                                            checked
                                                                ? "bg-primary text-white border-primary"
                                                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                                                            !canEdit ? "opacity-50 cursor-not-allowed" : ""
                                                        )}
                                                    >
                                                        {checked ? <Check size={14} /> : null}
                                                        {checked ? "Selected" : "Select"}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        ) : null}

                        <div className="mt-2 text-[11px] text-gray-500">
                            Selected: <span className="font-semibold text-gray-800">{selectedParamId ? 1 : 0}</span> (currently limited to one)
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Examination purpose</label>
                        <textarea
                            value={examinationPurpose}
                            onChange={(e) => setExaminationPurpose(e.target.value)}
                            disabled={!canEdit}
                            rows={2}
                            placeholder="Optional: what is this test for?"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Additional notes</label>
                        <textarea
                            value={additionalNotes}
                            onChange={(e) => setAdditionalNotes(e.target.value)}
                            disabled={!canEdit}
                            rows={3}
                            placeholder="Optional: anything the lab should know (handling, constraints, etc.)"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    {!canEdit ? (
                        <div className="md:col-span-2">
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                Editing is disabled for this status to protect data integrity.
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
