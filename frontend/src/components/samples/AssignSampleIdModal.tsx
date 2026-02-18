import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Wand2, X, Loader2, Lock } from "lucide-react";
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

    const sampleId = Number((sample as any)?.sample_id ?? (sample as any)?.id ?? 0);

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

    // ESC close + lock scroll
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
        ((sample as any)?.client_id ? t("samples.requestInfo.clientFallback", { id: (sample as any)?.client_id }) : "—");

    const workflowGroup = (sample as any)?.workflow_group ?? (sample as any)?.workflowGroup ?? "—";

    const parameters = (sample as any)?.requested_parameters ?? [];
    const paramsCount = Array.isArray(parameters) ? parameters.length : 0;
    const paramsLabel = t("samples.assignSampleId.parametersCount", { count: paramsCount });

    const canSubmit = open && !busy && Number.isFinite(sampleId) && sampleId > 0 && validation.ok;

    function normalizeErrorMessage(code: NormalizeErrorCode): string {
        if (code === "required") return t("samples.assignSampleId.errors.required");
        if (code === "format") return t("samples.assignSampleId.errors.format");
        return t("samples.assignSampleId.errors.number");
    }

    async function submit(): Promise<void> {
        if (!canSubmit) return;

        setBusy(true);
        setErr(null);

        const code = validation.ok ? validation.normalized : "";

        try {
            // If OM/LH already approved a proposed code, Admin just finalizes it.
            if (lockedToApproved) {
                await assignSampleId(sampleId, code);
                onDone({ type: "success", message: t("samples.assignSampleId.done.assigned") });
                return;
            }

            // If Admin uses suggestion exactly, backend can auto-assign from suggestion.
            if (suggestedNorm && isSameAsSuggested) {
                await assignSampleId(sampleId);
                onDone({ type: "success", message: t("samples.assignSampleId.done.assigned") });
                return;
            }

            // Otherwise propose a change request to OM/LH
            await proposeSampleIdChange(sampleId, code);
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

    const primaryLabel = busy
        ? t("processing")
        : lockedToApproved
            ? t("samples.assignSampleId.buttons.finalize")
            : isSameAsSuggested
                ? t("samples.assignSampleId.buttons.assign")
                : t("samples.assignSampleId.buttons.propose");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={() => (busy ? null : onClose())} aria-hidden="true" />

            <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-lg font-semibold text-gray-900">{t("samples.assignSampleId.title")}</div>
                            <div className="text-xs text-gray-500 mt-1">{headerSubtitle}</div>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            disabled={busy}
                            className={cx("lims-icon-button", busy && "opacity-60 cursor-not-allowed")}
                            aria-label={t("close")}
                            title={t("close")}
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

                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <div className="text-xs text-gray-500">{t("summary")}</div>
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
                                    className={cx("lims-icon-button", (!suggested || lockedToApproved) && "opacity-40 cursor-not-allowed")}
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
                                    onClick={async () => {
                                        if (!suggested) return;
                                        try {
                                            await navigator.clipboard.writeText(prettySampleId(suggested));
                                        } catch {
                                            // ignore
                                        }
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

                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-white">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className={cx("lims-btn", busy && "opacity-60 cursor-not-allowed")}
                    >
                        {t("cancel")}
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
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                        {primaryLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
