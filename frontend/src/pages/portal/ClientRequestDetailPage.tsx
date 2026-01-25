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
    const [selectedParamIds, setSelectedParamIds] = useState<number[]>([]);

    const effectiveStatus = useMemo(() => String((data as any)?.request_status ?? ""), [data]);

    const canEdit = useMemo(() => {
        const s = effectiveStatus.toLowerCase();
        return s === "draft" || s === "needs_revision" || s === "returned" || s === "";
    }, [effectiveStatus]);

    const loadParams = async (q?: string) => {
        try {
            setParamLoading(true);
            const res = await listParameters({ page: 1, per_page: 20, q: (q ?? "").trim() || undefined });
            const rows = (res as any)?.data?.data ?? [];
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
            ? (s as any).requested_parameters.map((p: any) => Number(p.parameter_id)).filter((x: any) => Number.isFinite(x))
            : [];
        setSelectedParamIds(Array.isArray(ids) ? Array.from(new Set(ids)) : []);
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
            loadParams("");
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

    const toggleParam = (id: number) => {
        setSelectedParamIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id);
            return [...prev, id];
        });
    };

    const buildPayload = () => {
        return {
            sample_type: sampleType.trim(),
            scheduled_delivery_at: scheduledDeliveryAt ? scheduledDeliveryAt : null,
            examination_purpose: examinationPurpose.trim() || null,
            additional_notes: additionalNotes.trim() || null,
            parameter_ids: selectedParamIds,
        };
    };

    const canSubmit = useMemo(() => {
        return canEdit && !!sampleType.trim() && !!scheduledDeliveryAt.trim() && selectedParamIds.length >= 1 && !submitting;
    }, [canEdit, sampleType, scheduledDeliveryAt, selectedParamIds, submitting]);

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
        if (selectedParamIds.length < 1) {
            setError("At least 1 parameter is required.");
            return;
        }

        try {
            setInfo(null);
            setError(null);
            setSubmitting(true);

            // submit requires payload now
            const updated = await clientSampleRequestService.submit(numericId, buildPayload() as any);
            setInfo("Submitted successfully. Waiting for admin review.");
            setData(updated);
            await load();
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
                    <button type="button" className="lims-btn" onClick={() => navigate("/portal/requests")}>
                        Back
                    </button>
                </div>
                <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-red-700">{error ?? "Request not found."}</div>
                </div>
            </div>
        );
    }

    const updatedAt = fmtDate((data as any).updated_at ?? (data as any).created_at);
    const statusLabel = effectiveStatus || "Unknown";

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <button type="button" className="lims-btn" onClick={() => navigate("/portal/requests")}>
                        Back
                    </button>

                    <div className="mt-3 flex items-center gap-2">
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">
                            Request #{(data as any).sample_id ?? numericId}
                        </h1>
                        <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", statusTone(statusLabel))}>
                            {statusLabel}
                        </span>
                    </div>

                    <div className="text-sm text-gray-600 mt-1">
                        Updated <span className="font-semibold text-gray-900">{updatedAt}</span>
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
                            Parameters <span className="text-red-600">*</span>
                        </label>

                        <div className="flex gap-2">
                            <input
                                value={paramQuery}
                                onChange={(e) => setParamQuery(e.target.value)}
                                placeholder="Search parameter…"
                                disabled={!canEdit}
                                className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                            />
                            <button
                                type="button"
                                className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                onClick={() => loadParams(paramQuery)}
                                disabled={!canEdit || paramLoading}
                            >
                                {paramLoading ? "…" : "Search"}
                            </button>
                        </div>

                        <div className="mt-3 rounded-2xl border border-gray-200 bg-white max-h-48 overflow-auto">
                            {paramLoading ? (
                                <div className="p-3 text-sm text-gray-600">Loading…</div>
                            ) : paramItems.length === 0 ? (
                                <div className="p-3 text-sm text-gray-600">No parameters found.</div>
                            ) : (
                                <ul className="divide-y divide-gray-100">
                                    {paramItems.map((p) => {
                                        const id = Number(p.parameter_id);
                                        const checked = selectedParamIds.includes(id);
                                        return (
                                            <li key={id} className="p-3 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-gray-900 truncate">
                                                        {(p.code ? `${p.code} — ` : "") + (p.name ?? `Parameter #${id}`)}
                                                    </div>
                                                    <div className="text-xs text-gray-500 truncate">{p.unit ? `Unit: ${p.unit}` : ""}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleParam(id)}
                                                    disabled={!canEdit}
                                                    className={`px-3 py-1 rounded-full text-xs border ${checked
                                                        ? "bg-primary text-white border-primary"
                                                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                                                        } ${!canEdit ? "opacity-50 cursor-not-allowed" : ""}`}
                                                >
                                                    {checked ? "Selected" : "Select"}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <div className="mt-2 text-[11px] text-gray-500">
                            Selected: <span className="font-semibold text-gray-800">{selectedParamIds.length}</span>
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
