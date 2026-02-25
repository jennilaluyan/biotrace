import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDateTimeLocal } from "../../utils/date";
import { getQualityCoverById, omReject, omVerify, QualityCoverInboxItem } from "../../services/qualityCovers";
import { QualityCoverDecisionModal } from "../../components/quality-covers/QualityCoverDecisionModal";

type DecisionMode = "verify" | "reject";

export function QualityCoverOmDetailPage() {
    const { t } = useTranslation();

    const { qualityCoverId } = useParams();
    const id = Number(qualityCoverId);
    const nav = useNavigate();

    const [data, setData] = useState<QualityCoverInboxItem | null>(null);
    const [loading, setLoading] = useState(false);

    const [mode, setMode] = useState<DecisionMode | null>(null);
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load(opts?: { silent?: boolean }) {
        const silent = !!opts?.silent;
        if (!silent) setLoading(true);

        try {
            const qc = await getQualityCoverById(id);
            setData(qc ?? null);
        } finally {
            if (!silent) setLoading(false);
        }
    }

    useEffect(() => {
        if (!Number.isFinite(id) || id <= 0) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    async function submit() {
        if (!data || !mode) return;

        if (mode === "reject" && !reason.trim()) {
            setError(t("qualityCover.inbox.modal.errors.rejectReasonRequired"));
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            if (mode === "verify") await omVerify(data.quality_cover_id);
            if (mode === "reject") await omReject(data.quality_cover_id, reason.trim());

            setMode(null);
            setReason("");
            await load({ silent: true });

            nav("/quality-covers/inbox/om");
        } catch (e: any) {
            const msg =
                e?.message ||
                e?.data?.message ||
                e?.response?.data?.message ||
                t("qualityCover.inbox.modal.errors.submitFailed");
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    }

    if (!Number.isFinite(id) || id <= 0) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">{t("qualityCover.detail.states.invalidIdTitle")}</h1>
                <p className="text-sm text-gray-600">{t("qualityCover.detail.states.invalidIdBody")}</p>
                <Link to="/quality-covers/inbox/om" className="mt-4 lims-btn-primary">
                    {t("qualityCover.detail.actions.backToInbox")}
                </Link>
            </div>
        );
    }

    const sampleCode = data?.sample?.lab_sample_code ?? (data ? `#${data.sample_id}` : "—");
    const group = data?.sample?.workflow_group ?? data?.workflow_group ?? "-";
    const clientName = data?.sample?.client?.name ?? "-";

    return (
        <div className="min-h-[60vh]">
            {/* Breadcrumb */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/quality-covers/inbox/om" className="lims-breadcrumb-link">
                        {t("qualityCover.detail.breadcrumbOm")}
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">{t("qualityCover.detail.breadcrumbCurrent")}</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("qualityCover.detail.title")}</h1>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500">{t("qualityCover.detail.meta.sample")}</span>
                            <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                {sampleCode}
                            </span>
                            <span className="text-[11px] text-gray-500">{t("qualityCover.detail.step.om")}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={() => load()}
                            disabled={loading || submitting}
                            aria-label={t("refresh")}
                            title={t("refresh")}
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="mt-4 text-sm text-gray-600">{t("qualityCover.detail.states.loading")}</div>
                ) : !data ? (
                    <div className="mt-4 text-sm text-gray-600">{t("qualityCover.detail.states.notFound")}</div>
                ) : (
                    <div className="mt-4 space-y-6">
                        {/* Top card */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm text-gray-500">{t("qualityCover.detail.meta.sample")}</div>
                                    <div className="text-lg font-semibold text-gray-900">{sampleCode}</div>
                                    <div className="text-sm text-gray-600">
                                        {t("qualityCover.detail.meta.client")}: {clientName} • {t("qualityCover.detail.meta.group")}: {group}
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-sm text-gray-500">{t("qualityCover.detail.meta.status")}</div>
                                    <div className="font-medium text-gray-900">{data.status}</div>
                                    <div className="text-xs text-gray-600">
                                        {t("qualityCover.detail.meta.submitted")}:{" "}
                                        {data.submitted_at ? formatDateTimeLocal(data.submitted_at) : "-"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Error */}
                        {error ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                                {error}
                            </div>
                        ) : null}

                        {/* Detail card */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                            <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                    <div className="text-xs text-gray-500">{t("qualityCover.detail.fields.dateOfAnalysis")}</div>
                                    <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                                        {data.date_of_analysis ? formatDateTimeLocal(data.date_of_analysis) : "-"}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500">{t("qualityCover.detail.fields.checkedBy")}</div>
                                    <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                                        {data.checked_by?.name ?? data.checked_by_staff_id ?? "-"}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-gray-500">{t("qualityCover.detail.fields.methodOfAnalysis")}</div>
                                <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                                    {data.method_of_analysis ?? "-"}
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        {data.status === "submitted" ? (
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode("verify");
                                        setError(null);
                                    }}
                                    className="lims-btn-primary inline-flex items-center gap-2"
                                    disabled={submitting}
                                >
                                    <Check size={16} />
                                    {t("qualityCover.detail.actions.verify")}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode("reject");
                                        setError(null);
                                    }}
                                    className="lims-btn-danger inline-flex items-center gap-2"
                                    disabled={submitting}
                                >
                                    <X size={16} />
                                    {t("qualityCover.detail.actions.reject")}
                                </button>

                                <Link to="/quality-covers/inbox/om" className="lims-btn">
                                    {t("qualityCover.detail.actions.backToInbox")}
                                </Link>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-600">{t("qualityCover.detail.hints.notInSubmitted")}</div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal */}
            <QualityCoverDecisionModal
                open={!!mode}
                mode={mode === "reject" ? "reject" : "approve"}
                title={mode === "reject" ? t("qualityCover.inbox.modal.rejectTitle") : t("qualityCover.inbox.modal.verifyTitle")}
                subtitle={
                    data
                        ? t("qualityCover.inbox.modal.subtitle", { qcId: data.quality_cover_id, sampleId: data.sample_id })
                        : undefined
                }
                submitting={submitting}
                error={error}
                rejectReason={reason}
                onRejectReasonChange={setReason}
                approveHint={t("qualityCover.detail.hints.approveHintOm")}
                onClose={() => {
                    if (submitting) return;
                    setMode(null);
                    setReason("");
                    setError(null);
                }}
                onConfirm={submit}
            />
        </div>
    );
}