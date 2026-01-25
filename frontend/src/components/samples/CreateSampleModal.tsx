import { useEffect, useMemo, useRef, useState } from "react";
import { sampleService } from "../../services/samples";
import type { Client } from "../../services/clients";
import { listParameters, type ParameterRow } from "../../services/parameters";
import { datetimeLocalToApi, nowDatetimeLocal } from "../../utils/date";

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    clients: Client[];
    clientsLoading?: boolean;
};

function extractPaginatedRows<T>(res: any): T[] {
    const root = res?.data ?? res;
    const d = root?.data ?? root;
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

export const CreateSampleModal = ({
    open,
    onClose,
    onCreated,
    clients,
    clientsLoading = false,
}: Props) => {
    // client searchable dropdown
    const [clientQuery, setClientQuery] = useState("");
    const [clientOpen, setClientOpen] = useState(false);
    const [clientId, setClientId] = useState<number | null>(null);

    const [receivedAt, setReceivedAt] = useState<string>("");
    const [sampleType, setSampleType] = useState<string>("");

    const [examinationPurpose, setExaminationPurpose] = useState<string>("");
    const [additionalNotes, setAdditionalNotes] = useState<string>("");

    // parameters searchable dropdown (single select)
    const [paramQuery, setParamQuery] = useState("");
    const [paramOpen, setParamOpen] = useState(false);
    const [paramLoading, setParamLoading] = useState(false);
    const [paramItems, setParamItems] = useState<ParameterRow[]>([]);
    const [selectedParam, setSelectedParam] = useState<ParameterRow | null>(null);
    const [paramError, setParamError] = useState<string | null>(null);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const clientBoxRef = useRef<HTMLDivElement | null>(null);
    const paramBoxRef = useRef<HTMLDivElement | null>(null);

    const filteredClients = useMemo(() => {
        const term = clientQuery.trim().toLowerCase();
        if (!term) return clients ?? [];
        return (clients ?? []).filter((c) => {
            const hay = [c.name, c.email, c.phone, String(c.client_id)].filter(Boolean).join(" ").toLowerCase();
            return hay.includes(term);
        });
    }, [clients, clientQuery]);

    const canSubmit = useMemo(() => {
        return (
            !!clientId &&
            !!receivedAt &&
            !!sampleType.trim() &&
            !!examinationPurpose.trim() &&
            !!selectedParam?.parameter_id &&
            !submitting
        );
    }, [clientId, receivedAt, sampleType, examinationPurpose, selectedParam, submitting]);

    const loadParams = async (q?: string) => {
        try {
            setParamLoading(true);
            setParamError(null);
            const res = await listParameters({ scope: "staff", page: 1, per_page: 50, q: (q ?? "").trim() || undefined });
            const rows = extractPaginatedRows<ParameterRow>(res);
            setParamItems(rows);
        } catch (err: any) {
            setParamItems([]);
            setParamError(err?.data?.message ?? err?.data?.error ?? "Failed to load parameters.");
        } finally {
            setParamLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;

        setClientQuery("");
        setClientOpen(false);
        setClientId(null);

        setReceivedAt(nowDatetimeLocal());
        setSampleType("");
        setExaminationPurpose("");
        setAdditionalNotes("");

        setParamQuery("");
        setParamOpen(false);
        setParamItems([]);
        setSelectedParam(null);
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

    // outside click close dropdowns
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;

            if (clientBoxRef.current && !clientBoxRef.current.contains(t)) setClientOpen(false);
            if (paramBoxRef.current && !paramBoxRef.current.contains(t)) setParamOpen(false);
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open]);

    // debounce param search
    useEffect(() => {
        if (!open) return;
        if (!paramOpen) return;

        const t = window.setTimeout(() => {
            loadParams(paramQuery);
        }, 250);

        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paramQuery, paramOpen, open]);

    const chooseClient = (c: Client) => {
        setClientId(Number(c.client_id));
        setClientQuery(`${c.name}${c.email ? ` (${c.email})` : ""}`);
        setClientOpen(false);
    };

    const clearClient = () => {
        setClientId(null);
        setClientQuery("");
        setClientOpen(true);
    };

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

            const payload = {
                client_id: Number(clientId),
                received_at: datetimeLocalToApi(receivedAt),
                sample_type: sampleType.trim(),
                examination_purpose: examinationPurpose.trim(), // REQUIRED (D)
                additional_notes: additionalNotes.trim() || null,
                parameter_ids: [Number(selectedParam!.parameter_id)], // single select
            };

            await sampleService.create(payload as any);
            onClose();
            onCreated();
        } catch (err: any) {
            const msg = err?.data?.message ?? err?.data?.error ?? "Failed to create sample.";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            <div className="relative w-[92vw] max-w-2xl rounded-2xl bg-white shadow-xl border border-gray-100">
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Create New Sample</h2>
                        <p className="text-xs text-gray-500 mt-1">Admin: register physical sample + required fields</p>
                    </div>

                    <button type="button" className="text-gray-500 hover:text-gray-700" onClick={onClose} aria-label="Close">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6L6 18" />
                            <path d="M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-6 py-5">
                    {error && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Client searchable dropdown */}
                        <div className="md:col-span-2" ref={clientBoxRef}>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Client <span className="text-red-600">*</span>
                            </label>

                            <div className="relative">
                                <input
                                    value={clientQuery}
                                    onChange={(e) => {
                                        setClientQuery(e.target.value);
                                        setClientId(null);
                                        setClientOpen(true);
                                    }}
                                    onFocus={() => setClientOpen(true)}
                                    placeholder={clientsLoading ? "Loading clients…" : "Search and select client…"}
                                    disabled={clientsLoading}
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:opacity-60"
                                />

                                {clientId ? (
                                    <button
                                        type="button"
                                        onClick={clearClient}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                    >
                                        Clear
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setClientOpen(true)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                                    >
                                        Select
                                    </button>
                                )}

                                {clientOpen && !clientsLoading && (
                                    <div className="absolute z-20 mt-2 w-full rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden">
                                        {filteredClients.length === 0 ? (
                                            <div className="p-3 text-sm text-gray-600">No clients found.</div>
                                        ) : (
                                            <ul className="max-h-56 overflow-auto divide-y divide-gray-100">
                                                {filteredClients.slice(0, 50).map((c) => (
                                                    <li
                                                        key={c.client_id}
                                                        className="p-3 hover:bg-gray-50 cursor-pointer"
                                                        onClick={() => chooseClient(c)}
                                                    >
                                                        <div className="text-sm font-medium text-gray-900">
                                                            {c.name}{" "}
                                                            <span className="text-xs text-gray-500">
                                                                #{c.client_id}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {[c.email, c.phone].filter(Boolean).join(" • ")}
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="mt-2 text-[11px] text-gray-500">
                                Selected:{" "}
                                <span className="font-semibold text-gray-800">
                                    {clientId ? `Client #${clientId}` : "—"}
                                </span>
                            </div>
                        </div>

                        {/* received_at */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Received at <span className="text-red-600">*</span>
                            </label>
                            <input
                                type="datetime-local"
                                value={receivedAt}
                                onChange={(e) => setReceivedAt(e.target.value)}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        {/* sample_type */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Sample type <span className="text-red-600">*</span>
                            </label>
                            <input
                                value={sampleType}
                                onChange={(e) => setSampleType(e.target.value)}
                                placeholder="e.g. Blood, Urine, Water…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        {/* parameter searchable dropdown */}
                        <div className="md:col-span-2" ref={paramBoxRef}>
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
                                                {paramItems.map((p) => (
                                                    <li
                                                        key={Number(p.parameter_id)}
                                                        className="p-3 hover:bg-gray-50 cursor-pointer"
                                                        onClick={() => chooseParam(p)}
                                                    >
                                                        <div className="text-sm font-medium text-gray-900">{parameterLabel(p)}</div>
                                                        <div className="text-xs text-gray-500">{p.unit ? `Unit: ${p.unit}` : ""}</div>
                                                    </li>
                                                ))}
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

                        {/* examination_purpose */}
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

                        {/* additional_notes */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Additional notes</label>
                            <textarea
                                value={additionalNotes}
                                onChange={(e) => setAdditionalNotes(e.target.value)}
                                rows={3}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">{(additionalNotes?.length ?? 0)}/5000</div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button type="button" className="px-5 py-2 rounded-full border text-sm hover:bg-gray-50" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button type="button" className="lims-btn-primary" onClick={submit} disabled={!canSubmit}>
                        {submitting ? "Creating..." : "Create Sample"}
                    </button>
                </div>
            </div>
        </div>
    );
};
