import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Wand2, X } from "lucide-react";
import type { Sample } from "../../services/samples";
import { assignSampleId, getSuggestedSampleId, proposeSampleIdChange } from "../../services/sampleIdChanges";
import { getErrorMessage } from "../../utils/errors";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function pad3(n: number) {
    return String(n).padStart(3, "0");
}

/**
 * Accept loose input like:
 * - "LBMA002" / "lbma 2" / "LBMA-002" => "LBMA 002"
 * Output canonical: "PREFIX 001" (single space)
 */
function normalizeSampleId(raw: string) {
    const s0 = String(raw ?? "").trim().toUpperCase();
    if (!s0) return { ok: false, normalized: "", prefix: "", number: 0, error: "Sample ID is required." };

    const m = s0.match(/^([A-Z]{1,5})\s*[- ]?\s*(\d{1,6})$/);
    if (!m) {
        return {
            ok: false,
            normalized: s0,
            prefix: "",
            number: 0,
            error: "Format harus: PREFIX 001 (huruf kapital, prefix max 5, spasi, angka).",
        };
    }

    const prefix = m[1];
    const num = Number(m[2]);
    if (!Number.isFinite(num) || num <= 0) {
        return { ok: false, normalized: s0, prefix, number: 0, error: "Nomor harus > 0." };
    }

    const normalized = `${prefix} ${pad3(num)}`;
    return { ok: true, normalized, prefix, number: num, error: null as any };
}

function prettySampleId(raw?: string | null) {
    if (!raw) return "—";
    const v = normalizeSampleId(String(raw));
    return v.ok ? v.normalized : String(raw);
}

type DonePayload = { type: "success" | "warning" | "error"; message: string };

type Props = {
    open: boolean;
    sample: Sample | null;
    onClose: () => void;
    onDone: (payload: DonePayload) => void;
};

export default function AssignSampleIdModal({ open, sample, onClose, onDone }: Props) {
    const sampleId = Number((sample as any)?.sample_id ?? (sample as any)?.id ?? 0);

    const changeObj = (sample as any)?.sample_id_change ?? null;
    const changeStatus = String(
        changeObj?.status ??
        (sample as any)?.sample_id_change_status ??
        (sample as any)?.sample_id_change_state ??
        ""
    )
        .trim()
        .toLowerCase();

    const approvedProposed =
        changeStatus === "approved"
            ? String(
                changeObj?.proposed_lab_sample_code ??
                changeObj?.proposed_sample_id ??
                (sample as any)?.proposed_lab_sample_code ??
                (sample as any)?.proposed_sample_id ??
                ""
            ).trim()
            : "";

    const lockedToApproved = !!approvedProposed;

    const initialSuggestedFromSample = useMemo(() => {
        const v =
            (sample as any)?.suggested_lab_sample_code ??
            (sample as any)?.suggested_sample_id ??
            changeObj?.suggested_lab_sample_code ??
            changeObj?.suggested_sample_id ??
            null;

        return v ? String(v) : null;
    }, [sample, changeObj]);

    const [suggested, setSuggested] = useState<string | null>(null);
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;

        setErr(null);

        const pick = initialSuggestedFromSample ? String(initialSuggestedFromSample) : null;
        setSuggested(pick);

        if (lockedToApproved) {
            setValue(approvedProposed);
        } else if (pick) {
            setValue(pick);
        } else {
            setValue("");
        }
    }, [open, initialSuggestedFromSample, lockedToApproved, approvedProposed]);

    useEffect(() => {
        if (!open) return;
        if (suggested) return;
        if (!Number.isFinite(sampleId) || sampleId <= 0) return;

        (async () => {
            try {
                const s = await getSuggestedSampleId(sampleId);
                if (!s) return;

                const v = normalizeSampleId(s);
                const norm = v.ok ? v.normalized : s;

                setSuggested(norm);

                if (!lockedToApproved) {
                    setValue((prev) => (prev.trim() ? prev : norm));
                }
            } catch {
                // ignore
            }
        })();
    }, [open, suggested, sampleId, lockedToApproved]);

    const validation = useMemo(() => normalizeSampleId(value), [value]);

    const suggestedNorm = useMemo(() => {
        if (!suggested) return null;
        const v = normalizeSampleId(suggested);
        return v.ok ? v.normalized : String(suggested).trim().toUpperCase();
    }, [suggested]);

    const isSameAsSuggested = useMemo(() => {
        if (!suggestedNorm) return false;
        if (!validation.ok) return false;
        return validation.normalized === suggestedNorm;
    }, [validation, suggestedNorm]);

    const clientName =
        (sample as any)?.client?.name ??
        (sample as any)?.client_name ??
        ((sample as any)?.client_id ? `Client #${(sample as any)?.client_id}` : "-");

    const workflowGroup = (sample as any)?.workflow_group ?? (sample as any)?.workflowGroup ?? "-";

    const parameters = (sample as any)?.requested_parameters ?? [];
    const paramsLabel = Array.isArray(parameters) ? `${parameters.length} parameter(s)` : "-";

    const canSubmit = open && !busy && Number.isFinite(sampleId) && sampleId > 0 && validation.ok;

    async function submit() {
        if (!canSubmit) return;

        setBusy(true);
        setErr(null);

        const code = validation.normalized;

        try {
            if (lockedToApproved) {
                await assignSampleId(sampleId, code);
                onDone({ type: "success", message: "Sample ID assigned." });
                return;
            }

            if (suggestedNorm && isSameAsSuggested) {
                await assignSampleId(sampleId);
                onDone({ type: "success", message: "Sample ID assigned." });
                return;
            }

            await proposeSampleIdChange(sampleId, code);
            onDone({ type: "warning", message: "Sent to OM/LH for verification." });
        } catch (e: any) {
            const msg = getErrorMessage(e, "Failed to submit Sample ID.");
            setErr(msg);
            onDone({ type: "error", message: msg });
        } finally {
            setBusy(false);
        }
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => (busy ? null : onClose())} />

            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border">
                <div className="px-5 py-4 border-b">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="text-lg font-semibold text-gray-900">Assign Sample ID</div>
                            <div className="text-xs text-gray-500 mt-1">
                                Request #{(sample as any)?.sample_id ?? "-"} • {clientName} • {workflowGroup}
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
                    {err ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                            {err}
                        </div>
                    ) : null}

                    <div className="rounded-xl border bg-gray-50 px-4 py-3">
                        <div className="text-xs text-gray-500">Summary</div>
                        <div className="mt-1 text-sm text-gray-900">
                            client: <span className="font-semibold">{clientName}</span>
                            <span className="text-gray-600"> • group: </span>
                            <span className="font-semibold">{workflowGroup}</span>
                            <span className="text-gray-600"> • </span>
                            <span className="font-semibold">{paramsLabel}</span>
                        </div>
                    </div>

                    <div className="rounded-xl border px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-xs text-gray-500">Suggested Sample ID</div>
                                <div className="mt-1 font-mono text-sm text-gray-900">
                                    {prettySampleId(suggested)}
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className={cx("lims-icon-button", !suggested && "opacity-40 cursor-not-allowed")}
                                    disabled={!suggested || busy || lockedToApproved}
                                    onClick={() => {
                                        if (!suggested) return;
                                        setValue(prettySampleId(suggested));
                                    }}
                                    aria-label="Use suggested"
                                    title="Use suggested"
                                >
                                    <Wand2 size={16} />
                                </button>

                                <button
                                    type="button"
                                    className={cx("lims-icon-button", !suggested && "opacity-40 cursor-not-allowed")}
                                    disabled={!suggested || busy}
                                    onClick={async () => {
                                        if (!suggested) return;
                                        try {
                                            await navigator.clipboard.writeText(prettySampleId(suggested));
                                        } catch {
                                            // ignore
                                        }
                                    }}
                                    aria-label="Copy suggested"
                                    title="Copy suggested"
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-900">Sample ID</label>
                        <input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onBlur={() => {
                                const v = normalizeSampleId(value);
                                if (v.ok) setValue(v.normalized);
                            }}
                            disabled={busy || lockedToApproved}
                            placeholder="e.g. LBMA 001"
                            className={cx(
                                "mt-2 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft",
                                !validation.ok && value.trim() ? "border-rose-300" : "border-gray-300",
                                lockedToApproved && "bg-gray-50"
                            )}
                        />

                        <div className="mt-1 text-xs">
                            {!value.trim() ? (
                                <span className="text-gray-500">Format: PREFIX 001 (prefix max 5 huruf, spasi, angka). Nomor akan dipad 3 digit.</span>
                            ) : validation.ok ? (
                                <span className="text-emerald-700">
                                    Normalized: <span className="font-mono font-semibold">{validation.normalized}</span>
                                    {suggestedNorm ? (
                                        <span className="text-gray-500">
                                            {" "}
                                            • {isSameAsSuggested ? "matches suggestion" : "differs from suggestion"}
                                        </span>
                                    ) : null}
                                    {lockedToApproved ? (
                                        <span className="text-gray-500"> • approved by OM/LH</span>
                                    ) : null}
                                </span>
                            ) : (
                                <span className="text-rose-700">{validation.error}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className={cx("btn-outline", busy && "opacity-60 cursor-not-allowed")}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={submit}
                        className={cx(
                            "lims-btn-primary inline-flex items-center gap-2",
                            !canSubmit && "opacity-60 cursor-not-allowed"
                        )}
                    >
                        <Check size={16} />
                        {busy ? "Processing..." : lockedToApproved ? "Finalize" : isSameAsSuggested ? "Assign" : "Propose"}
                    </button>
                </div>
            </div>
        </div>
    );
}
