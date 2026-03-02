import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, Send, X } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";

import { listReportDocuments, type ReportDocumentRow } from "../../services/reportDocuments";
import { ReportPreviewModal } from "../../components/reports/ReportPreviewModal";

import { markCoaChecked, releaseCoaToClient } from "../../services/reportDelivery";

type DateFilter = "all" | "today" | "7d" | "30d";
const DOC_PAGE_SIZE = 12;

type UnifiedDoc = {
    key: string;

    documentName: string;
    typeCode: string;
    codeOrNumber: string;
    generatedAt: string | null;

    status: string | null;
    pdfUrl: string | null;

    // COA delivery (optional; only for COA)
    reportId?: number | null;
    coa_checked_at?: string | null;
    coa_released_to_client_at?: string | null;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function resolvePublicFileUrl(fileUrl: string): string {
    if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
    if (fileUrl.startsWith("/")) return fileUrl;
    return `/storage/${fileUrl}`;
}

function isWithinDateFilter(iso: string | null | undefined, filter: DateFilter): boolean {
    if (!iso || filter === "all") return true;

    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return true;

    const now = new Date();
    const t = dt.getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    if (filter === "today") return t >= startOfToday;
    if (filter === "7d") return t >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
    if (filter === "30d") return t >= now.getTime() - 30 * 24 * 60 * 60 * 1000;

    return true;
}

function normalizeText(v: any): string | null {
    const raw = String(v ?? "").trim();
    return raw ? raw : null;
}

function formatStatusLabel(value: any, t: any): string {
    const s = String(value ?? "").trim().toLowerCase();

    if (s === "locked") return t("reports.status.locked", "Locked");
    if (s === "draft") return t("reports.status.draft", "Draft");
    if (s === "generated") return t("reports.status.generated", "Generated");
    if (s === "approved") return t("reports.status.approved", "Approved");
    if (s === "rejected") return t("reports.status.rejected", "Rejected");

    if (!s) return t(["na", "common.na"], "—");
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function isCoaDoc(doc: UnifiedDoc) {
    const tc = String(doc.typeCode ?? "").toUpperCase();
    const nm = String(doc.documentName ?? "").toUpperCase();
    return tc === "COA" || nm.startsWith("COA ");
}

function coaDeliveryLabel(checkedAt: string | null, releasedAt: string | null, t: any): string {
    if (releasedAt) return t("reports.coa.delivery.released", "Released to client");
    if (checkedAt) return t("reports.coa.delivery.checked", "Checked (pending send)");
    return t("reports.coa.delivery.pending", "Generated (pending admin)");
}

function unwrapUpdated(payload: any) {
    // our service usually returns {data} or direct object; support both
    return payload?.data ?? payload;
}

export const ReportsPage = () => {
    const { t } = useTranslation();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewReports = !!roleId && roleId !== ROLE_ID.CLIENT;
    const isAdmin = roleId === ROLE_ID.ADMIN;

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // FE override for COA state (because /documents may not reflect latest immediately)
    const [coaOverride, setCoaOverride] = useState<Record<number, { checkedAt?: string | null; releasedAt?: string | null }>>(
        {}
    );

    const [reportDocs, setReportDocs] = useState<ReportDocumentRow[]>([]);

    const [searchTerm, setSearchTerm] = useState("");
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [page, setPage] = useState(1);

    // preview modal
    const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
    const [previewTitle, setPreviewTitle] = useState<string>(t("reports.pdfPreviewTitle", "PDF Preview"));
    const [previewOpen, setPreviewOpen] = useState(false);

    // send modal
    const [sendOpen, setSendOpen] = useState(false);
    const [sendNote, setSendNote] = useState("");
    const [sendTarget, setSendTarget] = useState<UnifiedDoc | null>(null);
    const [actionBusy, setActionBusy] = useState(false);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);

            const docs = await listReportDocuments();
            setReportDocs(docs ?? []);
            setPage(1);
        } catch (err: any) {
            setError(getErrorMessage(err) || t("reports.loadError", "Failed to load reports."));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!canViewReports) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canViewReports]);

    const unifiedDocs: UnifiedDoc[] = useMemo(() => {
        const all: UnifiedDoc[] = (reportDocs ?? []).map((d: any) => {
            const docFallback = t(["document", "common.document"], "Document");
            const docName = (d.document_name ?? d.type ?? docFallback).trim() || docFallback;

            const typeCode = (String(d.type ?? "").trim().toUpperCase() || "DOC") as string;
            const code =
                String(d.document_code ?? d.number ?? t(["na", "common.na"], "—")).trim() || t(["na", "common.na"], "—");

            const rawUrl = (d.download_url ?? d.file_url ?? null) as any;

            return {
                key: `doc:${typeCode}:${d.id ?? d.gen_doc_id ?? code}:${d.generated_at ?? d.created_at ?? "x"}`,
                documentName: docName,
                typeCode,
                codeOrNumber: code,
                generatedAt: (d.generated_at ?? d.created_at ?? null) as any,
                status: normalizeText(d.status),
                pdfUrl: rawUrl ? String(rawUrl) : null,

                reportId: typeof d.report_id === "number" ? d.report_id : d.report_id ? Number(d.report_id) : null,
                coa_checked_at: (d.coa_checked_at ?? null) as any,
                coa_released_to_client_at: (d.coa_released_to_client_at ?? null) as any,
            };
        });

        const q = searchTerm.trim().toLowerCase();
        const filtered = all.filter((x) => {
            if (!isWithinDateFilter(x.generatedAt, dateFilter)) return false;
            if (!q) return true;

            const extra = isCoaDoc(x) ? `${x.coa_checked_at ?? ""} ${x.coa_released_to_client_at ?? ""}` : "";
            const hay = `${x.documentName} ${x.typeCode} ${x.codeOrNumber} ${x.status ?? ""} ${extra}`.toLowerCase();
            return hay.includes(q);
        });

        filtered.sort((a, b) => {
            const ta = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
            const tb = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
            return tb - ta;
        });

        return filtered;
    }, [reportDocs, searchTerm, dateFilter, t]);

    const total = unifiedDocs.length;
    const totalPages = Math.max(1, Math.ceil(total / DOC_PAGE_SIZE));
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const pageItems = unifiedDocs.slice((clampedPage - 1) * DOC_PAGE_SIZE, clampedPage * DOC_PAGE_SIZE);

    const canPrev = clampedPage > 1;
    const canNext = clampedPage < totalPages;

    const from = total === 0 ? 0 : (clampedPage - 1) * DOC_PAGE_SIZE + 1;
    const to = Math.min(clampedPage * DOC_PAGE_SIZE, total);

    const openDoc = (d: UnifiedDoc) => {
        const raw = String(d.pdfUrl ?? "").trim();
        if (!raw) return;

        const url = resolvePublicFileUrl(raw);
        setPreviewPdfUrl(url);
        setPreviewTitle(t("reports.previewDocTitle", "{{name}} — Preview", { name: d.documentName }));
        setPreviewOpen(true);
    };

    const doCheck = async (d: UnifiedDoc) => {
        if (!isAdmin) return;
        if (!d.reportId) {
            alert("Missing report_id for this COA row. Fix backend /v1/reports/documents to include report_id.");
            return;
        }

        try {
            setActionBusy(true);

            const raw = await markCoaChecked(d.reportId);
            const updated = unwrapUpdated(raw);

            const rid = Number(updated?.report_id ?? d.reportId);

            setCoaOverride((prev) => ({
                ...prev,
                [rid]: {
                    ...(prev[rid] ?? {}),
                    checkedAt: updated?.coa_checked_at ?? new Date().toISOString(),
                },
            }));

            await load();
        } finally {
            setActionBusy(false);
        }
    };

    const openSendModal = (d: UnifiedDoc) => {
        setSendTarget(d);
        setSendNote("");
        setSendOpen(true);
    };

    const doSend = async () => {
        if (!sendTarget) return;
        if (!isAdmin) return;

        if (!sendTarget.reportId) {
            alert("Missing report_id for this COA row. Fix backend /v1/reports/documents to include report_id.");
            return;
        }

        try {
            setActionBusy(true);

            const raw = await releaseCoaToClient(sendTarget.reportId, sendNote.trim() || null);
            const updated = unwrapUpdated(raw);

            const rid = Number(updated?.report_id ?? sendTarget.reportId);

            setCoaOverride((prev) => ({
                ...prev,
                [rid]: {
                    ...(prev[rid] ?? {}),
                    // release endpoint may auto-check too
                    checkedAt: updated?.coa_checked_at ?? prev[rid]?.checkedAt ?? new Date().toISOString(),
                    releasedAt: updated?.coa_released_to_client_at ?? new Date().toISOString(),
                },
            }));

            setSendOpen(false);
            setSendTarget(null);
            setSendNote("");

            await load();
        } finally {
            setActionBusy(false);
        }
    };

    if (!canViewReports) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    {t(["errors.accessDeniedTitle", "accessDeniedTitle"], "403 – Access denied")}
                </h1>
                <p className="text-sm text-gray-600 text-center">
                    {t(
                        ["errors.accessDeniedBodyWithRole", "accessDeniedBodyWithRole"],
                        "Your role ({{role}}) is not allowed to access reports.",
                        { role: roleLabel }
                    )}
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("reports.title", "Reports")}</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        {t("reports.subtitle", "All PDF documents (LOO, Reagent Request, COA, etc).")}
                    </p>
                </div>

                <button
                    type="button"
                    className="lims-icon-button self-start md:self-auto"
                    onClick={load}
                    aria-label={t(["refresh", "common.refresh"], "Refresh")}
                    title={t(["refresh", "common.refresh"], "Refresh")}
                    disabled={loading}
                >
                    <RefreshCw size={16} className={cx(loading && "animate-spin")} />
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="doc-search">
                            {t("reports.filters.searchLabel", "Search documents")}
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="doc-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setPage(1);
                                }}
                                placeholder={t("reports.filters.searchPlaceholder", "Search by document name / code / status…")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="sr-only" htmlFor="doc-date-filter">
                            {t("reports.filters.dateFilterLabel", "Date filter")}
                        </label>
                        <select
                            id="doc-date-filter"
                            value={dateFilter}
                            onChange={(e) => {
                                setDateFilter(e.target.value as DateFilter);
                                setPage(1);
                            }}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("reports.filters.allDates", "All dates")}</option>
                            <option value="today">{t("reports.filters.today", "Today")}</option>
                            <option value="7d">{t("reports.filters.last7d", "Last 7 days")}</option>
                            <option value="30d">{t("reports.filters.last30d", "Last 30 days")}</option>
                        </select>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {error && !loading ? <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div> : null}

                    {loading ? (
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                            <span>{t(["loading", "common.loading", "reports.loading"], "Loading…")}</span>
                        </div>
                    ) : pageItems.length === 0 ? (
                        <div className="text-sm text-gray-600">{t("reports.emptyTitle", "No documents found.")}</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">{t("reports.table.document", "Document")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("reports.table.codeNumber", "Code / Number")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("reports.table.generated", "Generated")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("reports.table.status", "Status")}</th>
                                            <th className="text-right font-semibold px-4 py-3">{t(["actions", "common.actions"], "Actions")}</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {pageItems.map((d) => {
                                            const disabledView = !String(d.pdfUrl ?? "").trim();
                                            const coa = isCoaDoc(d);

                                            const ov = d.reportId ? coaOverride[d.reportId] : undefined;
                                            const effectiveCheckedAt = d.coa_checked_at ?? ov?.checkedAt ?? null;
                                            const effectiveReleasedAt = d.coa_released_to_client_at ?? ov?.releasedAt ?? null;

                                            const canCheck = isAdmin && coa && !effectiveCheckedAt && !!d.reportId && !actionBusy;
                                            const canSend = isAdmin && coa && !!effectiveCheckedAt && !effectiveReleasedAt && !!d.reportId && !actionBusy;

                                            return (
                                                <tr key={d.key} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-900">
                                                        <div className="font-medium">{d.documentName}</div>
                                                        <div className="text-xs text-gray-500">{d.typeCode}</div>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <span className="font-mono text-xs">{d.codeOrNumber}</span>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        {d.generatedAt ? formatDateTimeLocal(d.generatedAt) : t(["na", "common.na"], "—")}
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        {coa ? coaDeliveryLabel(effectiveCheckedAt, effectiveReleasedAt, t) : formatStatusLabel(d.status, t)}
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {coa ? (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        aria-label={t("reports.coa.actions.check", "Mark checked")}
                                                                        title={t("reports.coa.actions.check", "Mark checked")}
                                                                        onClick={() => doCheck(d)}
                                                                        disabled={!canCheck}
                                                                    >
                                                                        <CheckCircle2 size={16} />
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                                                        aria-label={t("reports.coa.actions.send", "Release to client")}
                                                                        title={t("reports.coa.actions.send", "Release to client")}
                                                                        onClick={() => openSendModal(d)}
                                                                        disabled={!canSend}
                                                                    >
                                                                        <Send size={16} />
                                                                    </button>
                                                                </>
                                                            ) : null}

                                                            <button
                                                                type="button"
                                                                className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                                                aria-label={t(["view", "common.view"], "View")}
                                                                title={t(["view", "common.view"], "View")}
                                                                onClick={() => openDoc(d)}
                                                                disabled={disabledView}
                                                            >
                                                                <Eye size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    {t("reports.pagination.showing", "Showing {{from}} to {{to}} of {{total}}", { from, to, total })}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={!canPrev}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label={t(["prev", "common.prev"], "Prev")}
                                        title={t(["prev", "common.prev"], "Prev")}
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    <div className="text-xs text-gray-600">
                                        {t("reports.pagination.page", "Page {{page}} / {{totalPages}}", { page: clampedPage, totalPages })}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={!canNext}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label={t(["next", "common.next"], "Next")}
                                        title={t(["next", "common.next"], "Next")}
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* PDF preview */}
            <ReportPreviewModal
                open={previewOpen}
                onClose={() => {
                    setPreviewOpen(false);
                    setPreviewPdfUrl(null);
                }}
                pdfUrl={previewPdfUrl}
                title={previewTitle}
            />

            {/* Inline send modal */}
            {sendOpen ? (
                <div
                    className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4"
                    onClick={() => !actionBusy && setSendOpen(false)}
                >
                    <div
                        className="bg-white w-full max-w-lg rounded-2xl shadow-lg border border-gray-200 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-4 py-3 border-b flex items-center justify-between">
                            <div className="font-semibold text-sm text-gray-900">
                                {t("reports.coa.release.title", "Release COA to client")}
                            </div>
                            <button
                                className="lims-icon-button"
                                type="button"
                                onClick={() => !actionBusy && setSendOpen(false)}
                                title={t("close", "Close")}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="px-4 py-4">
                            <div className="text-sm text-gray-700">
                                {t("reports.coa.release.hint", "Optional note (will be saved as release note).")}
                            </div>

                            <textarea
                                value={sendNote}
                                onChange={(e) => setSendNote(e.target.value)}
                                rows={4}
                                className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={t("reports.coa.release.notePlaceholder", "e.g. Please see attached COA…")}
                                disabled={actionBusy}
                            />

                            <div className="mt-4 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    className="btn-outline"
                                    onClick={() => setSendOpen(false)}
                                    disabled={actionBusy}
                                >
                                    {t("cancel", "Cancel")}
                                </button>
                                <button
                                    type="button"
                                    className="lims-btn-primary inline-flex items-center gap-2"
                                    onClick={doSend}
                                    disabled={actionBusy}
                                >
                                    <Send size={16} />
                                    {t("reports.coa.release.action", "Release")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
};