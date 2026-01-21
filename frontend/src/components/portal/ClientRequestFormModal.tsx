import { useEffect, useMemo, useState } from "react";
import { clientSampleRequestService, type ClientSampleDraftPayload } from "../../services/sampleRequests";
import type { Sample } from "../../services/samples";

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
};

const getErrorMessage = (err: unknown, fallback: string) => {
    const e = err as ApiError;
    const details = e?.data?.details;

    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstVal = firstKey ? details[firstKey] : undefined;

        if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
        if (typeof firstVal === "string" && firstVal) return firstVal;
    }

    return e?.data?.message ?? e?.data?.error ?? fallback;
};

// keep compatible with backend (ISO)
function toISO(datetimeLocal: string) {
    if (!datetimeLocal) return null;
    const d = new Date(datetimeLocal);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

export const ClientRequestFormModal = ({ open, onClose, onCreated }: Props) => {
    const [sampleType, setSampleType] = useState<string>("");
    const [receivedAt, setReceivedAt] = useState<string>("");

    const [priority, setPriority] = useState<number>(1);
    const [contactHistory, setContactHistory] = useState<string>("Unknown");

    const [title, setTitle] = useState<string>("");
    const [examinationPurpose, setExaminationPurpose] = useState<string>("");
    const [additionalNotes, setAdditionalNotes] = useState<string>("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = useMemo(() => {
        // ✅ Fix: jangan gate pake checkbox consent. Spek step 3 ga minta itu.
        return !!sampleType.trim() && !submitting;
    }, [sampleType, submitting]);

    useEffect(() => {
        if (!open) return;

        // default receivedAt -> now (datetime-local, without seconds)
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const v = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
            now.getHours()
        )}:${pad(now.getMinutes())}`;

        setSampleType("");
        setReceivedAt(v);
        setPriority(1);
        setContactHistory("Unknown");
        setTitle("");
        setExaminationPurpose("");
        setAdditionalNotes("");

        setError(null);
        setSubmitting(false);
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    // lock background scroll
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

    const submit = async () => {
        if (!canSubmit) return;

        try {
            setSubmitting(true);
            setError(null);

            const payload: ClientSampleDraftPayload = {
                sample_type: sampleType.trim(),
                received_at: receivedAt ? toISO(receivedAt) : null,
                priority,
                contact_history: (contactHistory || "Unknown") as any,
                examination_purpose: examinationPurpose.trim() || null,
                additional_notes: additionalNotes.trim() || null,
                title: title.trim() || null,
                name: title.trim() || null,
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
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            {/* modal */}
            <div className="relative w-[92vw] max-w-2xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
                {/* header */}
                <div className="shrink-0 flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Create New Sample Request</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            This creates a draft request. Lab admin will review before it becomes an official sample.
                        </p>
                    </div>

                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
                        disabled={submitting}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M18 6L6 18" />
                            <path d="M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* body */}
                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* sample_type */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Sample type <span className="text-red-600">*</span>
                            </label>
                            <input
                                value={sampleType}
                                onChange={(e) => setSampleType(e.target.value)}
                                placeholder="e.g. Swab nasofaring, Blood, Tissue…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        {/* received_at */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Received at</label>
                            <input
                                type="datetime-local"
                                value={receivedAt}
                                onChange={(e) => setReceivedAt(e.target.value)}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">
                                Optional: when the physical sample is ready. Admin may revise during intake.
                            </div>
                        </div>

                        {/* priority */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                            <select
                                value={priority}
                                onChange={(e) => setPriority(Number(e.target.value))}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            >
                                <option value={1}>1 (Normal)</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                                <option value={4}>4</option>
                                <option value={5}>5 (Urgent)</option>
                            </select>
                        </div>

                        {/* title */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Title / Name</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Water sample from Site A"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        {/* contact_history */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Contact history</label>
                            <select
                                value={contactHistory}
                                onChange={(e) => setContactHistory(e.target.value)}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            >
                                <option value="Unknown">Unknown</option>
                                <option value="ada">Ada</option>
                                <option value="tidak">Tidak</option>
                                <option value="tidak_tahu">Tidak tahu</option>
                            </select>
                        </div>

                        {/* examination_purpose */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">Examination purpose</label>
                            <textarea
                                value={examinationPurpose}
                                onChange={(e) => setExaminationPurpose(e.target.value)}
                                rows={2}
                                placeholder="Purpose / diagnosis request…"
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
                                placeholder="Additional notes…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">{(additionalNotes?.length ?? 0)}/500</div>
                        </div>
                    </div>
                </div>

                {/* footer */}
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
