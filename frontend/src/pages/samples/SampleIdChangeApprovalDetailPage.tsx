import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, RefreshCw, X } from "lucide-react";

import { approveSampleIdChange, getSampleIdChangeById, rejectSampleIdChange, type SampleIdChangeRow } from "../../services/sampleIdChanges";
import { getErrorMessage } from "../../utils/errors";
import SampleIdChangeDecisionModal from "../../components/samples/SampleIdChangeDecisionModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export default function SampleIdChangeApprovalDetailPage() {
    const params = useParams();
    const nav = useNavigate();

    const changeId = Number((params as any).changeId);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [row, setRow] = useState<SampleIdChangeRow | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [mode, setMode] = useState<"approve" | "reject">("approve");
    const [busy, setBusy] = useState(false);

    function flash(msg: string) {
        setSuccess(msg);
        window.setTimeout(() => setSuccess(null), 2500);
    }

    async function load(opts?: { silent?: boolean }) {
        const silent = !!opts?.silent;
        if (!silent) setLoading(true);

        setErr(null);

        try {
            const payload = await getSampleIdChangeById(changeId);

            const picked =
                (payload?.change as any) ??
                (payload?.data?.change as any) ??
                (payload?.data as any) ??
                payload;

            setRow(picked ?? null);
        } catch (e: any) {
            setRow(null);
            setErr(getErrorMessage(e, "Failed to load detail"));
        } finally {
            if (!silent) setLoading(false);
        }
    }

    useEffect(() => {
        if (!Number.isFinite(changeId) || changeId <= 0) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [changeId]);

    const statusKey = useMemo(() => String(row?.status ?? "").toLowerCase(), [row]);

    const canAct = statusKey === "pending" || statusKey === "submitted" || statusKey === "waiting";

    const suggested = row?.suggested_lab_sample_code ?? row?.suggested_sample_id ?? "-";
    const proposed = row?.proposed_lab_sample_code ?? row?.proposed_sample_id ?? "-";

    const requestId = row?.sample_id ?? row?.request_id ?? null;

    async function confirmDecision(rejectReason?: string) {
        if (!Number.isFinite(changeId) || changeId <= 0) return;

        setBusy(true);
        setErr(null);
        setSuccess(null);

        try {
            if (mode === "approve") {
                await approveSampleIdChange(changeId);
                flash("Approved.");
            } else {
                const r = String(rejectReason ?? "").trim();
                if (r.length < 3) {
                    setErr("Reject reason wajib diisi (min 3 karakter).");
                    setBusy(false);
                    return;
                }
                await rejectSampleIdChange(changeId, r);
                flash("Rejected.");
            }

            setModalOpen(false);
            await load({ silent: true });
        } catch (e: any) {
            setErr(getErrorMessage(e, `Failed to ${mode}`));
        } finally {
            setBusy(false);
        }
    }

    if (!Number.isFinite(changeId) || changeId <= 0) {
        return <div className="p-4 text-red-600">Invalid id</div>;
    }

    return (
        <div className="min-h-[60vh]">
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/samples/sample-id-changes" className="lims-breadcrumb-link">
                        Sample ID Change Approvals
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">Detail</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample ID Change Detail</h1>
                        <div className="mt-1 text-sm text-gray-600">
                            change #{changeId}
                            {requestId != null ? (
                                <span className="text-gray-500">
                                    {" "}
                                    • request #{requestId}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={() => load()}
                            disabled={loading || busy}
                            aria-label="Refresh"
                            title="Refresh"
                        >
                            <RefreshCw size={16} />
                        </button>

                        <button
                            type="button"
                            className={cx("lims-icon-button", !canAct && "opacity-40 cursor-not-allowed")}
                            disabled={!canAct || busy}
                            onClick={() => {
                                setMode("approve");
                                setModalOpen(true);
                            }}
                            aria-label="Approve"
                            title="Approve"
                        >
                            <Check size={16} />
                        </button>

                        <button
                            type="button"
                            className={cx("lims-icon-button lims-icon-button--danger", !canAct && "opacity-40 cursor-not-allowed")}
                            disabled={!canAct || busy}
                            onClick={() => {
                                setMode("reject");
                                setModalOpen(true);
                            }}
                            aria-label="Reject"
                            title="Reject"
                        >
                            <X size={16} />
                        </button>

                        <button type="button" className="btn-outline" onClick={() => nav(-1)}>
                            Back
                        </button>
                    </div>
                </div>

                {loading ? <div className="mt-4 text-sm text-gray-600">Loading…</div> : null}

                {success ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        {success}
                    </div>
                ) : null}

                {err ? (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {err}
                    </div>
                ) : null}

                {!loading && row ? (
                    <div className="mt-4 space-y-4">
                        <div className="rounded-2xl border border-gray-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm text-gray-500">Client</div>
                                    <div className="text-lg font-semibold text-gray-900">{row.client_name ?? "-"}</div>
                                    <div className="text-sm text-gray-600">{row.client_email ?? "-"}</div>
                                </div>

                                <div className="text-right">
                                    <div className="text-sm text-gray-500">Status</div>
                                    <div className="font-medium text-gray-900">{String(row.status ?? "pending")}</div>
                                    <div className="text-xs text-gray-600">group: {row.workflow_group ?? "-"}</div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-white p-4">
                            <div className="text-sm font-bold text-gray-900">Suggested vs Proposed</div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="rounded-xl border px-3 py-2">
                                    <div className="text-xs text-gray-500">Suggested</div>
                                    <div className="mt-1 font-mono text-sm font-semibold text-gray-900">{String(suggested)}</div>
                                </div>
                                <div className="rounded-xl border px-3 py-2">
                                    <div className="text-xs text-gray-500">Proposed</div>
                                    <div className="mt-1 font-mono text-sm font-semibold text-gray-900">{String(proposed)}</div>
                                </div>
                            </div>
                        </div>

                        {requestId != null ? (
                            <div className="flex items-center gap-2">
                                <Link to={`/samples/requests/${requestId}`} className="btn-outline">
                                    Open Request Detail
                                </Link>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <SampleIdChangeDecisionModal
                open={modalOpen}
                mode={mode}
                busy={busy}
                row={row}
                onClose={() => (busy ? null : setModalOpen(false))}
                onConfirm={confirmDecision}
            />
        </div>
    );
}
