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
    const s0 = String(raw ?? "").trim().toUpperCase();
    if (!s0) {
        return { ok: false, normalized: "", prefix: "", number: 0, error: "Sample ID is required." };
    }

    const m = s0.match(/^([A-Z]{1,5})\s*[- ]?\s*(\d{1,6})$/);
    if (!m) {
        return {
            ok: false,
            normalized: s0,
            prefix: "",
            number: 0,
            error: "Format must be: PREFIX 001 (uppercase letters, max 5-letter prefix, space, number).",
        };
    }

    const prefix = m[1];
    const num = Number(m[2]);

    if (!Number.isFinite(num) || num <= 0) {
        return { ok: false, normalized: s0, prefix, number: 0, error: "Number must be greater than 0." };
    }

    const normalized = `${prefix} ${pad3(num)}`;
    return { ok: true, normalized, prefix, number: num, error: null };
}

function prettySampleId(raw?: string | null) {
    if (!raw) return "—";
    const v = normalizeSampleId(String(raw));
    return v.ok ? v.normalized : String(raw);
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

/**
 * Finalize modal khusus untuk kondisi:
 * request_status === sample_id_approved_for_assignment
 *
 * Admin TIDAK bisa propose lagi.
 * Modal hanya recheck bahwa final Sample ID = proposed yg sudah di-approve OM/LH.
 */
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

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [suggested, setSuggested] = useState<string | null>(null);
    const [approvedProposed, setApprovedProposed] = useState<string | null>(null);

    const dialogRef = useRef<HTMLDivElement | null>(null);
    const cancelRef = useRef<HTMLButtonElement | null>(null);
    const lastActiveRef = useRef<HTMLElement | null>(null);

    const titleId = "finalize-approved-sampleid-title";

    // best-effort pick dari sample response (kalau backend sudah inject)
    function pickApprovedProposedFromSample(): string | null {
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

        const v =
            changeObj?.proposed_lab_sample_code ??
            changeObj?.proposed_sample_id ??
            (sample as any)?.proposed_lab_sample_code ??
            (sample as any)?.proposed_sample_id ??
            null;

        return v ? String(v).trim() : null;
    }

    function pickSuggestedFromSample(): string | null {
        const changeObj =
            (sample as any)?.sample_id_change ??
            (sample as any)?.sample_id_change_request ??
            (sample as any)?.sampleIdChange ??
            null;

        const v =
            (sample as any)?.suggested_lab_sample_code ??
            (sample as any)?.suggested_sample_id ??
            changeObj?.suggested_lab_sample_code ??
            changeObj?.suggested_sample_id ??
            null;

        return v ? String(v).trim() : null;
    }

    // focus management + restore focus
    useEffect(() => {
        if (!open) return;

        lastActiveRef.current = (document.activeElement as HTMLElement) ?? null;
        const t = window.setTimeout(() => cancelRef.current?.focus(), 0);

        return () => {
            window.clearTimeout(t);
            lastActiveRef.current?.focus?.();
        };
    }, [open]);

    // keyboard: ESC + focus trap
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

    useEffect(() => {
        if (!open) return;

        setErr(null);

        // seed suggested + approved dari sample (kalau ada)
        setSuggested(pickSuggestedFromSample());
        setApprovedProposed(pickApprovedProposedFromSample());

        // kalau statusnya bukan approved state, jangan lanjut fetch (modal ini memang khusus approved)
        if (!isApprovedState) return;

        // jika sudah ada approved proposed dari sample, tidak perlu fetch lagi
        const already = pickApprovedProposedFromSample();
        if (already) return;

        if (!Number.isFinite(sampleId) || sampleId <= 0) return;

        (async () => {
            try {
                setBusy(true);

                // ✅ ambil APPROVED request terbaru untuk sample ini
                const row = await getLatestSampleIdChangeBySampleId(sampleId, "APPROVED");

                const proposed = row?.proposed_lab_sample_code ?? row?.proposed_sample_id ?? (row as any)?.proposed ?? null;
                const sug = row?.suggested_lab_sample_code ?? row?.suggested_sample_id ?? (row as any)?.suggested ?? null;

                if (sug && !suggested) setSuggested(String(sug));
                if (proposed) setApprovedProposed(String(proposed));
            } catch (e: any) {
                // jangan hard-fail; tampilkan error banner
                setErr(getErrorMessage(e, "Failed to load approved Sample ID."));
            } finally {
                setBusy(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sampleId, isApprovedState]);

    const approvedNormalized = useMemo(() => {
        if (!approvedProposed) return null;
        const v = normalizeSampleId(approvedProposed);
        return v.ok ? v.normalized : String(approvedProposed).trim().toUpperCase();
    }, [approvedProposed]);

    const suggestedNormalized = useMemo(() => {
        if (!suggested) return null;
        const v = normalizeSampleId(suggested);
        return v.ok ? v.normalized : String(suggested).trim().toUpperCase();
    }, [suggested]);

    const canSubmit =
        open && !busy && isApprovedState && !!approvedNormalized && Number.isFinite(sampleId) && sampleId > 0;

    async function finalize() {
        if (!canSubmit || !approvedNormalized) return;

        setBusy(true);
        setErr(null);

        try {
            // ✅ explicit: finalize memakai approved proposed code
            await assignSampleId(sampleId, approvedNormalized);

            onDone({ type: "success", message: `Sample ID assigned: ${approvedNormalized}.` });
            onClose();
        } catch (e: any) {
            const msg = getErrorMessage(e, "Failed to assign approved Sample ID.");
            setErr(msg);
            onDone({ type: "error", message: msg });
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
                className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
            >
                <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div id={titleId} className="text-lg font-semibold text-gray-900">
                                Finalize approved Sample ID
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                                Request #{(sample as any)?.sample_id ?? "—"} • {clientName} • {workflowGroup}
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className={cx("lims-icon-button", busy && "opacity-60 cursor-not-allowed")}
                            aria-label="Close"
                            title="Close"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-5 py-4 space-y-4">
                    {!isApprovedState ? (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                            This screen is only for requests in the <span className="font-semibold">approved</span> state.
                        </div>
                    ) : null}

                    {err ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
                            {err}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                        OM/LH has approved a Sample ID change. Admin can only <span className="font-semibold">finalize</span> the approved code.
                    </div>

                    <div className="rounded-xl border border-gray-100 px-4 py-3">
                        <div className="text-xs text-gray-500">Approved Sample ID (will be assigned)</div>

                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="font-mono text-lg font-semibold text-gray-900">
                                {prettySampleId(approvedNormalized)}
                            </div>

                            <button
                                type="button"
                                className={cx("lims-icon-button", !approvedNormalized && "opacity-40 cursor-not-allowed")}
                                disabled={!approvedNormalized || busy}
                                onClick={async () => {
                                    if (!approvedNormalized) return;
                                    try {
                                        await navigator.clipboard.writeText(approvedNormalized);
                                    } catch {
                                        // ignore
                                    }
                                }}
                                aria-label="Copy approved"
                                title="Copy approved"
                            >
                                <Copy size={16} />
                            </button>
                        </div>

                        {busy && !approvedNormalized ? (
                            <div className="mt-3 text-xs text-gray-500 inline-flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" />
                                Loading approved code…
                            </div>
                        ) : null}

                        {suggestedNormalized ? (
                            <div className="mt-3 text-xs text-gray-600">
                                Suggested (system):{" "}
                                <span className="font-mono">{prettySampleId(suggestedNormalized)}</span>
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

                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-white">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className={cx("lims-btn", busy && "opacity-60 cursor-not-allowed")}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={finalize}
                        className={cx(
                            "lims-btn-primary inline-flex items-center gap-2",
                            !canSubmit && "opacity-60 cursor-not-allowed"
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
