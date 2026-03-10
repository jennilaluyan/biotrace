import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
    ArrowLeft,
    Calendar,
    Check,
    ChevronDown,
    Download,
    FileText,
    Info,
    Loader2,
    RefreshCw,
    Save,
    Search,
    Send,
    TestTube,
} from "lucide-react";

import { apiGet } from "../../services/api";
import type { ClientRequestStatusView, Sample } from "../../services/samples";
import { getClientRequestStatusView } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
import { listParameters, type ParameterRow } from "../../services/parameters";
import { formatDateTimeLocal } from "../../utils/date";
import ClientCoaPreviewModal from "../../components/portal/ClientCoaPreviewModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function statusLabel(t: TFunction, bucket: ClientRequestStatusView): string {
    const keyMap: Record<ClientRequestStatusView, string> = {
        submitted: "portalRequestsPage.status.submitted",
        returned: "portalRequestsPage.status.returned",
        needs_revision: "portalRequestsPage.status.needsRevision",
        ready_for_delivery: "portalRequestsPage.status.readyForDelivery",
        received_by_admin: "portalRequestsPage.status.receivedByAdmin",
        intake_inspection: "portalRequestsPage.status.intakeInspection",
        testing: "portalRequestsPage.status.testing",
        reported: "portalRequestsPage.status.reported",
        rejected: "portalRequestsPage.status.rejected",
        unknown: "portalRequestsPage.status.unknown",
    };

    const fallbackMap: Record<ClientRequestStatusView, string> = {
        submitted: "Submitted",
        returned: "Returned",
        needs_revision: "Needs revision",
        ready_for_delivery: "Ready for delivery",
        received_by_admin: "Received by admin",
        intake_inspection: "Intake inspection",
        testing: "Testing",
        reported: "Reported",
        rejected: "Rejected",
        unknown: "Unknown",
    };

    return t(keyMap[bucket], { defaultValue: fallbackMap[bucket] });
}

function statusToneByView(v: ClientRequestStatusView) {
    if (v === "submitted") return "bg-blue-50 text-blue-700 border-blue-100";
    if (v === "ready_for_delivery") return "bg-indigo-50 text-indigo-700 border-indigo-200";
    if (v === "received_by_admin") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (v === "intake_inspection") return "bg-sky-50 text-sky-800 border-sky-200";
    if (v === "testing") return "bg-violet-50 text-violet-800 border-violet-200";
    if (v === "reported") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (v === "returned" || v === "needs_revision") return "bg-amber-50 text-amber-700 border-amber-200";
    if (v === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
    return "bg-gray-100 text-gray-700 border-gray-200";
}

function getValidationMessage(e: any, fallback: string) {
    const details = e?.data?.details;
    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstVal = firstKey ? details[firstKey] : undefined;
        if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
        if (typeof firstVal === "string" && firstVal) return firstVal;
    }
    return e?.data?.message ?? e?.data?.error ?? fallback;
}

function datetimeLocalFromIso(iso?: string | null): string {
    if (!iso) return "";

    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";

    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function extractPaginatedRows<T>(res: any): T[] {
    const root = res?.data ?? res;
    const data = root?.data ?? root;

    if (Array.isArray(data)) return data as T[];
    if (Array.isArray(data?.data)) return data.data as T[];

    const nested = data?.data ?? null;
    if (Array.isArray(nested)) return nested as T[];
    if (Array.isArray(nested?.data)) return nested.data as T[];

    return [];
}

function extractSingleRow<T>(res: any): T | null {
    const root = res?.data ?? res;
    const row = root?.data ?? root;
    if (!row || Array.isArray(row)) return null;
    return row as T;
}

function parameterLabel(p: any) {
    const id = Number(p?.parameter_id);
    const code = String(p?.code ?? "").trim();
    const name = String(p?.name ?? "").trim();
    return (code ? `${code} — ` : "") + (name || `Parameter #${id}`);
}

function resolveTotalSampleValue(row: any): number {
    const batchItems = Array.isArray(row?.batch_items) ? row.batch_items : [];
    const activeBatchCount = batchItems.filter((it: any) => !it?.batch_excluded_at).length;

    const candidates = [
        Number(row?.total_sample),
        Number(row?.total_samples),
        Number(row?.request_batch_total),
        Number(row?.batch_summary?.batch_total),
        Number(row?.batch_summary?.batch_active_total),
        activeBatchCount,
    ];

    const found = candidates.find((n) => Number.isFinite(n) && n > 0);
    return found ?? 1;
}

function sanitizePositiveIntegerInput(value: string) {
    return value.replace(/[^\d]/g, "");
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

    const [clientRequestNo, setClientRequestNo] = useState<number | null>(null);

    const [sampleType, setSampleType] = useState("");
    const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState("");
    const [totalSample, setTotalSample] = useState("1");
    const [examinationPurpose, setExaminationPurpose] = useState("");
    const [additionalNotes, setAdditionalNotes] = useState("");

    const [paramQuery, setParamQuery] = useState("");
    const [paramLoading, setParamLoading] = useState(false);
    const [paramItems, setParamItems] = useState<ParameterRow[]>([]);
    const [selectedParamId, setSelectedParamId] = useState<number | null>(null);
    const [paramPickerOpen, setParamPickerOpen] = useState(true);

    const [coaPreviewOpen, setCoaPreviewOpen] = useState(false);
    const [coaPreviewSampleId, setCoaPreviewSampleId] = useState<number | null>(null);

    const openCoaPreview = (sampleId: number) => {
        setCoaPreviewSampleId(sampleId);
        setCoaPreviewOpen(true);
    };

    const statusView = useMemo(() => getClientRequestStatusView(data as any), [data]);

    const rawRequestStatus = useMemo(
        () => String((data as any)?.request_status ?? "").trim().toLowerCase(),
        [data]
    );

    const intakeChecklist = useMemo(
        () => (data as any)?.intake_checklist ?? (data as any)?.intakeChecklist ?? null,
        [data]
    );

    const failedChecklistItems = useMemo(() => {
        const rawItems = intakeChecklist?.checklist?.items ?? intakeChecklist?.items ?? [];
        return Array.isArray(rawItems)
            ? rawItems.filter((it: any) => it && it.passed === false)
            : [];
    }, [intakeChecklist]);

    const intakeGeneralNote = useMemo(
        () => String(intakeChecklist?.notes ?? intakeChecklist?.checklist?.general_note ?? "").trim(),
        [intakeChecklist]
    );

    const isFailedIntakePickupFlow = useMemo(() => {
        return !!(data as any)?.admin_received_from_collector_at && ["returned", "rejected"].includes(rawRequestStatus);
    }, [data, rawRequestStatus]);

    const canEdit = useMemo(() => {
        if (isFailedIntakePickupFlow || !!(data as any)?.client_picked_up_at) return false;
        return statusView === "returned" || statusView === "needs_revision" || statusView === "rejected";
    }, [statusView, isFailedIntakePickupFlow, data]);

    const requestedParameterRows = useMemo(() => {
        const arr = (data as any)?.requested_parameters;
        return Array.isArray(arr) ? arr : [];
    }, [data]);

    const requestReturnNote = useMemo(() => {
        const note = String((data as any)?.request_return_note ?? "").trim();
        return note || null;
    }, [data]);

    const coaSampleId = useMemo(() => {
        const sid = Number((data as any)?.sample_id);
        return Number.isFinite(sid) && sid > 0 ? sid : numericId;
    }, [data, numericId]);

    const totalSampleNumber = useMemo(() => {
        return Math.max(1, Number(totalSample) || 1);
    }, [totalSample]);

    useEffect(() => {
        const run = async () => {
            if (!Number.isFinite(numericId)) return;

            try {
                const res = await apiGet<any>("/v1/client/samples", {
                    params: { page: 1, per_page: 200 },
                });

                const rows = extractPaginatedRows<any>(res)
                    .map((it: any) => ({
                        id: Number(it?.sample_id ?? it?.id),
                        createdAt: it?.created_at ?? null,
                    }))
                    .filter((x: any) => Number.isFinite(x.id) && x.id > 0);

                rows.sort((a: any, b: any) => {
                    const ta = a.createdAt ? new Date(a.createdAt).getTime() : Number.NaN;
                    const tb = b.createdAt ? new Date(b.createdAt).getTime() : Number.NaN;
                    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
                    return a.id - b.id;
                });

                const idx = rows.findIndex((r: any) => r.id === numericId);
                setClientRequestNo(idx >= 0 ? idx + 1 : null);
            } catch {
                setClientRequestNo(null);
            }
        };

        void run();
    }, [numericId]);

    const loadParams = async (q?: string) => {
        try {
            setParamLoading(true);
            const res = await listParameters({
                scope: "client",
                page: 1,
                per_page: 20,
                q: (q ?? "").trim() || undefined,
            });
            setParamItems(extractPaginatedRows<ParameterRow>(res));
        } catch {
            setParamItems([]);
        } finally {
            setParamLoading(false);
        }
    };

    const hydrateForm = (sample: Sample) => {
        setSampleType(String((sample as any).sample_type ?? ""));
        setScheduledDeliveryAt(datetimeLocalFromIso((sample as any).scheduled_delivery_at ?? null));
        setTotalSample(String(resolveTotalSampleValue(sample)));
        setExaminationPurpose(String((sample as any).examination_purpose ?? ""));
        setAdditionalNotes(String((sample as any).additional_notes ?? ""));

        const ids = Array.isArray((sample as any).requested_parameters)
            ? (sample as any).requested_parameters
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

            const res = await apiGet<any>(`/v1/client/samples/${numericId}`, {
                params: { include_batch: 1 },
            });

            const sample = extractSingleRow<Sample>(res);

            if (!sample) {
                throw new Error(t("portalRequestDetail.errors.loadFailed", "Failed to load request detail."));
            }

            setData(sample);
            hydrateForm(sample);

            if (!silent) {
                await loadParams("");
            }
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

        void run();

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
            total_sample: totalSampleNumber,
            scheduled_delivery_at: scheduledDeliveryAt || null,
            examination_purpose: examinationPurpose.trim() || null,
            additional_notes: additionalNotes.trim() || null,
            parameter_ids: selectedParamId ? [selectedParamId] : [],
        };
    };

    const canSubmit = useMemo(() => {
        return (
            canEdit &&
            !!sampleType.trim() &&
            totalSampleNumber > 0 &&
            !!scheduledDeliveryAt.trim() &&
            !!selectedParamId &&
            !submitting
        );
    }, [canEdit, sampleType, totalSampleNumber, scheduledDeliveryAt, selectedParamId, submitting]);

    const validateEditableFields = () => {
        if (!sampleType.trim()) {
            setError(t("portalRequestDetail.errors.sampleTypeRequired", "Sample type is required."));
            return false;
        }

        if (!Number.isFinite(Number(totalSample)) || Number(totalSample) <= 0) {
            setError(t("portalRequestDetail.errors.totalSampleRequired", "Total sample must be greater than 0."));
            return false;
        }

        return true;
    };

    const saveChanges = async () => {
        if (!Number.isFinite(numericId)) return;
        if (!validateEditableFields()) return;

        try {
            setInfo(null);
            setError(null);
            setSaving(true);

            const updated = await clientSampleRequestService.updateDraft(numericId, buildPayload() as any);
            setData(updated);
            hydrateForm(updated);

            setInfo(t("portalRequestDetail.info.draftSaved", "Changes saved."));
        } catch (e: any) {
            setError(getValidationMessage(e, t("portalRequestDetail.errors.saveFailed", "Failed to save changes.")));
        } finally {
            setSaving(false);
        }
    };

    const submit = async () => {
        if (!Number.isFinite(numericId)) return;
        if (!validateEditableFields()) return;

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
                        message: t(
                            "portalRequestDetail.flash.submitted",
                            "Request #{{id}} submitted successfully.",
                            { id: clientRequestNo ?? numericId }
                        ),
                    },
                },
            });
        } catch (e: any) {
            setError(getValidationMessage(e, t("portalRequestDetail.errors.submitFailed", "Failed to submit request.")));
        } finally {
            setSubmitting(false);
        }
    };

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
                    <button
                        type="button"
                        onClick={() => navigate("/portal/requests")}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                    >
                        <ArrowLeft size={16} />
                        {t("back", "Back")}
                    </button>
                </div>

                <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="text-sm text-rose-700">
                        {error ?? t("portal.requestDetail.states.notFound", "Request not found.")}
                    </div>
                </div>
            </div>
        );
    }

    const updatedAt = (data as any).updated_at ?? (data as any).created_at;
    const requestIdLabel = clientRequestNo ?? numericId;
    const statusText = statusLabel(t, statusView).toLowerCase();

    const coaReleasedAt = (data as any)?.coa_released_to_client_at ?? null;
    const coaCheckedAt = (data as any)?.coa_checked_at ?? null;
    const coaNote = String((data as any)?.coa_release_note ?? "").trim() || null;
    const canDownloadCoa = !!coaReleasedAt;

    const showHelpSubmitted = !canEdit && statusView === "submitted";

    return (
        <div className="min-h-[60vh] pb-20">
            <div className="mb-2 flex flex-col gap-4 px-0 py-2 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-3">
                    <button
                        type="button"
                        onClick={() => navigate("/portal/requests")}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
                    >
                        <ArrowLeft size={16} />
                        {t("back", "Back")}
                    </button>

                    <div>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                            <h1 className="text-xl font-bold text-gray-900 md:text-2xl">
                                {t("portalRequestDetail.title", "Request #{{id}}", { id: requestIdLabel })}
                            </h1>

                            <span
                                className={cx(
                                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                                    statusToneByView(statusView)
                                )}
                            >
                                {statusText}
                            </span>

                            <button
                                type="button"
                                className={cx(
                                    "lims-icon-button border-transparent bg-transparent hover:bg-gray-100",
                                    refreshing && "cursor-not-allowed opacity-60"
                                )}
                                onClick={() => load({ silent: true })}
                                disabled={refreshing || submitting || saving}
                                aria-label={t("refresh", "Refresh")}
                                title={t("refresh", "Refresh")}
                            >
                                <RefreshCw size={16} className={cx(refreshing && "animate-spin text-primary")} />
                            </button>
                        </div>

                        <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
                            {t("portal.requestDetail.lastUpdated", "Last updated {{at}}", {
                                at: formatDateTimeLocal(updatedAt),
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {canEdit ? (
                        <button
                            type="button"
                            onClick={saveChanges}
                            disabled={saving}
                            className={cx(
                                "btn-outline inline-flex min-w-[140px] items-center gap-2",
                                saving && "cursor-not-allowed opacity-60"
                            )}
                        >
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            {saving ? t("saving", "Saving…") : t("portalRequestDetail.actions.saveChanges", "Save changes")}
                        </button>
                    ) : null}

                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSubmit}
                        className={cx(
                            "lims-btn-primary inline-flex min-w-[120px] items-center gap-2 shadow-sm",
                            (!canSubmit || submitting) && "cursor-not-allowed border-gray-400 bg-gray-400 text-white opacity-60"
                        )}
                        aria-disabled={!canSubmit || submitting}
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {submitting ? t("submitting", "Submitting…") : t("submit", "Submit")}
                    </button>
                </div>
            </div>

            {error ? (
                <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <Info size={18} className="mt-0.5 shrink-0" />
                    {error}
                </div>
            ) : null}

            {info ? (
                <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <Check size={18} className="mt-0.5 shrink-0" />
                    {info}
                </div>
            ) : null}

            {requestReturnNote && (statusView === "returned" || statusView === "needs_revision" || statusView === "rejected") ? (
                <div
                    className={cx(
                        "mb-6 rounded-2xl border px-5 py-4 shadow-sm",
                        statusView === "rejected" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"
                    )}
                >
                    <div
                        className={cx(
                            "mb-1 flex items-center gap-2 font-semibold",
                            statusView === "rejected" ? "text-rose-900" : "text-amber-900"
                        )}
                    >
                        <Info size={18} />
                        {statusView === "rejected"
                            ? t("portal.requestDetail.alerts.rejectedTitle", { defaultValue: "Request rejected" })
                            : statusView === "returned"
                                ? t("portal.requestDetail.alerts.returnedTitle", { defaultValue: "Request returned" })
                                : t("portal.requestDetail.alerts.revisionTitle", { defaultValue: "Revision requested" })}
                    </div>

                    <div
                        className={cx(
                            "whitespace-pre-wrap pl-7 text-sm",
                            statusView === "rejected" ? "text-rose-800" : "text-amber-800"
                        )}
                    >
                        {requestReturnNote}
                    </div>
                </div>
            ) : null}

            {isFailedIntakePickupFlow ? (
                <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 shadow-sm">
                    <div className="mb-1 flex items-center gap-2 font-semibold text-rose-900">
                        <Info size={18} />
                        {t("portalRequestDetail.failedIntake.title", {
                            defaultValue: "Sample pickup required",
                        })}
                    </div>

                    <div className="pl-7 text-sm text-rose-800">
                        {t("portalRequestDetail.failedIntake.body", {
                            defaultValue:
                                "This request became read-only because Sample Collector failed the intake and admin has asked you to pick the sample up.",
                        })}
                    </div>

                    {failedChecklistItems.length ? (
                        <div className="mt-4 pl-7">
                            <div className="mb-2 text-xs font-semibold text-rose-900">
                                {t("portalRequestDetail.failedIntake.listTitle", {
                                    defaultValue: "Failed intake reasons",
                                })}
                            </div>

                            <ul className="space-y-2">
                                {failedChecklistItems.map((it: any, idx: number) => (
                                    <li
                                        key={`${it?.key ?? idx}`}
                                        className="rounded-xl border border-rose-200 bg-white/70 px-3 py-2"
                                    >
                                        <div className="text-sm font-semibold text-rose-900">
                                            {String(it?.key ?? `item_${idx + 1}`)}
                                        </div>
                                        <div className="mt-1 whitespace-pre-wrap text-sm text-rose-800">
                                            {String(it?.note ?? "—")}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {intakeGeneralNote ? (
                        <div className="mt-4 pl-7">
                            <div className="mb-1 text-xs font-semibold text-rose-900">
                                {t("portalRequestDetail.failedIntake.generalNote", {
                                    defaultValue: "Additional note",
                                })}
                            </div>
                            <div className="whitespace-pre-wrap text-sm text-rose-800">{intakeGeneralNote}</div>
                        </div>
                    ) : null}

                    {(data as any)?.client_picked_up_at ? (
                        <div className="mt-4 pl-7 text-xs text-rose-700">
                            {t("portalRequestDetail.failedIntake.pickedUpAt", {
                                at: formatDateTimeLocal((data as any).client_picked_up_at),
                                defaultValue: "Picked up at {{at}}",
                            })}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {showHelpSubmitted ? (
                <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-900">
                    <Info size={18} className="mt-0.5 shrink-0" />
                    <div>
                        {t(
                            "portalRequestDetail.helpers.submittedBody",
                            "This request is submitted and waiting for admin review. Editing is disabled to prevent conflicting changes."
                        )}
                    </div>
                </div>
            ) : null}

            {coaReleasedAt || coaCheckedAt ? (
                <div
                    className={cx(
                        "mb-6 rounded-2xl border px-5 py-4 shadow-sm",
                        canDownloadCoa ? "border-emerald-200 bg-emerald-50" : "border-indigo-200 bg-indigo-50"
                    )}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className={cx("font-semibold", canDownloadCoa ? "text-emerald-900" : "text-indigo-900")}>
                                {t("portal.coa.title", "Certificate of Analysis (COA)")}
                            </div>

                            <div className={cx("mt-1 text-sm", canDownloadCoa ? "text-emerald-800" : "text-indigo-800")}>
                                {canDownloadCoa
                                    ? t("portal.coa.available", "COA sudah tersedia dan bisa diunduh.")
                                    : t("portal.coa.checkedPending", "COA sudah dicek, menunggu rilis admin.")}
                            </div>

                            {coaReleasedAt ? (
                                <div className={cx("mt-2 text-xs", canDownloadCoa ? "text-emerald-700" : "text-indigo-700")}>
                                    {t("portal.coa.releasedAt", "Dirilis: {{at}}", {
                                        at: formatDateTimeLocal(coaReleasedAt),
                                    })}
                                </div>
                            ) : null}

                            {coaNote ? (
                                <div
                                    className={cx(
                                        "mt-2 whitespace-pre-wrap text-xs",
                                        canDownloadCoa ? "text-emerald-700" : "text-indigo-700"
                                    )}
                                >
                                    {t("portal.coa.note", "Catatan:")} {coaNote}
                                </div>
                            ) : null}
                        </div>

                        {canDownloadCoa ? (
                            <button
                                type="button"
                                className="lims-btn-primary inline-flex shrink-0 items-center gap-2"
                                onClick={() => Number.isFinite(coaSampleId) && openCoaPreview(coaSampleId as number)}
                            >
                                <Download size={16} />
                                {t("portal.actions.downloadCoa", "Download COA")}
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div className="lims-detail-shell">
                <div className="mb-6 border-b border-gray-100 pb-4">
                    <h2 className="text-base font-semibold text-gray-900">
                        {t("portal.requestDetail.sections.detailsTitle", "Request details")}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                        {t("portal.requestDetail.sections.detailsSub", "Editable when returned / revision / rejected.")}
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="space-y-6">
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                {t("portal.requestDetail.fields.sampleType", "Sample type")} <span className="text-rose-600">*</span>
                            </label>
                            <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                                    <TestTube size={16} />
                                </span>
                                <input
                                    value={sampleType}
                                    onChange={(e) => setSampleType(e.target.value)}
                                    disabled={!canEdit}
                                    placeholder={t("portalRequestForm.placeholders.sampleType", "e.g., Swab, Blood, Tissue…")}
                                    className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft disabled:bg-gray-50 disabled:text-gray-500"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                {t("portal.requestDetail.fields.scheduledDelivery", "Scheduled delivery")} <span className="text-rose-600">*</span>
                            </label>
                            <div className="relative">
                                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                                    <Calendar size={16} />
                                </span>
                                <input
                                    type="datetime-local"
                                    value={scheduledDeliveryAt}
                                    onChange={(e) => setScheduledDeliveryAt(e.target.value)}
                                    disabled={!canEdit}
                                    className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft disabled:bg-gray-50 disabled:text-gray-500"
                                />
                            </div>
                            <p className="mt-1.5 text-[11px] text-gray-500">
                                {t("portalRequestDetail.helpers.deliveryHint", "Use a realistic time you can deliver the sample.")}
                            </p>
                        </div>

                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                {t("portal.requestDetail.fields.totalSample", "Total sample")} <span className="text-rose-600">*</span>
                            </label>
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={totalSample}
                                onChange={(e) => setTotalSample(sanitizePositiveIntegerInput(e.target.value))}
                                disabled={!canEdit}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft disabled:bg-gray-50 disabled:text-gray-500"
                            />
                            <p className="mt-1.5 text-[11px] text-gray-500">
                                {t(
                                    "portal.requestDetail.helpers.totalSample",
                                    "This request contains {{count}} sample(s) in the same submission.",
                                    { count: totalSampleNumber }
                                )}
                            </p>
                        </div>

                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                {t("portal.requestDetail.fields.additionalNotes", "Additional notes")}
                            </label>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-3 top-3 flex items-start text-gray-400">
                                    <FileText size={16} />
                                </span>
                                <textarea
                                    value={additionalNotes}
                                    onChange={(e) => setAdditionalNotes(e.target.value)}
                                    disabled={!canEdit}
                                    rows={3}
                                    placeholder={t("portalRequestForm.placeholders.additionalNotes", "Optional...")}
                                    className="min-h-[100px] w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-3 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft disabled:bg-gray-50 disabled:text-gray-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                {t("portal.requestDetail.fields.parameter", "Parameter")} <span className="text-rose-600">*</span>
                            </label>

                            {selectedParamLabel ? (
                                <div className="mb-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="inline-flex w-full items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-medium text-primary-dark">
                                        <Check size={16} className="text-primary" />
                                        <span className="flex-1 truncate">{selectedParamLabel}</span>
                                    </div>
                                </div>
                            ) : null}

                            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                                <div className="mb-3 flex gap-2">
                                    <div className="relative flex-1">
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
                                            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-xs focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft disabled:bg-gray-100"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        className="lims-icon-button h-9 w-9 border border-gray-200 bg-white"
                                        onClick={() => setParamPickerOpen((v) => !v)}
                                        disabled={!canEdit}
                                    >
                                        <ChevronDown
                                            size={16}
                                            className={cx(paramPickerOpen && "rotate-180 transition-transform")}
                                        />
                                    </button>
                                </div>

                                {paramPickerOpen ? (
                                    <div className="custom-scrollbar max-h-48 overflow-y-auto pr-1">
                                        {paramLoading ? (
                                            <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
                                                <Loader2 size={14} className="animate-spin" />
                                                {t("loading", "Loading...")}
                                            </div>
                                        ) : paramItems.length === 0 ? (
                                            <div className="py-4 text-center text-xs italic text-gray-500">
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
                                                                    "group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors",
                                                                    checked
                                                                        ? "border border-primary/30 bg-white shadow-sm ring-1 ring-primary/10"
                                                                        : "border border-transparent text-gray-600 hover:border-gray-200 hover:bg-white hover:text-gray-900"
                                                                )}
                                                            >
                                                                <div className="min-w-0 flex-1">
                                                                    <div className={cx("truncate font-medium", checked && "text-primary-dark")}>
                                                                        {parameterLabel(p)}
                                                                    </div>
                                                                    <div className="truncate text-[10px] text-gray-400">
                                                                        {p.unit
                                                                            ? t("portal.requestDetail.parameterPicker.unit", "Unit: {{unit}}", {
                                                                                unit: p.unit,
                                                                            })
                                                                            : "—"}
                                                                    </div>
                                                                </div>

                                                                {checked ? <Check size={14} className="shrink-0 text-primary" /> : null}
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                                {t("portal.requestDetail.fields.examinationPurpose", "Examination purpose")}
                            </label>
                            <textarea
                                value={examinationPurpose}
                                onChange={(e) => setExaminationPurpose(e.target.value)}
                                disabled={!canEdit}
                                rows={2}
                                placeholder={t("portalRequestForm.placeholders.examinationPurpose", "Optional: what is this test for?")}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft disabled:bg-gray-50 disabled:text-gray-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <ClientCoaPreviewModal
                open={coaPreviewOpen}
                onClose={() => {
                    setCoaPreviewOpen(false);
                    setCoaPreviewSampleId(null);
                }}
                sampleId={coaPreviewSampleId}
                title={t("portal.coa.previewTitle", "COA Preview")}
            />
        </div>
    );
}