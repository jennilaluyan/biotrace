import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePlus2, X, Loader2, ShieldAlert } from "lucide-react";

import { createParameterRequest, type CreateParameterRequestPayload, type ParameterRequestRow } from "../../services/parameterRequests";
import { getErrorMessage } from "../../utils/errors";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    onClose: () => void;
    onCreated?: (row: ParameterRequestRow) => void;
};

const CATEGORIES: Array<CreateParameterRequestPayload["category"]> = ["pcr", "sequencing", "rapid", "microbiology"];

export default function ParameterRequestCreateModal({ open, onClose, onCreated }: Props) {
    const { t } = useTranslation();

    const [name, setName] = useState("");
    const [category, setCategory] = useState<CreateParameterRequestPayload["category"]>("microbiology");
    const [reason, setReason] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const nameLen = useMemo(() => name.trim().length, [name]);
    const reasonLen = useMemo(() => reason.trim().length, [reason]);

    useEffect(() => {
        if (!open) return;

        // reset form every open (clean UX)
        setName("");
        setCategory("microbiology");
        setReason("");
        setSubmitting(false);
        setError(null);
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!submitting) onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose, submitting]);

    if (!open) return null;

    const canSubmit = name.trim().length > 0 && !submitting;

    async function submit() {
        if (!canSubmit) return;

        setError(null);

        const payload: CreateParameterRequestPayload = {
            parameter_name: name.trim(),
            category,
            reason: reason.trim() ? reason.trim() : null,
        };

        try {
            setSubmitting(true);
            const created = await createParameterRequest(payload);
            onCreated?.(created);
            onClose();
        } catch (e: any) {
            setError(getErrorMessage(e, t("parametersPage.requestModal.errors.submitFailed", "Failed to submit request.")));
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="lims-modal-backdrop p-4" role="dialog" aria-modal="true" aria-label={t("parametersPage.requestModal.title", "Add request")}>
            <div className="lims-modal-panel max-w-lg">
                <div className="lims-modal-header">
                    <div
                        className="h-9 w-9 rounded-full flex items-center justify-center bg-slate-50 text-slate-800"
                        aria-hidden="true"
                    >
                        <FilePlus2 size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">
                            {t("parametersPage.requestModal.title", "Add parameter request")}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                            {t("parametersPage.requestModal.subtitle", "Submit a request to be approved by OM/LH.")}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button"
                        aria-label={t("close")}
                        title={t("close")}
                        onClick={onClose}
                        disabled={submitting}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="lims-modal-body space-y-4">
                    {error ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 inline-flex items-start gap-2">
                            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                            <div className="min-w-0">{error}</div>
                        </div>
                    ) : null}

                    <div className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3">
                            <label className="text-xs font-semibold text-gray-700">
                                {t("parametersPage.requestModal.fields.name", "Parameter name")}{" "}
                                <span className="text-rose-600">*</span>
                            </label>
                            <div className="text-[11px] text-gray-500 tabular-nums">
                                {nameLen}/150
                            </div>
                        </div>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={submitting}
                            maxLength={150}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            placeholder={t("parametersPage.requestModal.placeholders.name", "e.g. PCR Influenza A/B")}
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">
                            {t("parametersPage.requestModal.fields.category", "Category")}{" "}
                            <span className="text-rose-600">*</span>
                        </label>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value as any)}
                            disabled={submitting}
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3">
                            <label className="text-xs font-semibold text-gray-700">
                                {t("parametersPage.requestModal.fields.reason", "Reason")}{" "}
                                <span className="text-gray-400">({t("optional", "optional")})</span>
                            </label>
                            <div className="text-[11px] text-gray-500 tabular-nums">
                                {reasonLen}/2000
                            </div>
                        </div>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={submitting}
                            maxLength={2000}
                            className="min-h-[110px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            placeholder={t("parametersPage.requestModal.placeholders.reason", "Explain why this parameter is needed…")}
                        />
                    </div>
                </div>

                <div className="lims-modal-footer">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="btn-outline disabled:opacity-50"
                    >
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSubmit}
                        className={cx("lims-btn-primary inline-flex items-center gap-2", (!canSubmit) && "opacity-60 cursor-not-allowed")}
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {submitting ? t("submitting") : t("submit")}
                    </button>
                </div>
            </div>
        </div>
    );
}