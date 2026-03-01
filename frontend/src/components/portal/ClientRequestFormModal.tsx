import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { clientSampleRequestService, type ClientSampleDraftPayload } from "../../services/sampleRequests";
import type { Sample } from "../../services/samples";
import { listParameters, type ParameterRow } from "../../services/parameters";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: (created: Sample) => void;
};

type ApiError = {
    data?: {
        message?: string;
        error?: string;
        details?: Record<string, string[] | string>;
    };
    response?: {
        data?: any;
    };
};

const getErrorMessage = (err: unknown, fallback: string) => {
    const e = err as ApiError;
    const data = e?.response?.data ?? e?.data;

    const details = data?.details ?? data?.errors;
    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstVal = firstKey ? (details as any)[firstKey] : undefined;
        if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
        if (typeof firstVal === "string" && firstVal) return firstVal;
    }
    return data?.message ?? data?.error ?? fallback;
};

// datetime-local -> API string (keep local as-is; backend normalizes date parsing)
function datetimeLocalToApi(v: string): string | null {
    if (!v) return null;
    return v; // keep "YYYY-MM-DDTHH:mm" (avoid timezone shift)
}

function extractPaginatedRows<T>(res: any): T[] {
    const root = res?.data ?? res;
    const maybeEnvelope = root?.data && typeof root === "object" && "status" in root && "data" in root ? root : root;
    const d = maybeEnvelope?.data ?? maybeEnvelope;

    if (Array.isArray(d)) return d as T[];
    if (Array.isArray(d?.data)) return d.data as T[];
    return [];
}

function parameterLabel(p: ParameterRow) {
    const id = Number(p.parameter_id);
    const code = (p.code ?? "").trim();
    const name = (p.name ?? "").trim();
    return (code ? `${code} — ` : "") + (name || `Parameter #${id}`);
}

export const ClientRequestFormModal = ({ open, onClose, onCreated }: Props) => {
    const [sampleType, setSampleType] = useState("");
    const [scheduledDeliveryAt, setScheduledDeliveryAt] = useState("");
    const [examinationPurpose, setExaminationPurpose] = useState("");
    const [additionalNotes, setAdditionalNotes] = useState("");

    // parameters (single select searchable dropdown)
    const [paramQuery, setParamQuery] = useState("");
    const [paramLoading, setParamLoading] = useState(false);
    const [paramItems, setParamItems] = useState<ParameterRow[]>([]);
    const [selectedParam, setSelectedParam] = useState<ParameterRow | null>(null);
    const [paramOpen, setParamOpen] = useState(false);
    const [paramError, setParamError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const boxRef = useRef<HTMLDivElement | null>(null);

    const { t } = useTranslation();

    const canSubmit = useMemo(() => {
        return (
            !!sampleType.trim() &&
            !!scheduledDeliveryAt.trim() &&
            !!examinationPurpose.trim() &&
            !!selectedParam?.parameter_id &&
            !submitting
        );
    }, [sampleType, scheduledDeliveryAt, examinationPurpose, selectedParam, submitting]);

    const loadParams = async (q?: string) => {
        try {
            setParamLoading(true);
            setParamError(null);

            // Portal should call scope:"client" so it hits /client/parameters
            const res = await listParameters({
                scope: "client",
                page: 1,
                per_page: 100,
                q: (q ?? "").trim() || undefined,
            });

            const rows = extractPaginatedRows<ParameterRow>(res);
            setParamItems(rows);
        } catch (err: any) {
            setParamItems([]);
            setParamError(getErrorMessage(err, t("portalRequestForm.errors.loadParams")));
        } finally {
            setParamLoading(false);
        }
    };

    // init / reset modal
    useEffect(() => {
        if (!open) return;

        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const v = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(
            now.getMinutes()
        )}`;

        setSampleType("");
        setScheduledDeliveryAt(v);
        setExaminationPurpose("");
        setAdditionalNotes("");

        setParamQuery("");
        setParamItems([]);
        setSelectedParam(null);
        setParamOpen(false);
        setParamError(null);

        setError(null);
        setSubmitting(false);

        loadParams("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // ESC close
    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    // lock body scroll
    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;
        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;
        return () => {
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
        };
    }, [open]);

    // close dropdown on outside click
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const el = boxRef.current;
            if (!el) return;
            if (!el.contains(e.target as Node)) setParamOpen(false);
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open]);

    // debounce search
    useEffect(() => {
        if (!open) return;
        if (!paramOpen) return;

        const t = window.setTimeout(() => {
            loadParams(paramQuery);
        }, 250);

        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramQuery, paramOpen, open]);

    const chooseParam = (p: ParameterRow) => {
        setSelectedParam(p);
        setParamQuery(parameterLabel(p));
        setParamOpen(false);
    };

    const clearParam = () => {
        setSelectedParam(null);
        setParamQuery("");
        setParamOpen(true);
        loadParams("");
    };

    const submit = async () => {
        if (!canSubmit) return;

        try {
            setSubmitting(true);
            setError(null);

            const payload: ClientSampleDraftPayload = {
                sample_type: sampleType.trim(),
                scheduled_delivery_at: datetimeLocalToApi(scheduledDeliveryAt),
                examination_purpose: examinationPurpose.trim(),
                additional_notes: additionalNotes.trim() || null,
                parameter_ids: [Number(selectedParam!.parameter_id)],
            };

            const created = await clientSampleRequestService.createDraft(payload);
            onClose();
            onCreated(created);
        } catch (err: unknown) {
            setError(getErrorMessage(err, t("portalRequestForm.errors.createFailed")));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onClose} aria-hidden="true" />

            <div
                className="relative w-[92vw] max-w-2xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-gray-50">
                    <div className="min-w-0">
                        <h2 className="text-sm font-bold text-gray-900">{t("portalRequestForm.title")}</h2>
                        <p className="text-xs text-gray-600 mt-1">{t("portalRequestForm.subtitle")}</p>
                    </div>

                    <button
                        type="button"
                        className={cx("lims-icon-button", submitting && "opacity-60 cursor-not-allowed")}
                        onClick={onClose}
                        aria-label={t("close")}
                        title={t("close")}
                        disabled={submitting}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {error ? (
                        <div className="text-sm text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                {t("portalRequestForm.fields.sampleType")} <span className="text-red-600">*</span>
                            </label>
                            <input
                                value={sampleType}
                                onChange={(e) => setSampleType(e.target.value)}
                                placeholder={t("portalRequestForm.placeholders.sampleType")}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                {t("portalRequestForm.fields.scheduledDelivery")} <span className="text-red-600">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                value={scheduledDeliveryAt}
                                onChange={(e) => setScheduledDeliveryAt(e.target.value)}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">
                                {t("portalRequestForm.helpers.scheduledDelivery")}
                            </div>
                        </div>

                        {/* PARAMETERS (single searchable dropdown) */}
                        <div className="md:col-span-2" ref={boxRef}>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                {t("portalRequestForm.fields.parameter")} <span className="text-red-600">*</span>
                            </label>

                            <div className="relative">
                                <input
                                    value={paramQuery}
                                    onChange={(e) => {
                                        setParamQuery(e.target.value);
                                        setSelectedParam(null);
                                        setParamOpen(true);
                                    }}
                                    onFocus={() => {
                                        setParamOpen(true);
                                        if (paramItems.length === 0) loadParams(paramQuery);
                                    }}
                                    placeholder={t("portalRequestForm.placeholders.parameter")}
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                />

                                {selectedParam ? (
                                    <button
                                        type="button"
                                        onClick={clearParam}
                                        disabled={submitting}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                    >
                                        {t("clear")}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => loadParams(paramQuery)}
                                        disabled={paramLoading || submitting}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                    >
                                        <Search size={14} />
                                        {paramLoading ? t("loading") : t("search")}
                                    </button>
                                )}

                                {paramOpen ? (
                                    <div className="absolute z-20 mt-2 w-full rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                                        {paramLoading ? (
                                            <div className="p-3 text-sm text-gray-600">{t("portalRequestForm.states.loadingParams")}</div>
                                        ) : paramError ? (
                                            <div className="p-3 text-sm text-red-800 bg-red-50 border-t border-red-100">
                                                {paramError}
                                            </div>
                                        ) : paramItems.length === 0 ? (
                                            <div className="p-3 text-sm text-gray-600">{t("portalRequestForm.states.noParams")}</div>
                                        ) : (
                                            <ul className="max-h-56 overflow-auto divide-y divide-gray-100">
                                                {paramItems.map((p) => {
                                                    const id = Number(p.parameter_id);
                                                    const label = parameterLabel(p);
                                                    const isSelected = selectedParam?.parameter_id === p.parameter_id;

                                                    return (
                                                        <li
                                                            key={id}
                                                            className={cx(
                                                                "p-3 hover:bg-gray-50 cursor-pointer",
                                                                isSelected && "bg-emerald-50/60"
                                                            )}
                                                            onClick={() => chooseParam(p)}
                                                        >
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="min-w-0">
                                                                    <div className="text-sm font-medium text-gray-900">
                                                                        {label}
                                                                    </div>
                                                                    <div className="text-xs text-gray-500 mt-0.5">
                                                                        {p.unit ? `Unit: ${p.unit}` : "Unit: —"}
                                                                    </div>
                                                                </div>

                                                                {isSelected ? (
                                                                    <span className="text-emerald-700 inline-flex items-center gap-1 text-xs font-semibold">
                                                                        <Check size={14} />
                                                                        {t("portalRequestForm.parameter.selected")}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                ) : null}
                            </div>

                            <div className="mt-2 text-[11px] text-gray-500">
                                Terpilih:{" "}
                                <span className="font-semibold text-gray-800">
                                    {selectedParam ? parameterLabel(selectedParam) : "—"}
                                </span>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Tujuan pemeriksaan <span className="text-red-600">*</span>
                            </label>
                            <textarea
                                value={examinationPurpose}
                                onChange={(e) => setExaminationPurpose(e.target.value)}
                                rows={2}
                                placeholder="Tulis tujuan pemeriksaan…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Catatan tambahan</label>
                            <textarea
                                value={additionalNotes}
                                onChange={(e) => setAdditionalNotes(e.target.value)}
                                rows={3}
                                placeholder="Opsional…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">{(additionalNotes?.length ?? 0)}/5000</div>
                        </div>
                    </div>
                </div>

                <div className="shrink-0 px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="btn-outline" onClick={onClose} disabled={submitting}>
                        {t("cancel")}
                    </button>
                    <button
                        type="button"
                        className={cx("lims-btn-primary", (!canSubmit || submitting) && "opacity-60 cursor-not-allowed")}
                        onClick={submit}
                        disabled={!canSubmit || submitting}
                    >
                        {submitting ? t("submitting") : t("portalRequestForm.actions.create")}
                    </button>
                </div>
            </div>
        </div>
    );
};
