import { useEffect, useMemo, useRef, useState } from "react";
import { clientSampleRequestService, type ClientSampleDraftPayload } from "../../services/sampleRequests";
import type { Sample } from "../../services/samples";
import { listParameters, type ParameterRow } from "../../services/parameters";

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
    // Supports multiple shapes:
    // 1) { data: { data: [] } }
    // 2) { data: [] }
    // 3) { status, data: { data: [] } }
    // 4) axios-like: { data: { status, data: { data: [] } } }
    const root = res?.data ?? res;

    // axios wrapper
    const maybeEnvelope = root?.data && typeof root === "object" && "status" in root && "data" in root ? root : root;

    // envelope.data could be paginated or array
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

            // IMPORTANT:
            // Portal should call scope:"client" so it hits /client/parameters
            // (backend route must exist)
            const res = await listParameters({
                scope: "client",
                page: 1,
                per_page: 30,
                q: (q ?? "").trim() || undefined,
            });

            const rows = extractPaginatedRows<ParameterRow>(res);
            setParamItems(rows);
        } catch (err: any) {
            setParamItems([]);
            setParamError(getErrorMessage(err, "Failed to load parameters."));
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
                examination_purpose: examinationPurpose.trim(), // REQUIRED (C/E)
                additional_notes: additionalNotes.trim() || null,
                parameter_ids: [Number(selectedParam!.parameter_id)], // single select, send as array for compatibility
            };

            const created = await clientSampleRequestService.createDraft(payload);
            onClose();
            onCreated(created);
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to create request."));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            <div className="relative w-[92vw] max-w-2xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
                <div className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Create New Sample Request</h2>
                        <p className="text-xs text-gray-500 mt-1">Draft → complete required fields → submit. Admin will review it.</p>
                    </div>

                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
                        disabled={submitting}
                    >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18" />
                            <path d="M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {error && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Sample type <span className="text-red-600">*</span>
                            </label>
                            <input
                                value={sampleType}
                                onChange={(e) => setSampleType(e.target.value)}
                                placeholder="e.g. Swab, Blood, Water…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Scheduled delivery to lab <span className="text-red-600">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                value={scheduledDeliveryAt}
                                onChange={(e) => setScheduledDeliveryAt(e.target.value)}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">
                                Isi waktu rencana kamu antar sampel ke lab (bukan waktu lab menerima).
                            </div>
                        </div>

                        {/* PARAMETERS (single searchable dropdown) */}
                        <div className="md:col-span-2" ref={boxRef}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Test parameter <span className="text-red-600">*</span>
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
                                    placeholder="Search and select parameter…"
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                />

                                {selectedParam ? (
                                    <button
                                        type="button"
                                        onClick={clearParam}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                    >
                                        Clear
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => loadParams(paramQuery)}
                                        disabled={paramLoading}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                                    >
                                        {paramLoading ? "…" : "Search"}
                                    </button>
                                )}

                                {paramOpen && (
                                    <div className="absolute z-20 mt-2 w-full rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                                        {paramLoading ? (
                                            <div className="p-3 text-sm text-gray-600">Loading…</div>
                                        ) : paramError ? (
                                            <div className="p-3 text-sm text-red-600 bg-red-50">{paramError}</div>
                                        ) : paramItems.length === 0 ? (
                                            <div className="p-3 text-sm text-gray-600">No parameters found.</div>
                                        ) : (
                                            <ul className="max-h-56 overflow-auto divide-y divide-gray-100">
                                                {paramItems.map((p) => {
                                                    const id = Number(p.parameter_id);
                                                    return (
                                                        <li
                                                            key={id}
                                                            className="p-3 hover:bg-gray-50 cursor-pointer"
                                                            onClick={() => chooseParam(p)}
                                                        >
                                                            <div className="text-sm font-medium text-gray-900">
                                                                {parameterLabel(p)}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {p.unit ? `Unit: ${p.unit}` : ""}
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="mt-2 text-[11px] text-gray-500">
                                Selected:{" "}
                                <span className="font-semibold text-gray-800">
                                    {selectedParam ? parameterLabel(selectedParam) : "—"}
                                </span>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Examination purpose <span className="text-red-600">*</span>
                            </label>
                            <textarea
                                value={examinationPurpose}
                                onChange={(e) => setExaminationPurpose(e.target.value)}
                                rows={2}
                                placeholder="Write purpose…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Additional notes</label>
                            <textarea
                                value={additionalNotes}
                                onChange={(e) => setAdditionalNotes(e.target.value)}
                                rows={3}
                                placeholder="Optional notes…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">{(additionalNotes?.length ?? 0)}/5000</div>
                        </div>
                    </div>
                </div>

                <div className="shrink-0 px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3 bg-white">
                    <button type="button" className="lims-btn" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button type="button" className="lims-btn-primary" onClick={submit} disabled={!canSubmit}>
                        {submitting ? "Creating..." : "Create request"}
                    </button>
                </div>
            </div>
        </div>
    );
};
