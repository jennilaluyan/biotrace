import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { clientPortal, ClientSample } from "../../services/clientPortal";
import { LoaPanelClient } from "../../components/loa/LoaPanelClient";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

const fmtDate = (iso?: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
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
    if (s === "draft" || s === "pending") return "bg-gray-100 text-gray-700";
    if (s === "submitted" || s === "requested") return "bg-primary-soft/10 text-primary-soft";
    if (s === "returned" || s === "rejected") return "bg-red-100 text-red-700";
    if (s === "approved" || s === "accepted") return "bg-green-100 text-green-800";
    return "bg-gray-100 text-gray-700";
};

export default function ClientRequestDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const numericId = Number(id);

    const [data, setData] = useState<ClientSample | null>(null);
    const [loading, setLoading] = useState(true);

    const [saving, setSaving] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    // editable form
    const [sampleType, setSampleType] = useState("");
    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [description, setDescription] = useState("");

    const effectiveStatus = useMemo(
        () => data?.request_status ?? data?.status,
        [data?.request_status, data?.status]
    );

    const canEdit = useMemo(() => {
        const s = (effectiveStatus ?? "").toLowerCase();
        return s === "draft" || s === "returned" || s === "rejected" || s === "" || s === "pending";
    }, [effectiveStatus]);

    const hydrateForm = (s: ClientSample) => {
        setSampleType(String(s.sample_type ?? ""));
        setTitle(String(s.title ?? s.name ?? ""));
        setNotes(String((s as any).notes ?? ""));
        setDescription(String((s as any).description ?? ""));
    };

    const load = async () => {
        if (!numericId || Number.isNaN(numericId)) {
            setError("Invalid request id.");
            setLoading(false);
            return;
        }

        try {
            setError(null);
            setInfo(null);
            setLoading(true);

            const s = await clientPortal.getSample(numericId);
            setData(s);
            hydrateForm(s);
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

    const buildPayload = () => {
        const payload: Record<string, any> = {};

        const st = sampleType.trim();
        if (st) payload.sample_type = st;

        const t = title.trim();
        payload.title = t || null;
        payload.name = t || null;

        payload.notes = notes.trim() || null;
        payload.description = description.trim() || null;

        return payload;
    };

    const saveDraft = async () => {
        if (!numericId) return;

        if (!sampleType.trim()) {
            setError("Sample type is required.");
            return;
        }

        try {
            setInfo(null);
            setError(null);
            setSaving(true);

            const updated = await clientPortal.updateSample(numericId, buildPayload());
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
        if (!numericId) return;

        if (!sampleType.trim()) {
            setError("Sample type is required.");
            return;
        }

        try {
            setInfo(null);
            setError(null);
            setSubmitting(true);

            // auto save before submit if editable
            if (canEdit) {
                await clientPortal.updateSample(numericId, buildPayload());
            }

            await clientPortal.submitSample(numericId);

            setInfo("Submitted successfully. Waiting for admin review.");
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

    const code = data.sample_code ?? data.code ?? "-";
    const updated = fmtDate(data.updated_at ?? data.created_at);
    const statusLabel = effectiveStatus ?? "Unknown";

    return (
        <div className="min-h-[60vh]">
            {/* Header (match staff detail pages vibe) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <button type="button" className="lims-btn" onClick={() => navigate("/portal/requests")}>
                        Back
                    </button>

                    <div className="mt-3 flex items-center gap-2">
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">Request #{data.id}</h1>
                        <span
                            className={cx(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                                statusTone(statusLabel)
                            )}
                        >
                            {statusLabel}
                        </span>
                    </div>

                    <div className="text-sm text-gray-600 mt-1">
                        Code <span className="font-semibold text-gray-900">{code}</span> · Updated{" "}
                        <span className="font-semibold text-gray-900">{updated}</span>
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
                        disabled={submitting}
                        className={cx("lims-btn-primary", submitting && "opacity-60 cursor-not-allowed")}
                    >
                        {submitting ? "Submitting..." : "Submit"}
                    </button>
                </div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}
            {info && <div className="text-sm text-green-800 bg-green-100 border border-green-200 px-3 py-2 rounded mb-4">{info}</div>}

            {/* Card (same as staff card) */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white">
                    <div className="text-sm font-semibold text-gray-900">Request details</div>
                    <div className="text-xs text-gray-500 mt-1">
                        You can edit while status is Draft / Returned. Submit when ready.
                    </div>
                </div>

                <div className="px-4 md:px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                            Sample type <span className="text-red-600">*</span>
                        </label>
                        <input
                            value={sampleType}
                            onChange={(e) => setSampleType(e.target.value)}
                            disabled={!canEdit}
                            placeholder="Must match backend"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Title / Name</label>
                        <input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={!canEdit}
                            placeholder="e.g. Water sample from Site A"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                        <input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            disabled={!canEdit}
                            placeholder="Optional notes for the lab"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={!canEdit}
                            placeholder="Describe sample context, handling notes, requested context, etc."
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-[140px] focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
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
                requestPayload={data}
                onChanged={async () => {
                    await load();
                }}
            />

            {/* Debug (keep but make it staff-ish, not ugly) */}
            <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white">
                    <div className="text-sm font-semibold text-gray-900">Raw snapshot</div>
                    <div className="text-xs text-gray-500 mt-1">Debug view (safe to remove later).</div>
                </div>

                <pre className="px-4 md:px-6 py-4 text-xs bg-gray-50 overflow-auto">
                    {JSON.stringify(data, null, 2)}
                </pre>
            </div>
        </div>
    );
}
