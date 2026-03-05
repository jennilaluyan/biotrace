import { useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, Copy, Lock, Wand2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Sample } from "../../services/samples";
import { assignSampleId, getSuggestedSampleId, proposeSampleIdChange } from "../../services/sampleIdChanges";
import { getErrorMessage } from "../../utils/errors";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function pad3(n: number) {
    return String(n).padStart(3, "0");
}

type NormalizeErrorCode = "required" | "format" | "number";

type NormalizeResult =
    | { ok: true; normalized: string; prefix: string; number: number; errorCode: null }
    | { ok: false; normalized: string; prefix: string; number: 0; errorCode: NormalizeErrorCode };

/**
 * Normalize to: `PREFIX 003`
 * - Prefix: 1-5 letters
 * - Number: 1-6 digits, must be > 0
 * - Allows optional "-" or spaces between prefix & number
 */
function normalizeSampleId(raw: string): NormalizeResult {
    const s0 = String(raw ?? "").trim().toUpperCase();
    if (!s0) {
        return { ok: false, normalized: "", prefix: "", number: 0, errorCode: "required" };
    }

    const m = s0.match(/^([A-Z]{1,5})\s*[- ]?\s*(\d{1,6})$/);
    if (!m) {
        return { ok: false, normalized: s0, prefix: "", number: 0, errorCode: "format" };
    }

    const prefix = m[1];
    const num = Number(m[2]);

    if (!Number.isFinite(num) || num <= 0) {
        return { ok: false, normalized: s0, prefix, number: 0, errorCode: "number" };
    }

    const normalized = `${prefix} ${pad3(num)}`;
    return { ok: true, normalized, prefix, number: num, errorCode: null };
}

function prettySampleId(raw?: string | null) {
    if (!raw) return "—";
    const v = normalizeSampleId(String(raw));
    return v.ok ? v.normalized : String(raw);
}

export type DonePayload = { type: "success" | "warning" | "error"; message: string };

type Props = {
    open: boolean;
    sample: Sample | null;
    onClose: () => void;
    onDone: (payload: DonePayload) => void;
};

export default function AssignSampleIdModal({ open, sample, onClose, onDone }: Props) {
    const { t } = useTranslation();

    const samplePk = Number((sample as any)?.sample_id ?? (sample as any)?.id ?? 0);

    const changeObj = (sample as any)?.sample_id_change ?? null;
    const changeStatus = String(
        changeObj?.status ?? (sample as any)?.sample_id_change_status ?? (sample as any)?.sample_id_change_state ?? ""
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

    // ESC close + lock scroll (kept for safety even if lims-modal styles already do this)
    useEffect(() => {
        if (!open) return;

        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) onClose();
        };
        window.addEventListener("keydown", onEsc);

        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;
        const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

        document.body.style.overflow = "hidden";
        if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;

        return () => {
            window.removeEventListener("keydown", onEsc);
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
        };
    }, [open, busy, onClose]);

    // Reset state on open
    useEffect(() => {
        if (!open) return;

        setErr(null);

        const pick = initialSuggestedFromSample ? String(initialSuggestedFromSample) : null;
        setSuggested(pick);

        if (lockedToApproved) {
            setValue(approvedProposed);
            return;
        }

        if (pick) {
            const v = normalizeSampleId(pick);
            setValue(v.ok ? v.normalized : pick);
            return;
        }

        setValue("");
    }, [open, initialSuggestedFromSample, lockedToApproved, approvedProposed]);

    // Fetch suggestion if not provided by sample payload
    useEffect(() => {
        if (!open) return;
        if (suggested) return;
        if (!Number.isFinite(samplePk) || samplePk <= 0) return;

        let cancelled = false;

        (async () => {
            try {
                const s = await getSuggestedSampleId(samplePk);
                if (cancelled) return;
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

        return () => {
            cancelled = true;
        };
    }, [open, suggested, samplePk, lockedToApproved]);

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
        ((sample as any)?.client_id ? t("samples.requestInfo.clientFallback", { id: (sample as any)?.client_id }) : "—");

    const workflowGroup = (sample as any)?.workflow_group ?? (sample as any)?.workflowGroup ?? "—";

    const parameters = (sample as any)?.requested_parameters ?? [];
    const paramsCount = Array.isArray(parameters) ? parameters.length : 0;
    const paramsLabel = t("samples.assignSampleId.parametersCount", { count: paramsCount });

    const canSubmit = open && !busy && Number.isFinite(samplePk) && samplePk > 0 && validation.ok;

    function normalizeErrorMessage(code: NormalizeErrorCode): string {
        if (code === "required") return t("samples.assignSampleId.errors.required");
        if (code === "format") return t("samples.assignSampleId.errors.format");
        return t("samples.assignSampleId.errors.number");
    }

    async function copyToClipboard(text: string) {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            // ignore
        }
    }

    async function submit(): Promise<void> {
        if (!canSubmit) return;

        setBusy(true);
        setErr(null);

        const code = validation.ok ? validation.normalized : "";

        try {
            // If OM/LH already approved a proposed code, Admin just finalizes it.
            if (lockedToApproved) {
                await assignSampleId(samplePk, code);
                onDone({ type: "success", message: t("samples.assignSampleId.done.assigned") });
                return;
            }

            // If Admin uses suggestion exactly, backend can auto-assign from suggestion.
            if (suggestedNorm && isSameAsSuggested) {
                await assignSampleId(samplePk);
                onDone({ type: "success", message: t("samples.assignSampleId.done.assigned") });
                return;
            }

            // Otherwise propose a change request to OM/LH
            await proposeSampleIdChange(samplePk, code);
            onDone({ type: "warning", message: t("samples.assignSampleId.done.sentForVerification") });
        } catch (e: any) {
            const msg = getErrorMessage(e, t("samples.assignSampleId.errors.submitFailedFallback"));
            setErr(msg);
            onDone({ type: "error", message: msg });
        } finally {
            setBusy(false);
        }
    }

    if (!open) return null;

    const headerSubtitle = t("samples.assignSampleId.subtitle", {
        id: (sample as any)?.sample_id ?? "—",
        client: clientName,
        group: workflowGroup,
    });

    // Match ClientApprovalDecisionModal visual structure
    const title = t("samples.assignSampleId.title");
    const subtitle = headerSubtitle;

    const Icon = lockedToApproved ? Lock : isSameAsSuggested ? Check : Wand2;
    const iconTone = lockedToApproved
        ? "bg-indigo-50 text-indigo-700"
        : isSameAsSuggested
            ? "bg-emerald-50 text-emerald-700"
            : "bg-amber-50 text-amber-700";

    const confirmLabel = lockedToApproved
        ? t("samples.assignSampleId.buttons.finalize")
        : isSameAsSuggested
            ? t("samples.assignSampleId.buttons.assign")
            : t("samples.assignSampleId.buttons.propose");

    return (
        <div
            className="lims-modal-backdrop p-4"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onMouseDown={() => {
                if (!busy) onClose();
            }}
        >
            <div
                className="lims-modal-panel max-w-xl"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
            >
                <div className="lims-modal-header">
                    <div className={cx("h-9 w-9 rounded-full flex items-center justify-center", iconTone)} aria-hidden="true">
                        <Icon size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{title}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</div>
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button"
                        aria-label={t("close")}
                        title={t("close")}
                        onClick={onClose}
                        disabled={!!busy}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className={cx("lims-modal-body", "space-y-4")}>
                    {err ? (
                        <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                            {err}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <ClipboardCheck size={14} />
                            <span className="font-semibold">{t("summary")}</span>
                        </div>

                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                            <div>
                                <div className="text-[11px] text-gray-500">{t("samples.assignSampleId.summary.client")}</div>
                                <div className="font-semibold text-gray-900 truncate" title={String(clientName)}>
                                    {clientName}
                                </div>
                            </div>

                            <div>
                                <div className="text-[11px] text-gray-500">{t("samples.assignSampleId.summary.group")}</div>
                                <div className="font-semibold text-gray-900 truncate" title={String(workflowGroup)}>
                                    {workflowGroup}
                                </div>
                            </div>

                            <div>
                                <div className="text-[11px] text-gray-500">{t("samples.assignSampleId.summary.parameters")}</div>
                                <div className="font-semibold text-gray-900">{paramsLabel}</div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <div className="text-xs text-gray-500">{t("samples.assignSampleId.suggestedTitle")}</div>
                                <div className="mt-1 font-mono text-sm text-gray-900">{prettySampleId(suggested)}</div>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className={cx(
                                        "lims-icon-button",
                                        (!suggested || lockedToApproved) && "opacity-40 cursor-not-allowed"
                                    )}
                                    disabled={!suggested || busy || lockedToApproved}
                                    onClick={() => {
                                        if (!suggested) return;
                                        setValue(prettySampleId(suggested));
                                    }}
                                    aria-label={t("samples.assignSampleId.actions.useSuggested")}
                                    title={t("samples.assignSampleId.actions.useSuggested")}
                                >
                                    <Wand2 size={16} />
                                </button>

                                <button
                                    type="button"
                                    className={cx("lims-icon-button", !suggested && "opacity-40 cursor-not-allowed")}
                                    disabled={!suggested || busy}
                                    onClick={() => {
                                        if (!suggested) return;
                                        copyToClipboard(prettySampleId(suggested));
                                    }}
                                    aria-label={t("samples.assignSampleId.actions.copySuggested")}
                                    title={t("samples.assignSampleId.actions.copySuggested")}
                                >
                                    <Copy size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-900">{t("samples.assignSampleId.fieldLabel")}</label>

                        <input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onBlur={() => {
                                const v = normalizeSampleId(value);
                                if (v.ok) setValue(v.normalized);
                            }}
                            disabled={busy || lockedToApproved}
                            placeholder={t("samples.assignSampleId.placeholder")}
                            className={cx(
                                "mt-2 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft",
                                !validation.ok && value.trim() ? "border-rose-300" : "border-gray-300",
                                lockedToApproved && "bg-gray-50"
                            )}
                        />

                        <div className="mt-1 text-xs">
                            {!value.trim() ? (
                                <span className="text-gray-500">{t("samples.assignSampleId.hints.format")}</span>
                            ) : validation.ok ? (
                                <span className="text-emerald-700 inline-flex items-center gap-2 flex-wrap">
                                    <span>
                                        {t("samples.assignSampleId.hints.normalized")}{" "}
                                        <span className="font-mono font-semibold">{validation.normalized}</span>
                                    </span>

                                    {suggestedNorm ? (
                                        <span className="text-gray-500">
                                            •{" "}
                                            {isSameAsSuggested
                                                ? t("samples.assignSampleId.hints.matchesSuggestion")
                                                : t("samples.assignSampleId.hints.differsSuggestion")}
                                        </span>
                                    ) : null}

                                    {lockedToApproved ? (
                                        <span className="text-gray-500 inline-flex items-center gap-1">
                                            • <Lock size={12} aria-hidden="true" /> {t("samples.assignSampleId.hints.approvedByOmLh")}
                                        </span>
                                    ) : null}
                                </span>
                            ) : (
                                <span className="text-rose-700">{normalizeErrorMessage(validation.errorCode)}</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="lims-modal-footer">
                    <button type="button" onClick={onClose} disabled={!!busy} className="btn-outline disabled:opacity-50">
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        disabled={!canSubmit}
                        onClick={submit}
                        className={cx("lims-btn-primary", "disabled:opacity-50 disabled:cursor-not-allowed")}
                        title={confirmLabel}
                    >
                        {busy ? t("common.processing", "Processing...") : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}