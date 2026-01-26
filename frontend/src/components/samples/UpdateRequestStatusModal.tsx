import { useEffect, useMemo, useState } from "react";
import { apiPost } from "../../services/api";

type Props = {
    open: boolean;
    sampleId: number | null;
    action: "return" | "approve" | "received";
    currentStatus?: string | null;

    onClose: () => void;
    onUpdated: () => void;
};

type ApiError = {
    response?: { data?: any };
    data?: any;
    message?: string;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

const getErrorMessage = (err: unknown, fallback: string) => {
    const e = err as ApiError;
    const data = e?.response?.data ?? e?.data ?? undefined;

    const details = data?.details;
    if (details && typeof details === "object") {
        const firstKey = Object.keys(details)[0];
        const firstVal = firstKey ? details[firstKey] : undefined;
        if (Array.isArray(firstVal) && firstVal[0]) return String(firstVal[0]);
        if (typeof firstVal === "string" && firstVal) return String(firstVal);
    }

    return (
        data?.message ??
        data?.error ??
        (typeof (e as any)?.message === "string" ? (e as any).message : null) ??
        fallback
    );
};

export const UpdateRequestStatusModal = ({
    open,
    sampleId,
    action,
    currentStatus,
    onClose,
    onUpdated,
}: Props) => {
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const nextLabel = useMemo(() => {
        if (action === "return") return "returned";
        if (action === "approve") return "ready_for_delivery";
        return "physically_received";
    }, [action]);

    const title = useMemo(() => {
        if (action === "return") return "Return Request";
        if (action === "approve") return "Approve Request";
        return "Mark Physically Received";
    }, [action]);

    const subtitle = useMemo(() => {
        if (action === "return")
            return "Send this request back to the client for revision. A note/reason is required.";
        if (action === "approve")
            return "Approve this request and set status to ready_for_delivery.";
        return "Confirm the sample has been physically received by the lab (admin desk).";
    }, [action]);

    const noteLabel = useMemo(() => {
        if (action === "return") return "Return reason / note *";
        return "Optional note";
    }, [action]);

    const notePlaceholder = useMemo(() => {
        if (action === "return") return "Explain what needs to be revised (required)…";
        if (action === "approve") return "Optional note for internal record…";
        return "Optional note (e.g. received condition)…";
    }, [action]);

    const canSubmit = useMemo(() => {
        if (!sampleId) return false;
        if (submitting) return false;
        if (action === "return") return note.trim().length > 0;
        return true;
    }, [sampleId, submitting, action, note]);

    useEffect(() => {
        if (!open) return;
        setNote("");
        setError(null);
        setSubmitting(false);
    }, [open, action, sampleId]);

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    const submit = async () => {
        if (!canSubmit || !sampleId) return;

        try {
            setSubmitting(true);
            setError(null);

            // ✅ backend expects { action: "accept" | "return" | "received", note? }
            const payload =
                action === "approve"
                    ? { action: "accept", note: note.trim() || undefined }
                    : action === "return"
                        ? { action: "return", note: note.trim() }
                        : { action: "received", note: note.trim() || undefined };

            await apiPost<any>(`/v1/samples/${sampleId}/request-status`, payload);

            onClose();
            onUpdated();
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to update request status."));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

            {/* modal */}
            <div className="relative w-[92vw] max-w-lg rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
                        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
                        <div className="text-[11px] text-gray-500 mt-2">
                            <span className="font-semibold">Sample ID:</span>{" "}
                            <span className="font-mono">{sampleId ?? "-"}</span>
                            {" · "}
                            <span className="font-semibold">Current:</span>{" "}
                            <span className="font-mono">{currentStatus ?? "-"}</span>
                            {" · "}
                            <span className="font-semibold">Next:</span>{" "}
                            <span className="font-mono">{nextLabel}</span>
                        </div>
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

                <div className="px-6 py-5">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    <label className="block text-xs font-medium text-gray-600 mb-1">
                        {noteLabel}
                    </label>
                    <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={4}
                        placeholder={notePlaceholder}
                        className={cx(
                            "w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent",
                            action === "return" && note.trim().length === 0 ? "border-red-200" : ""
                        )}
                    />

                    {action === "return" && (
                        <div className="mt-2 text-[11px] text-gray-500">
                            Return requires a note so the client knows what to fix.
                        </div>
                    )}
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        className="lims-btn"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className={cx(
                            "lims-btn-primary",
                            action === "return" ? "bg-red-600 hover:bg-red-700" : ""
                        )}
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {submitting ? "Saving..." : "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
};
