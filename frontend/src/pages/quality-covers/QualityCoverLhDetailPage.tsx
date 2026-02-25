import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Download, FileText, Loader2, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDateTimeLocal } from "../../utils/date";
import {
    getQualityCoverById,
    lhReject,
    lhValidate,
    QualityCoverInboxItem,
    CoaReportResult,
    type LhValidateResponse,
} from "../../services/qualityCovers";
import { openCoaPdfBySample } from "../../services/coa";

import { QualityCoverDecisionModal } from "../../components/quality-covers/QualityCoverDecisionModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type DecisionMode = "validate" | "reject";

type FlashPayload = {
    type: "success" | "warning" | "error";
    message: string;
    sampleId?: number;
    canDownload?: boolean;
    reportId?: number | null;
};

export function QualityCoverLhDetailPage() {
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

    const [flash, setFlash] = useState<FlashPayload | null>(null);
    const [report, setReport] = useState<CoaReportResult>(null);

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

    // auto dismiss flash
    useEffect(() => {
        if (!flash) return;
        const tmr = window.setTimeout(() => setFlash(null), 9000);
        return () => window.clearTimeout(tmr);
    }, [flash]);

    async function submit() {
        if (!data || !mode) return;

        if (mode === "reject" && !reason.trim()) {
            setError(t("qualityCover.inbox.modal.errors.rejectReasonRequired"));
            return;
        }

        setSubmitting(true);
        setError(null);
        setFlash(null);
        setReport(null);

        try {
            if (mode === "validate") {
                const res = (await lhValidate(data.quality_cover_id)) as LhValidateResponse;

                const qc = res?.data?.quality_cover ?? null;
                const r = res?.data?.report ?? null;
                const coaError = res?.data?.coa_error ?? null;
                const sampleId = qc?.sample_id ?? data.sample_id;

                setReport(r);

                if (r && typeof r.report_id === "number" && r.report_id > 0) {
                    setFlash({
                        type: "success",
                        message: t("qualityCover.detail.flash.validatedOk"),
                        sampleId,
                        canDownload: true,
                        reportId: r.report_id,
                    });
                } else {
                    setFlash({
                        type: "warning",
                        message: coaError || res?.message || t("qualityCover.detail.flash.validatedWarn"),
                        sampleId,
                        canDownload: false,
                        reportId: null,
                    });
                }

                await load({ silent: true });

                setMode(null);
                setReason("");
                return;
            }

            if (mode === "reject") {
                await lhReject(data.quality_cover_id, reason.trim());

                setMode(null);
                setReason("");
                await load({ silent: true });

                nav("/quality-covers/inbox/lh", {
                    state: {
                        flash: {
                            type: "success",
                            message: t("qualityCover.detail.flash.rejected"),
                            sampleId: data.sample_id,
                            canDownload: false,
                        },
                    },
                });
                return;
            }
        } catch (e: any) {
            const msg =
                e?.message ||
                e?.data?.message ||
                (typeof e?.data === "string" ? e.data : null) ||
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
                <Link to="/quality-covers/inbox/lh" className="mt-4 lims-btn-primary">
                    {t("qualityCover.detail.actions.backToInbox")}
                </Link>
            </div>
        );
    }

    const sampleCode = data?.sample?.lab_sample_code ?? (data ? `#${data.sample_id}` : "—");
    const group = data?.sample?.workflow_group ?? data?.workflow_group ?? "-";
    const clientName = data?.sample?.client?.name ?? "-";
    const sampleId = data?.sample_id ?? null;

    return (
        <div className="min-h-[60vh]">
            {/* Breadcrumb */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/quality-covers/inbox/lh" className="lims-breadcrumb-link">
                        {t("qualityCover.detail.breadcrumbLh")}
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
                            <span className="text-[11px] text-gray-500">{t("qualityCover.detail.step.lh")}</span>
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

                {/* Flash banner */}
                {flash ? (
                    <div
                        className={cx(
                            "mt-4 rounded-2xl border px-4 py-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3",
                            flash.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
                            flash.type === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
                            flash.type === "error" && "border-rose-200 bg-rose-50 text-rose-900"
                        )}
                    >
                        <div className="leading-relaxed">
                            <div className="font-medium">{flash.message}</div>
                            {flash.reportId ? (
                                <div className="mt-1 text-xs">
                                    {t("qualityCover.detail.reportIdLabel")}: <span className="font-semibold">#{flash.reportId}</span>
                                </div>
                            ) : null}
                        </div>

                        <div className="flex items-center gap-2 justify-end">
                            <Link to="/reports" className="lims-icon-button" aria-label={`${t("open")} ${t("nav.reports")}`} title={`${t("open")} ${t("nav.reports")}`}>
                                <FileText size={16} />
                            </Link>

                            {flash.canDownload && flash.sampleId ? (
                                <button
                                    type="button"
                                    onClick={() => openCoaPdfBySample(flash.sampleId!, `COA_${flash.sampleId}.pdf`)}
                                    className="lims-icon-button"
                                    aria-label={`${t("download")} COA`}
                                    title={`${t("download")} COA`}
                                >
                                    <Download size={16} />
                                </button>
                            ) : null}

                            <button
                                type="button"
                                onClick={() => setFlash(null)}
                                className="lims-icon-button"
                                aria-label={t("dismiss")}
                                title={t("dismiss")}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>
                ) : null}

                {loading ? (
                    <div className="mt-4 text-sm text-gray-600">{t("qualityCover.detail.states.loading")}</div>
                ) : !data ? (
                    <div className="mt-4 text-sm text-gray-600">{t("qualityCover.detail.states.notFound")}</div>
                ) : (
                    <div className="mt-4 space-y-6">
                        {/* Error banner */}
                        {error ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                                {error}
                            </div>
                        ) : null}

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
                                        {t("qualityCover.detail.meta.verified")}:{" "}
                                        {data.verified_at ? formatDateTimeLocal(data.verified_at) : "-"}
                                    </div>
                                </div>
                            </div>
                        </div>

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
                        {data.status === "verified" ? (
                            <div className="flex gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode("validate");
                                        setError(null);
                                    }}
                                    className="lims-btn-primary inline-flex items-center gap-2"
                                    disabled={submitting}
                                >
                                    {t("qualityCover.detail.actions.validate")}
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
                                    {t("qualityCover.detail.actions.reject")}
                                </button>

                                <Link to="/quality-covers/inbox/lh" className="lims-btn">
                                    {t("qualityCover.detail.actions.backToInbox")}
                                </Link>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-600">{t("qualityCover.detail.hints.notInVerified")}</div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal */}
            <QualityCoverDecisionModal
                open={!!mode}
                mode={mode === "reject" ? "reject" : "approve"}
                title={mode === "reject" ? t("qualityCover.inbox.modal.rejectTitle") : t("qualityCover.inbox.modal.validateTitle")}
                subtitle={
                    data
                        ? t("qualityCover.inbox.modal.subtitle", { qcId: data.quality_cover_id, sampleId: data.sample_id })
                        : undefined
                }
                submitting={submitting}
                error={error}
                rejectReason={reason}
                onRejectReasonChange={setReason}
                approveHint={t("qualityCover.detail.hints.approveHintLh")}
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