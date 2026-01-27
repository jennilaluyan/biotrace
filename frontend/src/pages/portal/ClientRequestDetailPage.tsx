// L:\Campus\Final Countdown\biotrace\frontend\src\pages\portal\ClientRequestDetailPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Sample } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
import { listParameters, type ParameterRow } from "../../services/parameters";
import { LoaPanelClient } from "../../components/loa/LoaPanelClient";

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
    if (s === "needs_revision" || s === "returned") return "bg-red-100 text-red-700";
    if (s === "returned_to_admin") return "bg-red-100 text-red-700"; // ✅ pickup required (client-facing)
    if (s === "ready_for_delivery") return "bg-indigo-50 text-indigo-700";
    if (s === "physically_received") return "bg-green-100 text-green-800";
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
        setSampleType(String(s.sample_type ?? ""));
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

    const load = async () => {
        if (!Number.isFinite(numericId) || Number.isNaN(numericId)) {
            setError("Invalid request id.");
            setLoading(false);
            return;
        }
        try {
            setError(null);
            setInfo(null);
            setLoading(true);

            const s = await clientSampleRequestService.getById(numericId);
            setData(s);
            hydrateForm(s);

            await loadParams("");
        } catch (e: any) {
            setError(getValidationMessage(e, "Failed to load request detail."));
            setData(null);
        } finally {
            setLoading(false);
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

    const selectParam = (id: number) => {
        setSelectedParamId(id);
    };

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
            setError("Scheduled delivery is required.");
            return;
        }
        if (!selectedParamId) {
            setError("One parameter is required.");
            return;
        }

        try {
            setInfo(null);
            setError(null);
            setSubmitting(true);

            await clientSampleRequestService.submit(numericId, buildPayload() as any);
            navigate("/portal/requests");
        } catch (e: any) {
            setError(getValidationMessage(e, "Failed to submit request."));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-sm text-gray-600">Loading…</div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-[60vh]">
                <div className="px-0 py-2">
                    <nav className="lims-breadcrumb">
                        <span className="lims-breadcrumb-icon">
                            <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M4 12h9" />
                                <path d="M11 9l3 3-3 3" />
                                <path d="M4 6v12" />
                            </svg>
                        </span>
                        <button type="button" className="lims-breadcrumb-link" onClick={() => navigate("/portal/requests")}>
                            Sample Requests
                        </button>
                        <span className="lims-breadcrumb-separator">›</span>
                        <span className="lims-breadcrumb-current">Sample Request Detail</span>
                    </nav>
                </div>

                <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-red-700">{error ?? "Request not found."}</div>
                </div>
            </div>
        );
    }

    const updatedAt = fmtDate((data as any).updated_at ?? (data as any).created_at);
    const statusLabel = effectiveStatus || "Unknown";
    const statusLower = statusLabel.toLowerCase();

    return (
        <div className="min-h-[60vh]">
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <span className="lims-breadcrumb-icon">
                        <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M4 12h9" />
                            <path d="M11 9l3 3-3 3" />
                            <path d="M4 6v12" />
                        </svg>
                    </span>
                    <button type="button" className="lims-breadcrumb-link" onClick={() => navigate("/portal/requests")}>
                        Sample Requests
                    </button>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">Sample Request Detail</span>
                </nav>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <div className="mt-1 flex items-center gap-2">
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">Request #{(data as any).sample_id ?? numericId}</h1>
                        <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", statusTone(statusLabel))}>
                            {statusLabel}
                        </span>
                    </div>

                    <div className="text-sm text-gray-600 mt-1">
                        Last updated <span className="font-semibold text-gray-900">{updatedAt}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {canEdit && (
                        <button
                            type="button"
                            onClick={saveDraft}
                            disabled={saving}
                            className={cx("lims-btn", saving && "opacity-60 cursor-not-allowed")}
                        >
                            {saving ? "Saving..." : "Save draft"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSubmit}
                        className={cx("lims-btn-primary", (!canSubmit || submitting) && "opacity-60 cursor-not-allowed")}
                    >
                        {submitting ? "Submitting..." : "Submit"}
                    </button>
                </div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}
            {info && <div className="text-sm text-green-800 bg-green-100 border border-green-200 px-3 py-2 rounded mb-4">{info}</div>}

            {requestReturnNote && (statusLower === "returned" || statusLower === "needs_revision") && (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="text-sm font-semibold text-amber-900">Revision requested</div>
                    <div className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{requestReturnNote}</div>
                </div>
            )}

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white">
                    <div className="text-sm font-semibold text-gray-900">Request details</div>
                    <div className="text-xs text-gray-500 mt-1">Editable while Draft / Returned.</div>
                </div>

                <div className="px-4 md:px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Sample type <span className="text-red-600">*</span>
                        </label>
                        <input
                            value={sampleType}
                            onChange={(e) => setSampleType(e.target.value)}
                            disabled={!canEdit}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Scheduled delivery at <span className="text-red-600">*</span>
                        </label>
                        <input
                            type="datetime-local"
                            value={scheduledDeliveryAt}
                            onChange={(e) => setScheduledDeliveryAt(e.target.value)}
                            disabled={!canEdit}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Parameter <span className="text-red-600">*</span>
                        </label>

                        {selectedParamLabel && (
                            <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
                                <span className="inline-flex items-center rounded-full bg-red-600 text-white px-3 py-1 text-xs font-semibold">
                                    {selectedParamLabel}
                                </span>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <input
                                value={paramQuery}
                                onChange={(e) => setParamQuery(e.target.value)}
                                onFocus={() => {
                                    if (!canEdit) return;
                                    setParamPickerOpen(true);
                                    if (paramItems.length === 0 && !paramLoading) {
                                        loadParams(paramQuery);
                                    }
                                }}
                                onMouseDown={() => {
                                    if (!canEdit) return;
                                    setParamPickerOpen(true);
                                }}
                                placeholder="Search parameter…"
                                disabled={!canEdit}
                                className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                            />
                            <button
                                type="button"
                                className="lims-btn"
                                onClick={async () => {
                                    setParamPickerOpen(true);
                                    await loadParams(paramQuery);
                                }}
                                disabled={!canEdit || paramLoading}
                            >
                                {paramLoading ? "…" : "Search"}
                            </button>

                            {canEdit && paramPickerOpen && (
                                <button
                                    type="button"
                                    className="lims-btn"
                                    onClick={() => setParamPickerOpen(false)}
                                >
                                    Done
                                </button>
                            )}
                        </div>

                        {paramPickerOpen && (
                            <div className="mt-3 rounded-2xl border border-gray-200 bg-white max-h-48 overflow-auto">
                                {paramLoading ? (
                                    <div className="p-3 text-sm text-gray-600">Loading…</div>
                                ) : paramItems.length === 0 ? (
                                    <div className="p-3 text-sm text-gray-600">No parameters found.</div>
                                ) : (
                                    <ul className="divide-y divide-gray-100">
                                        {paramItems.map((p) => {
                                            const id = Number(p.parameter_id);
                                            const checked = selectedParamId === id;

                                            return (
                                                <li key={id} className="p-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium text-gray-900 truncate">{parameterLabel(p)}</div>
                                                        <div className="text-xs text-gray-500 truncate">{p.unit ? `Unit: ${p.unit}` : ""}</div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => selectParam(id)}
                                                        disabled={!canEdit}
                                                        className={cx(
                                                            "px-3 py-1 rounded-full text-xs border",
                                                            checked
                                                                ? "bg-primary text-white border-primary"
                                                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
                                                            !canEdit ? "opacity-50 cursor-not-allowed" : ""
                                                        )}
                                                    >
                                                        {checked ? "Selected" : "Select"}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        )}

                        <div className="mt-2 text-[11px] text-gray-500">
                            Selected: <span className="font-semibold text-gray-800">{selectedParamId ? 1 : 0}</span>
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Examination purpose</label>
                        <textarea
                            value={examinationPurpose}
                            onChange={(e) => setExaminationPurpose(e.target.value)}
                            disabled={!canEdit}
                            rows={2}
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
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    {!canEdit && (
                        <div className="md:col-span-2">
                            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                This request is not editable in the current status.
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <LoaPanelClient
                requestPayload={data as any}
                onChanged={async () => {
                    await load();
                }}
            />
        </div>
    );
}
