import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Eye, RefreshCw, Search, X } from "lucide-react";

import { listOmInbox, omReject, omVerify, QualityCoverInboxItem, InboxMeta } from "../../services/qualityCovers";
import { formatDateTimeLocal } from "../../utils/date";
import { QualityCoverDecisionModal } from "../../components/quality-covers/QualityCoverDecisionModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

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

export function QualityCoverOmInboxPage() {
    const [rows, setRows] = useState<QualityCoverInboxItem[]>([]);
    const [meta, setMeta] = useState<InboxMeta | null>(null);
    const [loading, setLoading] = useState(false);

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const perPage = 25;

    const [decision, setDecision] = useState<DecisionState>({ open: false });

    const canPrev = !!meta && meta.current_page > 1;
    const canNext = !!meta && meta.current_page < meta.last_page;

    async function fetchData(opts?: { resetPage?: boolean }) {
        const nextPage = opts?.resetPage ? 1 : page;

        setLoading(true);
        try {
            const res = await listOmInbox({ search: search.trim() || undefined, page: nextPage, per_page: perPage });
            setRows(res.data ?? []);
            setMeta(res.meta ?? null);
            if (opts?.resetPage) setPage(1);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page]);

    const totalText = useMemo(() => {
        if (!meta) return "";
        return `${meta.total} items • page ${meta.current_page}/${meta.last_page}`;
    }, [meta]);

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
            setDecision({ ...decision, error: "Reject reason is required." });
            return;
        }

        setDecision({ ...decision, submitting: true, error: null });

        try {
            const id = decision.item.quality_cover_id;

            if (decision.mode === "approve") {
                await omVerify(id);
            } else {
                await omReject(id, decision.reason.trim());
            }

            closeModal();
            await fetchData();
        } catch (e: any) {
            setDecision({ ...decision, submitting: false, error: e?.message || "Failed to submit decision." });
        }
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Quality Cover Inbox</h1>
                    <p className="text-xs text-gray-500 mt-1">OM — Submitted covers waiting for verification.</p>
                </div>

                <button
                    type="button"
                    className="lims-icon-button self-start md:self-auto"
                    onClick={() => fetchData()}
                    aria-label="Refresh"
                    title="Refresh"
                    disabled={loading}
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="qc-search-om">
                            Search
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="qc-search-om"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") fetchData({ resetPage: true });
                                }}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder="Search sample code / client..."
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-3">
                        <div className="text-xs text-gray-500">{loading ? "Loading..." : totalText}</div>

                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={() => fetchData({ resetPage: true })}
                            aria-label="Apply search"
                            title="Apply search"
                            disabled={loading}
                        >
                            <Search size={16} />
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div className="px-4 md:px-6 py-4">
                    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-white text-gray-700 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left font-semibold px-4 py-3">Sample</th>
                                        <th className="text-left font-semibold px-4 py-3">Group</th>
                                        <th className="text-left font-semibold px-4 py-3">Submitted</th>
                                        <th className="text-left font-semibold px-4 py-3">Checked By</th>
                                        <th className="text-right font-semibold px-4 py-3">Actions</th>
                                    </tr>
                                </thead>

                                <tbody className="divide-y divide-gray-100">
                                    {rows.length === 0 && !loading ? (
                                        <tr>
                                            <td className="px-4 py-8 text-gray-500" colSpan={5}>
                                                No submitted quality covers found.
                                            </td>
                                        </tr>
                                    ) : null}

                                    {rows.map((r) => {
                                        const sampleId = r.sample_id;
                                        const sampleCode = r.sample?.lab_sample_code ?? `#${sampleId}`;
                                        const group = r.sample?.workflow_group ?? r.workflow_group ?? "-";
                                        const submittedAt = r.submitted_at ? formatDateTimeLocal(r.submitted_at) : "-";
                                        const checkedBy = r.checked_by?.name ?? "-";

                                        return (
                                            <tr key={r.quality_cover_id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{sampleCode}</div>
                                                    <div className="text-xs text-gray-500">QC #{r.quality_cover_id}</div>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">{group}</td>
                                                <td className="px-4 py-3 text-gray-700">{submittedAt}</td>
                                                <td className="px-4 py-3 text-gray-700">{checkedBy}</td>

                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-2">
                                                        <Link
                                                            to={`/quality-covers/om/${r.quality_cover_id}`}
                                                            className="lims-icon-button"
                                                            aria-label="Open quality cover"
                                                            title="Open quality cover"
                                                        >
                                                            <Eye size={16} />
                                                        </Link>

                                                        <button
                                                            type="button"
                                                            onClick={() => openApprove(r)}
                                                            className="lims-icon-button"
                                                            aria-label="Verify"
                                                            title="Verify"
                                                        >
                                                            <Check size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => openReject(r)}
                                                            className="lims-icon-button lims-icon-button--danger"
                                                            aria-label="Reject"
                                                            title="Reject"
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
                                Page <span className="font-semibold">{meta?.current_page ?? 1}</span> /{" "}
                                <span className="font-semibold">{meta?.last_page ?? 1}</span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    disabled={!canPrev || loading}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className={cx("lims-icon-button", (!canPrev || loading) && "opacity-40 cursor-not-allowed")}
                                    aria-label="Prev"
                                    title="Prev"
                                >
                                    <ChevronLeft size={16} />
                                </button>

                                <button
                                    disabled={!canNext || loading}
                                    onClick={() => setPage((p) => p + 1)}
                                    className={cx("lims-icon-button", (!canNext || loading) && "opacity-40 cursor-not-allowed")}
                                    aria-label="Next"
                                    title="Next"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Decision Modal (component) */}
            <QualityCoverDecisionModal
                open={decision.open}
                mode={decision.open ? decision.mode : "approve"}
                title={decision.open && decision.mode === "approve" ? "Verify Quality Cover" : "Reject Quality Cover"}
                subtitle={
                    decision.open ? `QC #${decision.item.quality_cover_id} • Sample #${decision.item.sample_id}` : null
                }
                submitting={decision.open ? decision.submitting : false}
                error={decision.open ? decision.error ?? null : null}
                rejectReason={decision.open ? decision.reason : ""}
                onRejectReasonChange={(v) => {
                    if (!decision.open) return;
                    setDecision({ ...decision, reason: v });
                }}
                approveHint="This will mark the cover as verified and send it to LH inbox for validation."
                onClose={closeModal}
                onConfirm={submitDecision}
            />
        </div>
    );
}
