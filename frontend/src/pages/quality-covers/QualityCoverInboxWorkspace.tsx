import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
    Check,
    ChevronLeft,
    ChevronRight,
    Download,
    FileText,
    Loader2,
    RefreshCw,
    Search,
    X,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
    getQualityCoverById,
    listLhInbox,
    listOmInbox,
    lhReject,
    lhValidate,
    omReject,
    omVerify,
    type InboxMeta,
    type QualityCoverInboxItem,
    type LhValidateResponse,
} from "../../services/qualityCovers";
import { formatDateTimeLocal } from "../../utils/date";
import { openCoaPdfBySample } from "../../services/coa";
import { QualityCoverDecisionModal } from "../../components/quality-covers/QualityCoverDecisionModal";
import { QualityCoverDetailBody } from "../../components/quality-covers/QualityCoverDetailBody";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Mode = "om" | "lh";

type FlashPayload = {
    type: "success" | "warning" | "error";
    message: string;
    sampleId?: number;
    canDownload?: boolean;
    reportId?: number | null;
};

type DecisionState =
    | { open: false }
    | {
        open: true;
        mode: "approve" | "reject";
        item: QualityCoverInboxItem;
        reason: string;
        submitting: boolean;
        error?: string | null;
    };

type Props = {
    mode: Mode;
    initialSelectedId?: number | null;
    initialFlash?: FlashPayload | null;
};

function asInt(x: any): number | null {
    const n = Number(x);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function QualityCoverInboxWorkspace(props: Props) {
    const { mode, initialSelectedId, initialFlash } = props;
    const { t } = useTranslation();
    const location = useLocation();

    // --- list state
    const [rows, setRows] = useState<QualityCoverInboxItem[]>([]);
    const [meta, setMeta] = useState<InboxMeta | null>(null);
    const [loadingList, setLoadingList] = useState(false);

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const perPage = 25;

    // --- detail state
    const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? null);
    const [detail, setDetail] = useState<QualityCoverInboxItem | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // --- modal + feedback state
    const [decision, setDecision] = useState<DecisionState>({ open: false });
    const [flash, setFlash] = useState<FlashPayload | null>(initialFlash ?? null);

    const canPrev = !!meta && meta.current_page > 1;
    const canNext = !!meta && meta.current_page < meta.last_page;

    const totalText = useMemo(() => {
        if (!meta) return "";
        return t("qualityCover.inbox.totalText", {
            total: meta.total,
            page: meta.current_page,
            pages: meta.last_page,
        });
    }, [meta, t]);

    const titles = useMemo(() => {
        return mode === "om"
            ? {
                pageTitle: t("qualityCover.inbox.title"),
                subtitle: t("qualityCover.inbox.omSubtitle"),
                approveLabel: t("verify"),
                approveTitle: t("qualityCover.inbox.modal.verifyTitle"),
                approveHint: t("qualityCover.detail.hints.approveHintOm"),
                stepLabel: t("qualityCover.detail.step.om"),
                inboxPath: "/quality-covers/inbox/om",
            }
            : {
                pageTitle: t("qualityCover.inbox.title"),
                subtitle: t("qualityCover.inbox.lhSubtitle"),
                approveLabel: t("validate"),
                approveTitle: t("qualityCover.inbox.modal.validateTitle"),
                approveHint: t("qualityCover.detail.hints.approveHintLh"),
                stepLabel: t("qualityCover.detail.step.lh"),
                inboxPath: "/quality-covers/inbox/lh",
            };
    }, [mode, t]);

    const fetchList = useCallback(
        async (opts?: { resetPage?: boolean; silent?: boolean }) => {
            const nextPage = opts?.resetPage ? 1 : page;

            if (!opts?.silent) setLoadingList(true);
            try {
                const fn = mode === "om" ? listOmInbox : listLhInbox;
                const res = await fn({ search: search.trim() || undefined, page: nextPage, per_page: perPage });
                setRows(res.data ?? []);
                setMeta(res.meta ?? null);
                if (opts?.resetPage) setPage(1);
            } finally {
                if (!opts?.silent) setLoadingList(false);
            }
        },
        [mode, page, perPage, search]
    );

    const fetchDetail = useCallback(
        async (id: number, opts?: { silent?: boolean }) => {
            if (!opts?.silent) setLoadingDetail(true);
            try {
                const qc = await getQualityCoverById(id);
                setDetail(qc ?? null);
            } catch {
                setDetail(null);
            } finally {
                if (!opts?.silent) setLoadingDetail(false);
            }
        },
        []
    );

    // initial: read state from redirect detail page
    useEffect(() => {
        const st = (location.state as any) ?? {};
        const preselect = asInt(st?.preselectId ?? st?.selectedId ?? null);
        const incomingFlash = st?.flash as FlashPayload | undefined;

        if (preselect) setSelectedId(preselect);
        if (incomingFlash && typeof incomingFlash.message === "string") setFlash(incomingFlash);

        // clean navigation state (avoid re-applying on back/forward)
        // NOTE: we can't "replace" from here safely without navigate. So we just ignore repeats.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // list loading
    useEffect(() => {
        fetchList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    // detail loading on selection
    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            return;
        }
        fetchDetail(selectedId);
    }, [selectedId, fetchDetail]);

    // auto dismiss flash
    useEffect(() => {
        if (!flash) return;
        const tmr = window.setTimeout(() => setFlash(null), 9000);
        return () => window.clearTimeout(tmr);
    }, [flash]);

    function openApprove(item: QualityCoverInboxItem) {
        setDecision({ open: true, mode: "approve", item, reason: "", submitting: false, error: null });
    }

    function openReject(item: QualityCoverInboxItem) {
        setDecision({ open: true, mode: "reject", item, reason: "", submitting: false, error: null });
    }

    function closeModal() {
        setDecision({ open: false });
    }

    async function submitDecision() {
        if (!decision.open) return;

        if (decision.mode === "reject" && !decision.reason.trim()) {
            setDecision({ ...decision, error: t("qualityCover.inbox.modal.errors.rejectReasonRequired") });
            return;
        }

        setDecision({ ...decision, submitting: true, error: null });

        try {
            const qcId = decision.item.quality_cover_id;
            const sampleId = decision.item.sample_id;

            if (decision.mode === "approve") {
                if (mode === "om") {
                    await omVerify(qcId);
                    setFlash({
                        type: "success",
                        message: t("qualityCover.detail.flash.verifiedOk") || t("qualityCover.detail.flash.validatedOk"),
                        sampleId,
                        canDownload: false,
                        reportId: null,
                    });
                } else {
                    const res = (await lhValidate(qcId)) as LhValidateResponse;

                    const qc = res?.data?.quality_cover ?? null;
                    const report = res?.data?.report ?? null;
                    const coaError = res?.data?.coa_error ?? null;
                    const sid = qc?.sample_id ?? sampleId;

                    if (report && typeof report.report_id === "number" && report.report_id > 0) {
                        setFlash({
                            type: "success",
                            message: t("qualityCover.detail.flash.validatedOk"),
                            sampleId: sid,
                            canDownload: true,
                            reportId: report.report_id,
                        });
                    } else {
                        setFlash({
                            type: "warning",
                            message: coaError || res?.message || t("qualityCover.detail.flash.validatedWarn"),
                            sampleId: sid,
                            canDownload: false,
                            reportId: null,
                        });
                    }
                }
            } else {
                if (mode === "om") await omReject(qcId, decision.reason.trim());
                else await lhReject(qcId, decision.reason.trim());

                setFlash({
                    type: "success",
                    message: t("qualityCover.detail.flash.rejected"),
                    sampleId,
                    canDownload: false,
                    reportId: null,
                });
            }

            closeModal();

            // refresh list + detail (silent)
            await fetchList({ silent: true });
            if (selectedId) await fetchDetail(selectedId, { silent: true });

            // if item status changed and disappears from inbox, keep selection but detail may still exist (OK)
        } catch (e: any) {
            setDecision({
                ...decision,
                submitting: false,
                error: e?.message || t("qualityCover.inbox.modal.errors.submitFailed"),
            });
        }
    }

    const searchHasValue = search.trim().length > 0;

    const selectedRow = useMemo(() => {
        if (!selectedId) return null;
        return rows.find((r) => Number(r.quality_cover_id) === Number(selectedId)) ?? null;
    }, [rows, selectedId]);

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{titles.pageTitle}</h1>
                    <p className="text-xs text-gray-500 mt-1">{titles.subtitle}</p>
                </div>

                <button
                    type="button"
                    className="lims-icon-button self-start md:self-auto"
                    onClick={() => fetchList({ resetPage: false })}
                    aria-label={t("refresh")}
                    title={t("refresh")}
                    disabled={loadingList}
                >
                    {loadingList ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                </button>
            </div>

            {/* Flash banner */}
            {flash ? (
                <div
                    className={cx(
                        "mt-2 rounded-2xl border px-4 py-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3",
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

                        <Link
                            to="/reports"
                            className="lims-icon-button"
                            aria-label={`${t("open")} ${t("nav.reports")}`}
                            title={`${t("open")} ${t("nav.reports")}`}
                        >
                            <FileText size={16} />
                        </Link>

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

            <div className="mt-3 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor={`qc-search-${mode}`}>
                            {t("search")}
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id={`qc-search-${mode}`}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && fetchList({ resetPage: true })}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={t("qualityCover.inbox.searchPlaceholder")}
                            />

                            {searchHasValue ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch("");
                                        setPage(1);
                                        void fetchList({ resetPage: true });
                                    }}
                                    className="absolute inset-y-0 right-2 flex items-center justify-center text-gray-500 hover:text-gray-700"
                                    aria-label={t("clear")}
                                    title={t("clear")}
                                    disabled={loadingList}
                                >
                                    <X size={16} />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3">
                        <div className="text-xs text-gray-500">{loadingList ? t("loading") : totalText}</div>

                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={() => fetchList({ resetPage: true })}
                            aria-label={t("search")}
                            title={t("search")}
                            disabled={loadingList}
                        >
                            <Search size={16} />
                        </button>
                    </div>
                </div>

                {/* Workspace */}
                <div className="grid grid-cols-1 md:grid-cols-[360px_1fr]">
                    {/* Left: list */}
                    <div className="border-b md:border-b-0 md:border-r border-gray-100">
                        <div className="p-3 md:p-4">
                            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-white text-gray-700 border-b border-gray-100">
                                            <tr>
                                                <th className="text-left font-semibold px-4 py-3">{t("qualityCover.inbox.table.sample")}</th>
                                                <th className="text-right font-semibold px-4 py-3">{t("qualityCover.inbox.table.actions")}</th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-gray-100">
                                            {rows.length === 0 && !loadingList ? (
                                                <tr>
                                                    <td className="px-4 py-8 text-gray-500" colSpan={2}>
                                                        {mode === "om"
                                                            ? t("qualityCover.inbox.table.emptyOm")
                                                            : t("qualityCover.inbox.table.emptyLh")}
                                                    </td>
                                                </tr>
                                            ) : null}

                                            {rows.map((r) => {
                                                const sid = r.sample_id;
                                                const sampleCode = r.sample?.lab_sample_code ?? `#${sid}`;
                                                const group = r.sample?.workflow_group ?? r.workflow_group ?? "-";

                                                const when =
                                                    mode === "om"
                                                        ? (r.submitted_at ? formatDateTimeLocal(r.submitted_at) : "-")
                                                        : (r.verified_at ? formatDateTimeLocal(r.verified_at) : "-");

                                                const who =
                                                    mode === "om"
                                                        ? (r.checked_by?.name ?? "-")
                                                        : (r.verified_by?.name ?? "-");

                                                const isSelected = Number(selectedId) === Number(r.quality_cover_id);

                                                return (
                                                    <tr
                                                        key={r.quality_cover_id}
                                                        className={cx(
                                                            "cursor-pointer hover:bg-gray-50",
                                                            isSelected && "bg-emerald-50/40"
                                                        )}
                                                        onClick={() => setSelectedId(r.quality_cover_id)}
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="font-semibold text-gray-900">{sampleCode}</div>
                                                            <div className="text-xs text-gray-500 mt-0.5">
                                                                QC #{r.quality_cover_id} • {group}
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-0.5">
                                                                {mode === "om"
                                                                    ? `${t("qualityCover.inbox.table.submitted")}: ${when} • ${t("qualityCover.inbox.table.checkedBy")}: ${who}`
                                                                    : `${t("qualityCover.inbox.table.verified")}: ${when} • ${t("qualityCover.inbox.table.verifiedBy")}: ${who}`}
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3">
                                                            <div className="flex justify-end gap-2">
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openApprove(r);
                                                                    }}
                                                                    aria-label={titles.approveLabel}
                                                                    title={titles.approveLabel}
                                                                    disabled={loadingList}
                                                                >
                                                                    <Check size={16} />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button lims-icon-button--danger"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openReject(r);
                                                                    }}
                                                                    aria-label={t("reject")}
                                                                    title={t("reject")}
                                                                    disabled={loadingList}
                                                                >
                                                                    <X size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                                    <div className="text-xs text-gray-500">
                                        {t("pageOf", { page: meta?.current_page ?? 1, totalPages: meta?.last_page ?? 1 })}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            disabled={!canPrev || loadingList}
                                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                                            className={cx("lims-icon-button", (!canPrev || loadingList) && "opacity-40 cursor-not-allowed")}
                                            aria-label={t("prev")}
                                            title={t("prev")}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        <button
                                            disabled={!canNext || loadingList}
                                            onClick={() => setPage((p) => p + 1)}
                                            className={cx("lims-icon-button", (!canNext || loadingList) && "opacity-40 cursor-not-allowed")}
                                            aria-label={t("next")}
                                            title={t("next")}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: detail */}
                    <div className="p-3 md:p-4">
                        {!selectedId ? (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                                {t("qualityCover.detail.states.notFound")}
                            </div>
                        ) : loadingDetail ? (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <Loader2 size={16} className="animate-spin" />
                                {t("loading")}
                            </div>
                        ) : !detail ? (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600">
                                {t("qualityCover.detail.states.notFound")}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <QualityCoverDetailBody data={detail} stepLabel={titles.stepLabel} />

                                {/* Actions (secondary place, optional) */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        className="lims-btn-primary inline-flex items-center gap-2"
                                        onClick={() => openApprove(detail)}
                                        disabled={decision.open && (decision as any)?.submitting}
                                        title={titles.approveLabel}
                                        aria-label={titles.approveLabel}
                                    >
                                        <Check size={16} />
                                        {titles.approveLabel}
                                    </button>

                                    <button
                                        type="button"
                                        className="lims-btn-danger inline-flex items-center gap-2"
                                        onClick={() => openReject(detail)}
                                        disabled={decision.open && (decision as any)?.submitting}
                                        title={t("reject")}
                                        aria-label={t("reject")}
                                    >
                                        <X size={16} />
                                        {t("reject")}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Decision Modal */}
            <QualityCoverDecisionModal
                open={decision.open}
                mode={decision.open ? decision.mode : "approve"}
                title={
                    decision.open
                        ? decision.mode === "approve"
                            ? titles.approveTitle
                            : t("qualityCover.inbox.modal.rejectTitle")
                        : titles.approveTitle
                }
                subtitle={
                    decision.open
                        ? t("qualityCover.inbox.modal.subtitle", {
                            qcId: decision.item.quality_cover_id,
                            sampleId: decision.item.sample_id,
                        })
                        : null
                }
                submitting={decision.open ? decision.submitting : false}
                error={decision.open ? decision.error ?? null : null}
                rejectReason={decision.open ? decision.reason : ""}
                onRejectReasonChange={(v) => {
                    if (!decision.open) return;
                    setDecision({ ...decision, reason: v });
                }}
                approveHint={titles.approveHint}
                onClose={closeModal}
                onConfirm={submitDecision}
            />
        </div>
    );
}