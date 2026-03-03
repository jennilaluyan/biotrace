import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Loader2, X, ShieldAlert, Info } from "lucide-react";

import { createParameterRequest, type CreateParameterRequestPayload } from "../../services/parameterRequests";
import { getErrorMessage } from "../../utils/errors";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type WorkflowGroup = "pcr" | "sequencing" | "rapid" | "microbiology";

export type ParameterEditRow = {
    parameter_id: number;
    code: string;
    name: string;
    workflow_group?: string | null;
    status: "Active" | "Inactive";
    tag: "Routine" | "Research";
};

type Props = {
    open: boolean;
    row: ParameterEditRow | null;
    onClose: () => void;
    onSaved: () => void | Promise<void>;
};

const GROUPS: WorkflowGroup[] = ["pcr", "sequencing", "rapid", "microbiology"];

function normalizeGroup(v?: string | null): string {
    return String(v ?? "").trim().toLowerCase();
}

function clamp150(s: string) {
    return String(s ?? "").slice(0, 150);
}

/**
 * ParameterEditModal
 *
 * IMPORTANT:
 * This modal does NOT directly edit the Parameter record.
 * It submits an UPDATE request that must be approved by OM/LH first.
 */
export default function ParameterEditModal({ open, row, onClose, onSaved }: Props) {
    const { t } = useTranslation();

    const [name, setName] = useState("");
    const [workflowGroup, setWorkflowGroup] = useState<string>("");
    const [status, setStatus] = useState<"Active" | "Inactive">("Active");
    const [tag, setTag] = useState<"Routine" | "Research">("Routine");
    const [reason, setReason] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !row) return;

        setName(row.name ?? "");
        setWorkflowGroup(normalizeGroup(row.workflow_group));
        setStatus(row.status ?? "Active");
        setTag(row.tag ?? "Routine");
        setReason("");

        setSubmitting(false);
        setError(null);
    }, [open, row]);

    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !submitting) onClose();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, onClose, submitting]);

    const changes = useMemo(() => {
        if (!row) return null;

        const baseName = String(row.name ?? "").trim();
        const baseGroup = normalizeGroup(row.workflow_group);
        const baseStatus = row.status;
        const baseTag = row.tag;

        const nextName = name.trim();
        const nextGroup = normalizeGroup(workflowGroup);
        const nextStatus = status;
        const nextTag = tag;

        const payload: CreateParameterRequestPayload = {
            parameter_id: row.parameter_id,
            reason: reason.trim() ? reason.trim() : null,
        };

        // Send only changed keys
        if (nextName !== baseName) payload.name = clamp150(nextName);

        // Allow clearing workflow_group ("" => null)
        if (nextGroup !== baseGroup) payload.workflow_group = nextGroup ? (nextGroup as any) : null;

        if (nextStatus !== baseStatus) payload.status = nextStatus;
        if (nextTag !== baseTag) payload.tag = nextTag;

        const hasAny = Object.keys(payload).some((k) => !["parameter_id", "reason"].includes(k));
        return { payload, hasAny };
    }, [row, name, workflowGroup, status, tag, reason]);

    const canSubmit = useMemo(() => {
        if (!row) return false;
        if (submitting) return false;
        if (!name.trim()) return false;
        return Boolean(changes?.hasAny);
    }, [row, submitting, name, changes]);

    if (!open || !row) return null;

    async function submit() {
        const plan = changes;
        if (!plan || !canSubmit) return;

        setError(null);
        setSubmitting(true);

        try {
            await createParameterRequest(plan.payload);
            await onSaved();
            onClose();
        } catch (e: any) {
            setError(
                getErrorMessage(
                    e,
                    t("parametersPage.editModal.errors.submitFailed", { defaultValue: "Failed to submit update request." })
                )
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div
            className="lims-modal-backdrop p-4"
            role="dialog"
            aria-modal="true"
            aria-label={t("parametersPage.editModal.title", { defaultValue: "Edit parameter" })}
            onClick={() => (submitting ? null : onClose())}
        >
            <div className="lims-modal-panel max-w-lg" onClick={(e) => e.stopPropagation()}>
                <div className="lims-modal-header">
                    <div className="h-9 w-9 rounded-full flex items-center justify-center bg-slate-50 text-slate-800" aria-hidden="true">
                        <Pencil size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">
                            {t("parametersPage.editModal.title", { defaultValue: "Edit parameter" })}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                            {t("parametersPage.editModal.subtitle", {
                                defaultValue: "Changes will be submitted as a request and must be approved by OM/LH.",
                            })}
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
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 inline-flex items-start gap-2">
                        <Info size={16} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                            {t("parametersPage.editModal.notice", {
                                defaultValue: "This will create a pending update request. The parameter will only change after OM/LH approval.",
                            })}
                        </div>
                    </div>

                    {error ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 inline-flex items-start gap-2">
                            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
                            <div className="min-w-0">{error}</div>
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-700">{t("parametersPage.editModal.fields.code", { defaultValue: "Code" })}</label>
                            <input
                                value={row.code ?? ""}
                                disabled
                                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-700">{t("parametersPage.editModal.fields.workflowGroup", { defaultValue: "Workflow group" })}</label>
                            <select
                                value={workflowGroup}
                                onChange={(e) => setWorkflowGroup(e.target.value)}
                                disabled={submitting}
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            >
                                <option value="">{t("parametersPage.editModal.fields.workflowGroupEmpty", { defaultValue: "—" })}</option>
                                {GROUPS.map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">
                            {t("parametersPage.editModal.fields.name", { defaultValue: "Name" })} <span className="text-rose-600">*</span>
                        </label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={submitting}
                            maxLength={150}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            placeholder={t("parametersPage.editModal.placeholders.name", { defaultValue: "Parameter name…" })}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-700">{t("parametersPage.editModal.fields.status", { defaultValue: "Status" })}</label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value as any)}
                                disabled={submitting}
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-gray-700">{t("parametersPage.editModal.fields.tag", { defaultValue: "Tag" })}</label>
                            <select
                                value={tag}
                                onChange={(e) => setTag(e.target.value as any)}
                                disabled={submitting}
                                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            >
                                <option value="Routine">Routine</option>
                                <option value="Research">Research</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-gray-700">{t("parametersPage.editModal.fields.reason", { defaultValue: "Reason (optional)" })}</label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            disabled={submitting}
                            maxLength={2000}
                            className="min-h-[110px] w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            placeholder={t("parametersPage.editModal.placeholders.reason", { defaultValue: "Why do you want to change this parameter?" })}
                        />
                    </div>
                </div>

                <div className="lims-modal-footer">
                    <button type="button" onClick={onClose} disabled={submitting} className="btn-outline disabled:opacity-50">
                        {t("cancel")}
                    </button>

                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canSubmit}
                        className={cx("lims-btn-primary gap-2", !canSubmit && "opacity-60 cursor-not-allowed")}
                        title={t("parametersPage.editModal.actions.submit", { defaultValue: "Submit request" })}
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {submitting ? t("submitting") : t("parametersPage.editModal.actions.submit", { defaultValue: "Submit request" })}
                    </button>
                </div>
            </div>
        </div>
    );
}