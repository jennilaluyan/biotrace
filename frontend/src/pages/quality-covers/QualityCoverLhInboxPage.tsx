import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    listLhInbox,
    lhReject,
    lhValidate,
    QualityCoverInboxItem,
    InboxMeta,
} from "../../services/qualityCovers";

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

export function QualityCoverLhInboxPage() {
    const [rows, setRows] = useState<QualityCoverInboxItem[]>([]);
    const [meta, setMeta] = useState<InboxMeta | null>(null);
    const [loading, setLoading] = useState(false);

    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const perPage = 25;

    const [decision, setDecision] = useState<DecisionState>({ open: false });

    const canPrev = !!meta && meta.current_page > 1;
    const canNext = !!meta && meta.current_page < meta.last_page;

    async function fetchData() {
        setLoading(true);
        try {
            const res = await listLhInbox({ search: search || undefined, page, per_page: perPage });
            setRows(res.data ?? []);
            setMeta(res.meta ?? null);
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
        setDecision({
            open: true,
            mode: "approve",
            item,
            reason: "",
            submitting: false,
            error: null,
        });
    }

    function openReject(item: QualityCoverInboxItem) {
        setDecision({
            open: true,
            mode: "reject",
            item,
            reason: "",
            submitting: false,
            error: null,
        });
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
                await lhValidate(id);
            } else {
                await lhReject(id, decision.reason.trim());
            }

            closeModal();
            await fetchData();
        } catch (e: any) {
            setDecision({
                ...decision,
                submitting: false,
                error: e?.message || "Failed to submit decision.",
            });
        }
    }

    return (
        <div className="p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold">Quality Covers — LH Inbox</h1>
                    <div className="text-sm text-slate-600">Verified covers waiting for LH validation.</div>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-72 rounded-xl border px-3 py-2 text-sm"
                        placeholder="Search sample code / client..."
                    />
                    <button
                        onClick={() => {
                            setPage(1);
                            fetchData();
                        }}
                        className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                    >
                        Search
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border bg-white">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="text-sm text-slate-600">{loading ? "Loading..." : totalText}</div>

                    <div className="flex items-center gap-2">
                        <button
                            disabled={!canPrev || loading}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className={cx(
                                "rounded-xl border px-3 py-1.5 text-sm",
                                (!canPrev || loading) && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            Prev
                        </button>
                        <button
                            disabled={!canNext || loading}
                            onClick={() => setPage((p) => p + 1)}
                            className={cx(
                                "rounded-xl border px-3 py-1.5 text-sm",
                                (!canNext || loading) && "opacity-50 cursor-not-allowed"
                            )}
                        >
                            Next
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-700">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium">Sample</th>
                                <th className="px-4 py-3 text-left font-medium">Client</th>
                                <th className="px-4 py-3 text-left font-medium">Group</th>
                                <th className="px-4 py-3 text-left font-medium">Verified</th>
                                <th className="px-4 py-3 text-left font-medium">Verified By</th>
                                <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td className="px-4 py-6 text-slate-500" colSpan={6}>
                                        No verified quality covers found.
                                    </td>
                                </tr>
                            ) : null}

                            {rows.map((r) => {
                                const sampleId = r.sample_id;
                                const sampleCode = r.sample?.lab_sample_code ?? `#${sampleId}`;
                                const clientName = r.sample?.client?.name ?? "-";
                                const group = r.sample?.workflow_group ?? r.workflow_group ?? "-";
                                const verifiedAt = r.verified_at ?? "-";
                                const verifiedBy = r.verified_by?.name ?? "-";

                                return (
                                    <tr key={r.quality_cover_id} className="border-t">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{sampleCode}</div>
                                            <div className="text-xs text-slate-500">QC #{r.quality_cover_id}</div>
                                            <Link
                                                to={`/samples/${sampleId}`}
                                                className="text-xs text-blue-600 hover:underline"
                                            >
                                                Open sample detail
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">{clientName}</td>
                                        <td className="px-4 py-3">{group}</td>
                                        <td className="px-4 py-3">{verifiedAt}</td>
                                        <td className="px-4 py-3">{verifiedBy}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => openApprove(r)}
                                                    className="rounded-xl border px-3 py-1.5 hover:bg-slate-50"
                                                >
                                                    Validate
                                                </button>
                                                <button
                                                    onClick={() => openReject(r)}
                                                    className="rounded-xl border px-3 py-1.5 hover:bg-slate-50"
                                                >
                                                    Reject
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Decision Modal */}
            {decision.open ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white shadow-lg">
                        <div className="border-b px-5 py-4">
                            <div className="text-lg font-semibold">
                                {decision.mode === "approve" ? "Validate Quality Cover" : "Reject Quality Cover"}
                            </div>
                            <div className="text-sm text-slate-600">
                                QC #{decision.item.quality_cover_id} • Sample #{decision.item.sample_id}
                            </div>
                        </div>

                        <div className="px-5 py-4">
                            {decision.mode === "reject" ? (
                                <div>
                                    <div className="text-sm font-medium mb-2">Reject reason (required)</div>
                                    <textarea
                                        value={decision.reason}
                                        onChange={(e) => setDecision({ ...decision, reason: e.target.value })}
                                        className="min-h-[110px] w-full rounded-xl border px-3 py-2 text-sm"
                                        placeholder="Explain why this cover is rejected..."
                                    />
                                </div>
                            ) : (
                                <div className="text-sm text-slate-700">
                                    This is the final step. The cover will become{" "}
                                    <span className="font-semibold">validated</span>.
                                </div>
                            )}

                            {decision.error ? (
                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                                    {decision.error}
                                </div>
                            ) : null}
                        </div>

                        <div className="flex justify-end gap-2 border-t px-5 py-4">
                            <button
                                onClick={closeModal}
                                disabled={decision.submitting}
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submitDecision}
                                disabled={decision.submitting}
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                                {decision.submitting ? "Submitting..." : "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
