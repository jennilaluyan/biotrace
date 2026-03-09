import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";

import type { Sample } from "../../services/samples";
import { assignSampleId, getLatestSampleIdChangeBySampleId } from "../../services/sampleIdChanges";
import { getErrorMessage } from "../../utils/errors";
import type { DonePayload } from "./AssignSampleIdModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function pad3(n: number) {
    return String(n).padStart(3, "0");
}

type NormalizeResult =
    | { ok: true; normalized: string; prefix: string; number: number; error: null }
    | { ok: false; normalized: string; prefix: string; number: 0; error: string };

function normalizeSampleId(raw: string): NormalizeResult {
    const value = String(raw ?? "").trim().toUpperCase();

    if (!value) {
        return { ok: false, normalized: "", prefix: "", number: 0, error: "Sample ID is required." };
    }

    const match = value.match(/^([A-Z]{1,5})\s*[- ]?\s*(\d{1,6})$/);
    if (!match) {
        return {
            ok: false,
            normalized: value,
            prefix: "",
            number: 0,
            error: "Format must be: PREFIX 001 (uppercase letters, max 5-letter prefix, space, number).",
        };
    }

    const prefix = match[1];
    const number = Number(match[2]);

    if (!Number.isFinite(number) || number <= 0) {
        return { ok: false, normalized: value, prefix, number: 0, error: "Number must be greater than 0." };
    }

    return {
        ok: true,
        normalized: `${prefix} ${pad3(number)}`,
        prefix,
        number,
        error: null,
    };
}

function prettySampleId(raw?: string | null) {
    if (!raw) return "—";
    const normalized = normalizeSampleId(String(raw));
    return normalized.ok ? normalized.normalized : String(raw);
}

type Props = {
    open: boolean;
    sample: Sample | null;
    onClose: () => void;
    onDone: (payload: DonePayload) => void;
};

function getFocusable(container: HTMLElement | null) {
    if (!container) return [];

    return Array.from(
        container.querySelectorAll<HTMLElement>(
            'a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
    ).filter((el) => {
        const isDisabled =
            (el as any).disabled === true ||
            el.getAttribute("aria-disabled") === "true" ||
            el.getAttribute("disabled") !== null;
        const isHidden = el.getAttribute("aria-hidden") === "true";

        return !isDisabled && !isHidden && el.tabIndex >= 0;
    });
}

function pickApprovedProposedFromSample(sample: Sample | null): string | null {
    const changeObj =
        (sample as any)?.sample_id_change ??
        (sample as any)?.sample_id_change_request ??
        (sample as any)?.sampleIdChange ??
        null;

    const changeStatus = String(
        changeObj?.status ?? (sample as any)?.sample_id_change_status ?? (sample as any)?.sample_id_change_state ?? ""
    )
        .trim()
        .toLowerCase();

    if (changeStatus !== "approved") return null;

    const value =
        changeObj?.proposed_lab_sample_code ??
        changeObj?.proposed_sample_id ??
        (sample as any)?.proposed_lab_sample_code ??
        (sample as any)?.proposed_sample_id ??
        null;

    return value ? String(value).trim() : null;
}

function pickSuggestedFromSample(sample: Sample | null): string | null {
    const changeObj =
        (sample as any)?.sample_id_change ??
        (sample as any)?.sample_id_change_request ??
        (sample as any)?.sampleIdChange ??
        null;

    const value =
        (sample as any)?.suggested_lab_sample_code ??
        (sample as any)?.suggested_sample_id ??
        changeObj?.suggested_lab_sample_code ??
        changeObj?.suggested_sample_id ??
        null;

    return value ? String(value).trim() : null;
}

export default function FinalizeApprovedSampleIdModal({ open, sample, onClose, onDone }: Props) {
    const sampleId = Number((sample as any)?.sample_id ?? (sample as any)?.id ?? 0);

    const requestStatusKey = String((sample as any)?.request_status ?? "")
        .trim()
        .toLowerCase();

    const isApprovedState =
        requestStatusKey === "sample_id_approved_for_assignment" || requestStatusKey === "approved_for_assignment";

    const clientName =
        (sample as any)?.client?.name ??
        (sample as any)?.client_name ??
        ((sample as any)?.client_id ? `Client #${(sample as any)?.client_id}` : "—");

    const workflowGroup = (sample as any)?.workflow_group ?? (sample as any)?.workflowGroup ?? "—";

    const activeBatchTotal = Number(
        (sample as any)?.batch_summary?.batch_active_total ?? (sample as any)?.request_batch_total ?? 1
    );
    const canApplyToBatch = !!(sample as any)?.request_batch_id && activeBatchTotal > 1;

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [suggested, setSuggested] = useState<string | null>(null);
    const [approvedProposed, setApprovedProposed] = useState<string | null>(null);
    const [applyToBatch, setApplyToBatch] = useState(canApplyToBatch);

    const dialogRef = useRef<HTMLDivElement | null>(null);
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const lastActiveRef = useRef<HTMLElement | null>(null);

    const titleId = "finalize-approved-sampleid-title";

    useEffect(() => {
        if (!open) return;
        setApplyToBatch(canApplyToBatch);
    }, [open, canApplyToBatch]);

    useEffect(() => {
        if (!open) return;

        lastActiveRef.current = (document.activeElement as HTMLElement) ?? null;
        const timer = window.setTimeout(() => cancelRef.current?.focus(), 0);

        return () => {
            window.clearTimeout(timer);
            lastActiveRef.current?.focus?.();
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!busy) onClose();
                return;
            }

            if (e.key !== "Tab") return;

            const focusables = getFocusable(dialogRef.current);
            if (!focusables.length) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (!active || !dialogRef.current?.contains(active)) {
                e.preventDefault();
                first.focus();
                return;
            }

            if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
                return;
            }

            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, busy, onClose]);

    useEffect(() => {
        if (!open) return;

        const previousOverflow = document.body.style.overflow;
        const previousPaddingRight = document.body.style.paddingRight;
        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

        document.body.style.overflow = "hidden";
        if (scrollBarWidth > 0) {
            document.body.style.paddingRight = `${scrollBarWidth}px`;
        }

        return () => {
            document.body.style.overflow = previousOverflow;
            document.body.style.paddingRight = previousPaddingRight;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const suggestedFromSample = pickSuggestedFromSample(sample);
        const approvedFromSample = pickApprovedProposedFromSample(sample);

        setError(null);
        setSuggested(suggestedFromSample);
        setApprovedProposed(approvedFromSample);

        if (!isApprovedState || approvedFromSample) return;
        if (!Number.isFinite(sampleId) || sampleId <= 0) return;

        let cancelled = false;

        (async () => {
            try {
                setBusy(true);

                const row = await getLatestSampleIdChangeBySampleId(sampleId, "APPROVED");
                if (cancelled) return;

                const proposed =
                    row?.proposed_lab_sample_code ?? row?.proposed_sample_id ?? (row as any)?.proposed ?? null;
                const suggestedValue =
                    row?.suggested_lab_sample_code ?? row?.suggested_sample_id ?? (row as any)?.suggested ?? null;

                if (suggestedValue && !suggestedFromSample) {
                    setSuggested(String(suggestedValue));
                }

                if (proposed) {
                    setApprovedProposed(String(proposed));
                }
            } catch (err: any) {
                if (!cancelled) {
                    setError(getErrorMessage(err, "Failed to load approved Sample ID."));
                }
            } finally {
                if (!cancelled) {
                    setBusy(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, sample, sampleId, isApprovedState]);

    const approvedNormalized = useMemo(() => {
        if (!approvedProposed) return null;
        const normalized = normalizeSampleId(approvedProposed);
        return normalized.ok ? normalized.normalized : String(approvedProposed).trim().toUpperCase();
    }, [approvedProposed]);

    const suggestedNormalized = useMemo(() => {
        if (!suggested) return null;
        const normalized = normalizeSampleId(suggested);
        return normalized.ok ? normalized.normalized : String(suggested).trim().toUpperCase();
    }, [suggested]);

    const canSubmit =
        open && !busy && isApprovedState && !!approvedNormalized && Number.isFinite(sampleId) && sampleId > 0;

    async function finalize() {
        if (!canSubmit || !approvedNormalized) return;

        setBusy(true);
        setError(null);

        try {
            await assignSampleId(sampleId, approvedNormalized, applyToBatch);

            onDone({
                type: "success",
                message: applyToBatch
                    ? "Institutional batch Sample ID assignment completed."
                    : `Sample ID assigned: ${approvedNormalized}.`,
            });
            onClose();
        } catch (err: any) {
            const message = getErrorMessage(err, "Failed to assign approved Sample ID.");
            setError(message);
            onDone({ type: "error", message });
        } finally {
            setBusy(false);
        }
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div
                className="absolute inset-0 bg-black/40"
                onClick={() => (busy ? null : onClose())}
                aria-hidden="true"
            />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl"
            >
                <div className="border-b border-gray-100 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div id={titleId} className="text-lg font-semibold text-gray-900">
                                Finalize approved Sample ID
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                                Request #{(sample as any)?.sample_id ?? "—"} • {clientName} • {workflowGroup}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className={cx("lims-icon-button", busy && "cursor-not-allowed opacity-60")}
                            aria-label="Close"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="space-y-4 px-5 py-4">
                    {!isApprovedState ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            This screen is only for requests in the <span className="font-semibold">approved</span> state.
                        </div>
                    ) : null}

                    {error ? (
                        <div
                            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
                            role="alert"
                        >
                            {error}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        OM/LH has approved a Sample ID change. Admin can only{" "}
                        <span className="font-semibold">finalize</span> the approved code.
                    </div>

                    {canApplyToBatch ? (
                        <label className="mt-4 flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={applyToBatch}
                                onChange={(e) => setApplyToBatch(e.target.checked)}
                                disabled={busy}
                            />
                            <div>
                                <div className="text-sm font-semibold text-sky-900">
                                    Apply final assignment to institutional batch
                                </div>
                                <div className="mt-1 text-xs text-sky-700">
                                    Sequential sample IDs will be assigned to all active samples in this batch (
                                    {activeBatchTotal}).
                                </div>
                            </div>
                        </label>
                    ) : null}

                    <div className="rounded-xl border border-gray-100 px-4 py-3">
                        <div className="text-xs text-gray-500">Approved Sample ID (will be assigned)</div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="font-mono text-lg font-semibold text-gray-900">
                                {prettySampleId(approvedNormalized)}
                            </div>

                            <button
                                type="button"
                                className={cx("lims-icon-button", !approvedNormalized && "cursor-not-allowed opacity-40")}
                                disabled={!approvedNormalized || busy}
                                onClick={async () => {
                                    if (!approvedNormalized) return;
                                    try {
                                        await navigator.clipboard.writeText(approvedNormalized);
                                    } catch {
                                        return;
                                    }
                                }}
                                aria-label="Copy approved"
                                title="Copy approved"
                            >
                                <Copy size={16} />
                            </button>
                        </div>

                        {busy && !approvedNormalized ? (
                            <div className="mt-3 inline-flex items-center gap-2 text-xs text-gray-500">
                                <Loader2 size={14} className="animate-spin" />
                                Loading approved code…
                            </div>
                        ) : null}

                        {suggestedNormalized ? (
                            <div className="mt-3 text-xs text-gray-600">
                                Suggested (system): <span className="font-mono">{prettySampleId(suggestedNormalized)}</span>
                                {approvedNormalized && suggestedNormalized !== approvedNormalized ? (
                                    <span className="text-gray-500"> • overridden via approval</span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>

                    {!approvedNormalized ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            Approved Sample ID not found. Make sure{" "}
                            <span className="font-mono">/by-sample/:id?status=APPROVED</span> returns the proposed ID.
                        </div>
                    ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-white px-5 py-4">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className={cx("lims-btn", busy && "cursor-not-allowed opacity-60")}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={finalize}
                        className={cx(
                            "lims-btn-primary inline-flex items-center gap-2",
                            !canSubmit && "cursor-not-allowed opacity-60"
                        )}
                    >
                        <Check size={16} />
                        {busy ? "Assigning…" : "Assign approved ID"}
                    </button>
                </div>
            </div>
        </div>
    );
}