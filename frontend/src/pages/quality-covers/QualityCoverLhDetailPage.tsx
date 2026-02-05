import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDateTimeLocal } from "../../utils/date";
import {
    getQualityCoverById,
    lhReject,
    lhValidate,
    QualityCoverInboxItem,
} from "../../services/qualityCovers";

type DecisionMode = "validate" | "reject";

export function QualityCoverLhDetailPage() {
    const { qualityCoverId } = useParams();
    const id = Number(qualityCoverId);
    const nav = useNavigate();

    const [data, setData] = useState<QualityCoverInboxItem | null>(null);
    const [loading, setLoading] = useState(false);

    const [mode, setMode] = useState<DecisionMode | null>(null);
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function load() {
        setLoading(true);
        try {
            const qc = await getQualityCoverById(id);
            setData(qc ?? null);
        } finally {
            setLoading(false);
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
            if (mode === "validate") await lhValidate(data.quality_cover_id);
            if (mode === "reject") await lhReject(data.quality_cover_id, reason.trim());
            setMode(null);
            setReason("");
            await load();
            nav("/quality-covers/inbox/lh");
        } catch (e: any) {
            setError(e?.message || "Failed to submit decision.");
        } finally {
            setSubmitting(false);
        }
    }

    if (!Number.isFinite(id) || id <= 0) {
        return <div className="p-6">Invalid quality cover id.</div>;
    }

    return (
        <div className="p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold">Quality Cover Review — LH</h1>
                    <div className="text-sm text-slate-600">Read-only cover details for validation.</div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => nav("/quality-covers/inbox/lh")}
                        className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50"
                    >
                        Back to Inbox
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-sm text-slate-600">Loading...</div>
            ) : !data ? (
                <div className="text-sm text-slate-600">Not found.</div>
            ) : (
                <div className="space-y-4">
                    <div className="rounded-2xl border bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-sm text-slate-500">Sample</div>
                                <div className="text-lg font-semibold">
                                    {data.sample?.lab_sample_code ?? `#${data.sample_id}`}
                                </div>
                                <div className="text-sm text-slate-600">
                                    Client: {data.sample?.client?.name ?? "-"} • Group:{" "}
                                    {data.sample?.workflow_group ?? data.workflow_group ?? "-"}
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-sm text-slate-500">Status</div>
                                <div className="font-medium">{data.status}</div>
                                <div className="text-xs text-slate-600">
                                    Verified: {data.verified_at ? formatDateTimeLocal(data.verified_at) : "-"}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border bg-white p-4 space-y-3">
                        <div className="grid gap-3 md:grid-cols-2">
                            <div>
                                <div className="text-xs text-slate-500">Date of analysis</div>
                                <div className="rounded-xl border px-3 py-2 text-sm">
                                    {data.date_of_analysis ? formatDateTimeLocal(data.date_of_analysis) : "-"}
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-slate-500">Checked by</div>
                                <div className="rounded-xl border px-3 py-2 text-sm">
                                    {data.checked_by?.name ?? data.checked_by_staff_id ?? "-"}
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="text-xs text-slate-500">Method of analysis</div>
                            <div className="rounded-xl border px-3 py-2 text-sm">{data.method_of_analysis ?? "-"}</div>
                        </div>

                        <div>
                            <div className="text-xs text-slate-500">QC Payload</div>
                            <pre className="overflow-x-auto rounded-xl border bg-slate-50 p-3 text-xs">
                                {JSON.stringify(data.qc_payload ?? {}, null, 2)}
                            </pre>
                        </div>
                    </div>

                    {data.status === "verified" ? (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setMode("validate")}
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                            >
                                Validate
                            </button>
                            <button
                                onClick={() => setMode("reject")}
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50"
                            >
                                Reject
                            </button>
                        </div>
                    ) : (
                        <div className="text-sm text-slate-600">
                            This cover is not in <span className="font-medium">verified</span> status.
                        </div>
                    )}
                </div>
            )}

            {/* Modal */}
            {mode ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white shadow-lg">
                        <div className="border-b px-5 py-4">
                            <div className="text-lg font-semibold">
                                {mode === "validate" ? "Validate Quality Cover" : "Reject Quality Cover"}
                            </div>
                        </div>

                        <div className="px-5 py-4">
                            {mode === "reject" ? (
                                <>
                                    <div className="text-sm font-medium mb-2">Reject reason (required)</div>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        className="min-h-[110px] w-full rounded-xl border px-3 py-2 text-sm"
                                        placeholder="Explain rejection reason..."
                                    />
                                </>
                            ) : (
                                <div className="text-sm text-slate-700">
                                    This will mark the cover as <span className="font-semibold">validated</span>.
                                </div>
                            )}

                            {error ? (
                                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                                    {error}
                                </div>
                            ) : null}
                        </div>

                        <div className="flex justify-end gap-2 border-t px-5 py-4">
                            <button
                                onClick={() => {
                                    setMode(null);
                                    setReason("");
                                    setError(null);
                                }}
                                disabled={submitting}
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={submit}
                                disabled={submitting}
                                className="rounded-xl border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
                            >
                                {submitting ? "Submitting..." : "Confirm"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
