import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { formatDateTimeLocal } from "../../utils/date";
import { getQualityCoverById, omReject, omVerify, QualityCoverInboxItem } from "../../services/qualityCovers";

import { QualityCoverDecisionModal } from "../../components/quality-covers/QualityCoverDecisionModal";

type DecisionMode = "verify" | "reject";

export function QualityCoverOmDetailPage() {
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
            setError("Reject reason is required.");
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
            const msg = e?.message || e?.data?.message || "Failed to submit decision.";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    }

    if (!Number.isFinite(id) || id <= 0) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">Invalid ID</h1>
                <p className="text-sm text-gray-600">Invalid quality cover id.</p>
                <Link to="/quality-covers/inbox/om" className="mt-4 lims-btn-primary">
                    Back to inbox
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
                        Quality Cover Inbox (OM)
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">Detail</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">Quality Cover Review</h1>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-500">Sample</span>
                            <span className="font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                {sampleCode}
                            </span>
                            <span className="text-[11px] text-gray-500">OM verification</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={() => load()}
                            disabled={loading || submitting}
                            aria-label="Refresh"
                            title="Refresh"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="mt-4 text-sm text-gray-600">Loading…</div>
                ) : !data ? (
                    <div className="mt-4 text-sm text-gray-600">Not found.</div>
                ) : (
                    <div className="mt-4 space-y-6">
                        {/* Top card */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm text-gray-500">Sample</div>
                                    <div className="text-lg font-semibold text-gray-900">{sampleCode}</div>
                                    <div className="text-sm text-gray-600">
                                        Client: {clientName} • Group: {group}
                                    </div>
                                </div>

                                <div className="text-right">
                                    <div className="text-sm text-gray-500">Status</div>
                                    <div className="font-medium text-gray-900">{data.status}</div>
                                    <div className="text-xs text-gray-600">
                                        Submitted: {data.submitted_at ? formatDateTimeLocal(data.submitted_at) : "-"}
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
                                    <div className="text-xs text-gray-500">Date of analysis</div>
                                    <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                                        {data.date_of_analysis ? formatDateTimeLocal(data.date_of_analysis) : "-"}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-xs text-gray-500">Checked by</div>
                                    <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                                        {data.checked_by?.name ?? data.checked_by_staff_id ?? "-"}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-gray-500">Method of analysis</div>
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
                                    className="lims-btn-primary"
                                    disabled={submitting}
                                >
                                    Verify
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setMode("reject");
                                        setError(null);
                                    }}
                                    className="lims-btn-danger"
                                    disabled={submitting}
                                >
                                    Reject
                                </button>

                                <Link to="/quality-covers/inbox/om" className="lims-btn">
                                    Back to inbox
                                </Link>
                            </div>
                        ) : (
                            <div className="text-sm text-gray-600">
                                This cover is not in <span className="font-medium">submitted</span> status.
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal */}
            <QualityCoverDecisionModal
                open={!!mode}
                mode={mode === "reject" ? "reject" : "approve"}
                title={mode === "reject" ? "Reject Quality Cover" : "Verify Quality Cover"}
                subtitle={data ? `QC #${data.quality_cover_id} • Sample #${data.sample_id}` : undefined}
                submitting={submitting}
                error={error}
                rejectReason={reason}
                onRejectReasonChange={setReason}
                approveHint="This will mark the cover as verified and send it to LH inbox for validation."
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
