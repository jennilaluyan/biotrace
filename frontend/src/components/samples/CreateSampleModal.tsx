import { useEffect, useMemo, useState } from "react";
import { sampleService, type ContactHistory } from "../../services/samples";
import type { Client } from "../../services/clients";

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    clients: Client[];
    clientsLoading?: boolean;
};

function toBackendDateTime(datetimeLocal: string) {
    // input: "YYYY-MM-DDTHH:mm" -> backend: "YYYY-MM-DD HH:mm:00"
    if (!datetimeLocal) return "";
    const [d, t] = datetimeLocal.split("T");
    if (!d || !t) return datetimeLocal;
    return `${d} ${t}:00`;
}

export const CreateSampleModal = ({
    open,
    onClose,
    onCreated,
    clients,
    clientsLoading = false,
}: Props) => {
    const [clientId, setClientId] = useState<string>("");
    const [receivedAt, setReceivedAt] = useState<string>("");
    const [sampleType, setSampleType] = useState<string>("");

    const [priority, setPriority] = useState<number>(1);
    const [contactHistory, setContactHistory] = useState<ContactHistory>(null);
    const [examinationPurpose, setExaminationPurpose] = useState<string>("");
    const [additionalNotes, setAdditionalNotes] = useState<string>("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canSubmit = useMemo(() => {
        return !!clientId && !!receivedAt && !!sampleType && !submitting;
    }, [clientId, receivedAt, sampleType, submitting]);

    useEffect(() => {
        if (!open) return;

        // default receivedAt -> now (datetime-local, without seconds)
        const now = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const v = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
            now.getDate()
        )}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

        setClientId("");
        setReceivedAt(v);
        setSampleType("");
        setPriority(1);
        setContactHistory(null);
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

    const submit = async () => {
        if (!canSubmit) return;

        try {
            setSubmitting(true);
            setError(null);

            await sampleService.create({
                client_id: Number(clientId),
                received_at: toBackendDateTime(receivedAt),
                sample_type: sampleType.trim(),
                priority,
                contact_history: contactHistory,
                examination_purpose: examinationPurpose.trim() || null,
                additional_notes: additionalNotes.trim() || null,
            });

            onClose();
            onCreated();
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Failed to create sample.";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* overlay */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* modal */}
            <div className="relative w-[92vw] max-w-2xl rounded-2xl bg-white shadow-xl border border-gray-100">
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">
                            Create New Sample
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Register sample entry (Admin only)
                        </p>
                    </div>

                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
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

                <div className="px-6 py-5">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* client */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Client <span className="text-red-600">*</span>
                            </label>
                            <select
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            >
                                <option value="">Select client…</option>
                                {clientsLoading ? (
                                    <option value="__loading__" disabled>
                                        Loading clients...
                                    </option>
                                ) : (
                                    (clients ?? []).map((c) => (
                                        <option key={c.client_id} value={String(c.client_id)}>
                                            {c.name}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* received_at */}
                        <div>
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

                        {/* priority */}
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Priority
                            </label>
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

                        {/* sample_type */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Sample type <span className="text-red-600">*</span>
                            </label>
                            <input
                                value={sampleType}
                                onChange={(e) => setSampleType(e.target.value)}
                                placeholder="e.g. Swab nasofaring, Covid test…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>

                        {/* contact_history */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Contact history
                            </label>
                            <select
                                value={contactHistory ?? ""}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setContactHistory(
                                        v === "" ? null : (v as ContactHistory)
                                    );
                                }}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            >
                                <option value="">Unknown</option>
                                <option value="ada">Ada</option>
                                <option value="tidak">Tidak</option>
                                <option value="tidak_tahu">Tidak tahu</option>
                            </select>
                        </div>

                        {/* examination_purpose */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Examination purpose
                            </label>
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
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                                Additional notes
                            </label>
                            <textarea
                                value={additionalNotes}
                                onChange={(e) => setAdditionalNotes(e.target.value)}
                                rows={3}
                                placeholder="Additional notes…"
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                            <div className="mt-1 text-[11px] text-gray-500">
                                {(additionalNotes?.length ?? 0)}/500
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        className="px-5 py-2 rounded-full border text-sm hover:bg-gray-50"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary"
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {submitting ? "Creating..." : "Create Sample"}
                    </button>
                </div>
            </div>
        </div>
    );
};
