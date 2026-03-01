import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import ReagentApprovalDecisionModal from "../../components/reagents/ReagentApprovalDecisionModal";
import {
    approveReagentRequest,
    rejectReagentRequest,
    getReagentApproverInbox,
    type ApproverInboxRow,
} from "../../services/reagentRequests";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function unwrapApi(res: any) {
    let x = res?.data ?? res;
    for (let i = 0; i < 5; i++) {
        if (x && typeof x === "object" && "data" in x && (x as any).data != null) {
            x = (x as any).data;
            continue;
        }
        break;
    }
    return x;
}

function statusTone(status?: string | null) {
    const s = String(status ?? "").toLowerCase();
    if (s === "submitted") return "bg-amber-100 text-amber-800";
    if (s === "approved") return "bg-emerald-100 text-emerald-800";
    if (s === "rejected" || s === "denied") return "bg-rose-100 text-rose-800";
    if (s === "draft") return "bg-slate-100 text-slate-800";
    return "bg-gray-100 text-gray-700";
}

export default function ReagentApprovalInboxPage() {
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [status, setStatus] = useState<"submitted" | "approved" | "rejected" | "draft" | "all">("submitted");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [perPage] = useState(25);

    const [rows, setRows] = useState<ApproverInboxRow[]>([]);
    const [meta, setMeta] = useState<{ page: number; per_page: number; total: number; total_pages: number } | null>(null);

    const [busyId, setBusyId] = useState<number | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"approve" | "reject">("approve");
    const [activeRow, setActiveRow] = useState<ApproverInboxRow | null>(null);

    function flash(msg: string) {
        setSuccess(msg);
        window.setTimeout(() => setSuccess(null), 2500);
    }

    const statusLabel = (s: string) => {
        const key = String(s ?? "").toLowerCase();
        const map: Record<string, string> = {
            submitted: t("reagents.status.submitted"),
            approved: t("reagents.status.approved"),
            rejected: t("reagents.status.rejected"),
            denied: t("reagents.status.rejected"),
            draft: t("reagents.status.draft"),
            all: t("reagents.approvals.filters.all"),
        };
        return map[key] ?? s;
    };

    async function load(opts?: { resetPage?: boolean }) {
        setErr(null);
        setSuccess(null);
        setLoading(true);

        const nextPage = opts?.resetPage ? 1 : page;

        try {
            const res = await getReagentApproverInbox({
                status,
                search: search.trim() || undefined,
                page: nextPage,
                per_page: perPage,
            });

            const payload = unwrapApi(res);

            const data: ApproverInboxRow[] = Array.isArray(payload?.data)
                ? payload.data
                : Array.isArray(payload)
                    ? payload
                    : [];

            setRows(data);
            setMeta(payload?.meta ?? null);

            if (opts?.resetPage) setPage(1);
        } catch (e: any) {
            setErr(getErrorMessage(e, t("reagents.errors.loadInboxFailed")));
            setRows([]);
            setMeta(null);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        setPage(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status, page]);

    const totalLabel = useMemo(() => {
        const n = meta?.total ?? rows.length;
        return String(n);
    }, [meta, rows.length]);

    const canPrev = page > 1;
    const canNext = meta?.total_pages ? page < meta.total_pages : rows.length === perPage;

    function openDecision(row: ApproverInboxRow, mode: "approve" | "reject") {
        setActiveRow(row);
        setModalMode(mode);
        setModalOpen(true);
    }

    async function confirmDecision(note?: string) {
        if (!activeRow?.reagent_request_id) return;

        setBusyId(activeRow.reagent_request_id);
        setErr(null);
        setSuccess(null);

        try {
            if (modalMode === "approve") {
                await approveReagentRequest(activeRow.reagent_request_id);
                flash(t("reagents.approvals.flashApprovedShort"));
            } else {
                const n = String(note ?? "").trim();
                if (n.length < 3) {
                    setErr(t("reagents.errors.rejectNoteMin"));
                    setBusyId(null);
                    return;
                }
                await rejectReagentRequest(activeRow.reagent_request_id, n);
                flash(t("reagents.approvals.flashRejectedShort"));
            }

            setModalOpen(false);
            await load();
        } catch (e: any) {
            setErr(getErrorMessage(e, t("reagents.errors.actionFailed", { action: modalMode })));
        } finally {
            setBusyId(null);
        }
    }

    function clearSearch() {
        setSearch("");
        load({ resetPage: true });
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("reagents.approvals.title")}</h1>
                    <p className="text-xs text-gray-500 mt-1">{t("reagents.approvals.subtitle")}</p>
                </div>

                <button
                    type="button"
                    onClick={() => load()}
                    className="lims-icon-button self-start md:self-auto"
                    aria-label={t("refresh")}
                    title={t("refresh")}
                    disabled={loading}
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Feedback */}
            {success && (
                <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 inline-flex items-center gap-2">
                    <CheckCircle2 size={18} />
                    {success}
                </div>
            )}
            {err && (
                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {err}
                </div>
            )}

            <div className="mt-3 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-end">
                    <div className="w-full md:w-60">
                        <label className="text-xs font-semibold text-gray-700" htmlFor="rr-status">
                            {t("reagents.approvals.filters.status")}
                        </label>
                        <select
                            id="rr-status"
                            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as any)}
                        >
                            <option value="submitted">{t("reagents.status.submitted")}</option>
                            <option value="approved">{t("reagents.status.approved")}</option>
                            <option value="rejected">{t("reagents.status.rejected")}</option>
                            <option value="draft">{t("reagents.status.draft")}</option>
                            <option value="all">{t("reagents.approvals.filters.all")}</option>
                        </select>
                    </div>

                    <div className="flex-1">
                        <label className="text-xs font-semibold text-gray-700" htmlFor="rr-search">
                            {t("search")}
                        </label>

                        <div className="mt-1 relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="rr-search"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={t("reagents.approvals.filters.searchPlaceholder")}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") load({ resetPage: true });
                                }}
                            />

                            {search.trim() ? (
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-lg px-2 text-gray-500 hover:text-gray-700"
                                    onClick={clearSearch}
                                    aria-label={t("reagents.approvals.filters.clearSearch")}
                                    title={t("reagents.approvals.filters.clearSearch")}
                                >
                                    <XCircle size={16} />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3">
                        <div className="text-xs text-gray-500">
                            {t("reagents.approvals.filters.total")}: <span className="font-semibold">{totalLabel}</span>
                        </div>

                        <button
                            type="button"
                            className="btn-outline inline-flex items-center gap-2"
                            onClick={() => load({ resetPage: true })}
                            disabled={loading}
                            aria-label={t("reagents.approvals.filters.apply")}
                            title={t("reagents.approvals.filters.apply")}
                        >
                            <Search size={16} />
                            {t("reagents.approvals.filters.apply")}
                        </button>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading ? (
                        <div className="text-sm text-gray-600">{t("reagents.loading.inbox")}</div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                            {t("reagents.approvals.empty")}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-white text-gray-700 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left font-semibold px-4 py-3">{t("reagents.approvals.table.loo")}</th>
                                        <th className="text-left font-semibold px-4 py-3">{t("status")}</th>
                                        <th className="text-left font-semibold px-4 py-3">{t("reagents.approvals.table.items")}</th>
                                        <th className="text-left font-semibold px-4 py-3">{t("reagents.approvals.table.bookings")}</th>
                                        <th className="text-left font-semibold px-4 py-3">{t("reagents.approvals.table.submitted")}</th>
                                        <th className="text-right font-semibold px-4 py-3">{t("actions")}</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-gray-100">
                                    {rows.map((r) => {
                                        const busy = busyId === r.reagent_request_id;
                                        const stRaw = String(r.status ?? "");
                                        const stLower = stRaw.toLowerCase();
                                        const canAct = stLower === "submitted";

                                        const loId = Number((r as any).lo_id ?? 0);

                                        return (
                                            <tr key={r.reagent_request_id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">
                                                        {r.loo_number ?? (loId > 0 ? `LOO #${loId}` : "LOO")}
                                                    </div>
                                                    <div className="text-[11px] text-gray-500">
                                                        req_id: {r.reagent_request_id} • {t("reagents.approvals.table.cycle")} {r.cycle_no}
                                                        {(r as any)?.client_name ? ` • ${(r as any).client_name}` : ""}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span
                                                        className={cx(
                                                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                                                            statusTone(stLower)
                                                        )}
                                                    >
                                                        {statusLabel(stLower || "—")}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">{r.items_count ?? 0}</td>
                                                <td className="px-4 py-3 text-gray-700">{r.bookings_count ?? 0}</td>

                                                <td className="px-4 py-3 text-gray-700">
                                                    {r.submitted_at ? formatDateTimeLocal(r.submitted_at) : "—"}
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <Link
                                                            to={`/reagents/approvals/loo/${loId}`}
                                                            className={cx("lims-icon-button", loId > 0 ? "" : "opacity-40 cursor-not-allowed")}
                                                            aria-label={t("view")}
                                                            title={loId > 0 ? t("reagents.approvals.actions.viewDetail") : t("reagents.errors.missingLooId")}
                                                            onClick={(e) => {
                                                                if (!(loId > 0)) e.preventDefault();
                                                            }}
                                                        >
                                                            <Eye size={16} />
                                                        </Link>

                                                        {canAct ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className={cx("lims-icon-button", busy && "opacity-40 cursor-not-allowed")}
                                                                    onClick={() => openDecision(r, "approve")}
                                                                    aria-label={t("approve")}
                                                                    title={t("approve")}
                                                                >
                                                                    <CheckCircle2 size={16} />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className={cx(
                                                                        "lims-icon-button lims-icon-button--danger",
                                                                        busy && "opacity-40 cursor-not-allowed"
                                                                    )}
                                                                    onClick={() => openDecision(r, "reject")}
                                                                    aria-label={t("reject")}
                                                                    title={t("reject")}
                                                                >
                                                                    <XCircle size={16} />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-gray-400">—</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    <div className="mt-4 flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                            {t("reagents.approvals.pagination.page")} <span className="font-semibold">{page}</span>
                            {meta?.total_pages ? (
                                <>
                                    {" "}
                                    / <span className="font-semibold">{meta.total_pages}</span>
                                </>
                            ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className={cx("lims-icon-button", (!canPrev || loading) && "opacity-40 cursor-not-allowed")}
                                disabled={!canPrev || loading}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                aria-label={t("prev")}
                                title={t("prev")}
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <button
                                type="button"
                                className={cx("lims-icon-button", (!canNext || loading) && "opacity-40 cursor-not-allowed")}
                                disabled={!canNext || loading}
                                onClick={() => setPage((p) => p + 1)}
                                aria-label={t("next")}
                                title={t("next")}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <ReagentApprovalDecisionModal
                open={modalOpen}
                mode={modalMode}
                busy={busyId != null}
                request={activeRow as any}
                looNumber={(activeRow as any)?.loo_number ?? null}
                clientName={(activeRow as any)?.client_name ?? null}
                itemsCount={(activeRow as any)?.items_count ?? 0}
                bookingsCount={(activeRow as any)?.bookings_count ?? 0}
                onClose={() => (busyId != null ? null : setModalOpen(false))}
                onConfirm={confirmDecision}
            />
        </div>
    );
}
