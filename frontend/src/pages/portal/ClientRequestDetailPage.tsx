import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft,
    Calendar,
    Check,
    ChevronDown,
    FileText,
    Info,
    Loader2,
    RefreshCw,
    Save,
    Search,
    Send,
    TestTube,
} from "lucide-react";

import type { Sample } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
import { listParameters, type ParameterRow } from "../../services/parameters";
import { formatDateTimeLocal } from "../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

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

// Helper untuk status warna badge
const statusTone = (raw?: string | null) => {
    const s = (raw ?? "").toLowerCase();
    if (s === "draft") return "bg-gray-100 text-gray-700 border-gray-200";
    if (s === "submitted") return "bg-blue-50 text-blue-700 border-blue-100";
    if (s === "needs_revision" || s === "returned") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "returned_to_admin") return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "ready_for_delivery") return "bg-indigo-50 text-indigo-700 border-indigo-200";
    if (s === "physically_received") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
};

// Helper untuk input datetime-local HTML5
function datetimeLocalFromIso(iso?: string | null): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";

    // Format YYYY-MM-DDTHH:mm manually to avoid timezone shifts from toISOString()
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
    const { t } = useTranslation();
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

    // form state
    const [sampleType, setSampleType] = useState("");
    const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState("");
    const [examinationPurpose, setExaminationPurpose] = useState("");
    const [additionalNotes, setAdditionalNotes] = useState("");

    // parameters state
    const [paramQuery, setParamQuery] = useState("");
    const [paramLoading, setParamLoading] = useState(false);
    const [paramItems, setParamItems] = useState<ParameterRow[]>([]);
    const [selectedParamId, setSelectedParamId] = useState<number | null>(null);
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

    // Load parameters list
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

    // Hydrate form data from API response
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
            setError(t("portalRequestDetail.errors.invalidId", "Invalid request id."));
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
            setError(getValidationMessage(e, t("portalRequestDetail.errors.loadFailed", "Failed to load request detail.")));
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
        return t("portalRequestDetail.parameterFallback", "Parameter #{{id}}", { id: selectedParamId });
    }, [selectedParamId, paramItems, requestedParameterRows, t]);

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
        if (!Number.isFinite(numericId)) return;
        if (!sampleType.trim()) {
            setError(t("portalRequestDetail.errors.sampleTypeRequired", "Sample type is required."));
            return;
        }
        try {
            setInfo(null);
            setError(null);
            setSaving(true);
            const updated = await clientSampleRequestService.updateDraft(numericId, buildPayload());
            setData(updated);
            hydrateForm(updated);
            setInfo(t("portalRequestDetail.info.draftSaved", "Draft saved."));
        } catch (e: any) {
            setError(getValidationMessage(e, t("portalRequestDetail.errors.saveFailed", "Failed to save draft.")));
        } finally {
            setSaving(false);
        }
    };

    const submit = async () => {
        if (!Number.isFinite(numericId)) return;

        if (!sampleType.trim()) {
            setError(t("portalRequestDetail.errors.sampleTypeRequired", "Sample type is required."));
            return;
        }
        if (!scheduledDeliveryAt.trim()) {
            setError(t("portalRequestDetail.errors.scheduledDeliveryRequired", "Scheduled delivery time is required."));
            return;
        }
        if (!selectedParamId) {
            setError(t("portalRequestDetail.errors.parameterRequired", "Please select one parameter."));
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
                        message: t("portalRequestDetail.flash.submitted", "Request #{{id}} submitted successfully.", { id: (data as any)?.sample_id ?? numericId }),
                    },
                },
            });
        } catch (e: any) {
            setError(getValidationMessage(e, t("portalRequestDetail.errors.submitFailed", "Failed to submit request.")));
        } finally {
            setSubmitting(false);
        }
    };

    // --- RENDERERS ---

    if (loading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-sm text-gray-600 flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-primary" />
                    {t("loading", "Loading…")}
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
                            {t("portal.requestDetail.breadcrumbRequests", "Sample Requests")}
                        </button>
                        <span className="lims-breadcrumb-separator">›</span>
                        <span className="lims-breadcrumb-current">{t("portal.requestDetail.breadcrumbCurrent", "Request detail")}</span>
                    </nav>
                </div>
                <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                    <div className="text-sm text-rose-700">{error ?? t("portal.requestDetail.states.notFound", "Request not found.")}</div>
                </div>
            </div>
        );
    }

    const updatedAt = (data as any).updated_at ?? (data as any).created_at;
    const statusLabel = effectiveStatus || "Unknown";
    const statusLower = statusLabel.toLowerCase();
    const requestIdLabel = (data as any).sample_id ?? numericId;

    const showHelpDraft = canEdit && (statusLower === "draft" || statusLower === "");
    const showHelpSubmitted = !canEdit && statusLower === "submitted";

    return (
        <div className="min-h-[60vh] pb-20">
            {/* Breadcrumb */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <button
                        type="button"
                        className="lims-breadcrumb-link inline-flex items-center gap-2"
                        onClick={() => navigate("/portal/requests")}
                    >
                        <ArrowLeft size={16} />
                        {t("portal.requestDetail.breadcrumbRequests", "Sample Requests")}
                    </button>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">{t("portal.requestDetail.breadcrumbCurrent", "Request detail")}</span>
                </nav>
            </div>

            {/* Header Area */}
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between px-0 py-2 mb-2">
                <div>
                    <div className="mt-1 flex items-center gap-3 flex-wrap">
                        <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                            {t("portalRequestDetail.title", "Request #{{id}}", { id: requestIdLabel })}
                        </h1>
                        <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border", statusTone(statusLabel))}>
                            {t(`portal.status.${statusLower}`, statusLabel)}
                        </span>

                        <button
                            type="button"
                            className={cx("lims-icon-button bg-transparent border-transparent hover:bg-gray-100", refreshing && "opacity-60 cursor-not-allowed")}
                            onClick={() => load({ silent: true })}
                            disabled={refreshing || submitting || saving}
                            aria-label={t("refresh", "Refresh")}
                            title={t("refresh", "Refresh")}
                        >
                            <RefreshCw size={16} className={cx(refreshing && "animate-spin text-primary")} />
                        </button>
                    </div>

                    <div className="text-xs text-gray-500 mt-1.5 flex items-center gap-1">
                        {t("portal.requestDetail.lastUpdated", "Last updated {{at}}", { at: formatDateTimeLocal(updatedAt) })}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 flex-wrap">
                    {canEdit ? (
                        <button
                            type="button"
                            onClick={saveDraft}
                            disabled={saving}
                            className={cx(
                                "btn-outline inline-flex items-center gap-2 min-w-[120px]",
                                saving && "opacity-60 cursor-not-allowed"
                            )}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {saving ? t("saving", "Saving…") : t("saveDraft", "Save draft")}
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSubmit}
                        className={cx(
                            "lims-btn-primary inline-flex items-center gap-2 min-w-[120px] shadow-sm",
                            (!canSubmit || submitting) && "opacity-60 cursor-not-allowed bg-gray-400 border-gray-400 text-white"
                        )}
                        aria-disabled={!canSubmit || submitting}
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {submitting ? t("submitting", "Submitting…") : t("submit", "Submit")}
                    </button>
                </div>
            </div>

            {/* Global Alerts */}
            {error ? (
                <div className="mb-4 text-sm text-rose-900 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl flex items-start gap-2">
                    <Info size={18} className="shrink-0 mt-0.5" />
                    {error}
                </div>
            ) : null}

            {info ? (
                <div className="mb-4 text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 px-4 py-3 rounded-2xl flex items-start gap-2">
                    <Check size={18} className="shrink-0 mt-0.5" />
                    {info}
                </div>
            ) : null}

            {requestReturnNote && (statusLower === "returned" || statusLower === "needs_revision") ? (
                <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 font-semibold mb-1">
                        <Info size={18} />
                        {t("portal.requestDetail.alerts.revisionTitle", "Revision requested")}
                    </div>
                    <div className="text-sm text-amber-800 pl-7 whitespace-pre-wrap">{requestReturnNote}</div>
                </div>
            ) : null}

            {showHelpDraft ? (
                <div className="mb-6 rounded-2xl border border-gray-200 bg-linear-to-r from-gray-50 to-white px-5 py-4 text-sm text-gray-700 shadow-sm">
                    <div className="font-semibold text-gray-900 mb-1">{t("portalRequestDetail.helpers.readyTitle", "Ready to submit?")}</div>
                    <div className="text-gray-600">
                        {t("portalRequestDetail.helpers.readyBody", "Fill sample type, scheduled delivery, and pick one parameter, then submit for admin review.")}
                    </div>
                </div>
            ) : null}

            {showHelpSubmitted ? (
                <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-900 flex items-start gap-3">
                    <Info size={18} className="shrink-0 mt-0.5" />
                    <div>
                        {t("portalRequestDetail.helpers.submittedBody", "This request is submitted and waiting for admin review. Editing is disabled to prevent conflicting changes.")}
                    </div>
                </div>
            ) : null}

            {/* Main Form Card */}
            <div className="lims-detail-shell">
                <div className="border-b border-gray-100 pb-4 mb-6">
                    <h2 className="text-base font-semibold text-gray-900">{t("portal.requestDetail.sections.detailsTitle", "Request details")}</h2>
                    <p className="text-xs text-gray-500 mt-1">
                        {t("portal.requestDetail.sections.detailsSub", "Editable while Draft / Returned.")}
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column: Basic Info */}
                    <div className="space-y-6">
                        {/* Sample Type */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t("portal.requestDetail.fields.sampleType", "Sample type")} <span className="text-rose-600">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                                    <TestTube size={16} />
                                </span>
                                <input
                                    value={sampleType}
                                    onChange={(e) => setSampleType(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder={t("portalRequestForm.placeholders.sampleType", "e.g., Swab, Blood, Tissue…")}
                                    className="w-full rounded-xl border border-gray-300 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 transition-all"
                                />
                            </div>
                        </div>

                        {/* Scheduled Delivery */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t("portal.requestDetail.fields.scheduledDelivery", "Scheduled delivery")} <span className="text-rose-600">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">
                                    <Calendar size={16} />
                                </span>
                                <input
                                    type="datetime-local"
                                    value={scheduledDeliveryAt}
                                    onChange={(e) => setScheduledDeliveryAt(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full rounded-xl border border-gray-300 pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 transition-all"
                                />
                            </div>
                            <p className="mt-1.5 text-[11px] text-gray-500">
                                {t("portalRequestDetail.helpers.deliveryHint", "Use a realistic time you can deliver the sample.")}
                            </p>
                        </div>

                        {/* Notes */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t("portal.requestDetail.fields.additionalNotes", "Additional notes")}
                            </label>
                            <div className="relative">
                                <span className="absolute top-3 left-3 flex items-start text-gray-400 pointer-events-none">
                                    <FileText size={16} />
                                </span>
                                <textarea
                                    value={additionalNotes}
                                    onChange={(e) => setAdditionalNotes(e.target.value)}
                                    disabled={!canEdit}
                                    rows={3}
                                    placeholder={t("portalRequestForm.placeholders.additionalNotes", "Optional...")}
                                    className="w-full rounded-xl border border-gray-300 pl-10 pr-3 py-2.5 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Parameters & Purpose */}
                    <div className="space-y-6">
                        {/* Parameter Picker */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t("portal.requestDetail.fields.parameter", "Parameter")} <span className="text-rose-600">*</span>
                            </label>

                            {selectedParamLabel ? (
                                <div className="mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 text-primary-dark px-3 py-2 text-sm font-medium w-full">
                                        <Check size={16} className="text-primary" />
                                        <span className="truncate flex-1">{selectedParamLabel}</span>
                                    </div>
                                </div>
                            ) : null}

                            <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200">
                                <div className="flex gap-2 mb-3">
                                    <div className="flex-1 relative">
                                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
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
                                            placeholder={t("portal.requestDetail.fields.parameterSearchPlaceholder", "Search parameter...")}
                                            disabled={!canEdit}
                                            className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100 bg-white"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        className="lims-icon-button bg-white border border-gray-200 h-9 w-9"
                                        onClick={() => setParamPickerOpen((v) => !v)}
                                        disabled={!canEdit}
                                    >
                                        <ChevronDown size={16} className={cx(paramPickerOpen && "rotate-180 transition-transform")} />
                                    </button>
                                </div>

                                {paramPickerOpen && (
                                    <div className="max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                                        {paramLoading ? (
                                            <div className="py-4 text-xs text-gray-500 flex items-center justify-center gap-2">
                                                <Loader2 size={14} className="animate-spin" />
                                                {t("loading", "Loading...")}
                                            </div>
                                        ) : paramItems.length === 0 ? (
                                            <div className="py-4 text-xs text-gray-500 text-center italic">
                                                {t("portal.requestDetail.parameterPicker.empty", "No parameters found.")}
                                            </div>
                                        ) : (
                                            <ul className="space-y-1">
                                                {paramItems.map((p) => {
                                                    const pid = Number(p.parameter_id);
                                                    const checked = selectedParamId === pid;
                                                    return (
                                                        <li key={pid}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedParamId(pid)}
                                                                disabled={!canEdit}
                                                                className={cx(
                                                                    "w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center justify-between group",
                                                                    checked
                                                                        ? "bg-white border border-primary/30 shadow-sm ring-1 ring-primary/10"
                                                                        : "hover:bg-white border border-transparent hover:border-gray-200 text-gray-600 hover:text-gray-900"
                                                                )}
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className={cx("font-medium truncate", checked ? "text-primary-dark" : "")}>
                                                                        {parameterLabel(p)}
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-400 truncate">
                                                                        {p.unit ? t("portal.requestDetail.parameterPicker.unit", "Unit: {{unit}}", { unit: p.unit }) : "—"}
                                                                    </div>
                                                                </div>
                                                                {checked && <Check size={14} className="text-primary shrink-0" />}
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Purpose */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t("portal.requestDetail.fields.examinationPurpose", "Examination purpose")}
                            </label>
                            <textarea
                                value={examinationPurpose}
                                onChange={(e) => setExaminationPurpose(e.target.value)}
                                disabled={!canEdit}
                                rows={2}
                                placeholder={t("portalRequestForm.placeholders.examinationPurpose", "Optional: what is this test for?")}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500 transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}