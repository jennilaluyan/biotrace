// src/pages/requests/SampleRequestDetailPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { sampleRequestService, type SampleRequest, type SampleRequestStatus } from "../../services/sampleRequests";
import { RequestStatusPill } from "../../components/requests/RequestStatusPill";
import { useAuth } from "../../hooks/useAuth";
import { getUserRoleId, ROLE_ID } from "../../utils/roles";

type IntakeModalProps = {
    open: boolean;
    onClose: () => void;
    onSubmit: (payload: { result: "pass" | "fail"; received_at?: string | null; intake_notes?: string | null }) => void;
};

const IntakeModal = ({ open, onClose, onSubmit }: IntakeModalProps) => {
    const [result, setResult] = useState<"pass" | "fail">("pass");
    const [receivedAt, setReceivedAt] = useState<string>("");
    const [notes, setNotes] = useState<string>("");

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="text-lg font-semibold text-primary">Intake Result</h2>
                    <button onClick={onClose} className="text-gray-600 hover:text-gray-800">✕</button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Result</label>
                        <select
                            className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                            value={result}
                            onChange={(e) => setResult(e.target.value as any)}
                        >
                            <option value="pass">PASS</option>
                            <option value="fail">FAIL</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Received at (optional)</label>
                        <input
                            className="w-full rounded-xl border px-3 py-2 text-sm"
                            value={receivedAt}
                            onChange={(e) => setReceivedAt(e.target.value)}
                            placeholder="ISO datetime (opsional). kalau kosong pakai NOW."
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-gray-600 mb-1">Intake notes</label>
                        <textarea
                            className="w-full rounded-xl border px-3 py-2 text-sm min-h-[90px]"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Catatan pemeriksaan intake (opsional)"
                        />
                    </div>
                </div>

                <div className="px-5 py-4 border-t flex items-center justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border text-sm">Cancel</button>
                    <button
                        onClick={() => onSubmit({ result, received_at: receivedAt || null, intake_notes: notes || null })}
                        className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
                    >
                        Submit
                    </button>
                </div>
            </div>
        </div>
    );
};

export const SampleRequestDetailPage = () => {
    const { requestId } = useParams();
    const rid = Number(requestId);

    const nav = useNavigate();
    const { user } = useAuth();
    const roleId = getUserRoleId(user);

    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [data, setData] = useState<SampleRequest | null>(null);

    const [actionLoading, setActionLoading] = useState(false);
    const [openIntake, setOpenIntake] = useState(false);

    const canApproveReject = useMemo(() => {
        return roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.LAB_HEAD || roleId === ROLE_ID.OPERATIONAL_MANAGER;
    }, [roleId]);

    const canHandover = useMemo(() => roleId === ROLE_ID.ADMIN, [roleId]);
    const canIntake = useMemo(() => roleId === ROLE_ID.SAMPLE_COLLECTOR, [roleId]);

    const load = async () => {
        try {
            setErr(null);
            setLoading(true);
            const res = await sampleRequestService.getById(rid);
            setData(res.data);
        } catch (e: any) {
            const msg = e?.data?.message ?? e?.data?.error ?? "Failed to load request detail";
            setErr(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!rid) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rid]);

    const updateStatus = async (status: SampleRequestStatus) => {
        try {
            setActionLoading(true);
            await sampleRequestService.updateStatus(rid, { status });
            await load();
        } catch (e: any) {
            const msg = e?.data?.message ?? e?.data?.error ?? "Failed to update status";
            setErr(msg);
        } finally {
            setActionLoading(false);
        }
    };

    const handover = async () => {
        try {
            setActionLoading(true);
            await sampleRequestService.handover(rid, {});
            await load();
        } catch (e: any) {
            const msg = e?.data?.message ?? e?.data?.error ?? "Failed to handover";
            setErr(msg);
        } finally {
            setActionLoading(false);
        }
    };

    const intake = async (payload: { result: "pass" | "fail"; received_at?: string | null; intake_notes?: string | null }) => {
        try {
            setActionLoading(true);
            await sampleRequestService.intakeCreateSample(rid, payload);
            setOpenIntake(false);
            await load();
        } catch (e: any) {
            const msg = e?.data?.message ?? e?.data?.error ?? "Failed to intake";
            setErr(msg);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <button onClick={() => nav(-1)} className="text-sm text-primary font-semibold hover:underline">
                        ← Back
                    </button>
                    <h1 className="text-2xl font-semibold text-primary mt-1">Request Detail #{rid}</h1>
                </div>

                {data && (
                    <div className="flex items-center gap-2">
                        <RequestStatusPill status={data.request_status} />
                    </div>
                )}
            </div>

            {err && <div className="mb-3 text-xs text-red-700 bg-red-100 px-3 py-2 rounded">{err}</div>}

            {loading ? (
                <div className="bg-white rounded-2xl border shadow p-6 text-sm text-gray-600">Loading...</div>
            ) : !data ? (
                <div className="bg-white rounded-2xl border shadow p-6 text-sm text-gray-600">Not found.</div>
            ) : (
                <>
                    <div className="bg-white rounded-2xl border shadow p-5 mb-4">
                        <h2 className="text-sm font-semibold text-gray-800 mb-3">Request Info</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div>
                                <div className="text-xs text-gray-500">Client</div>
                                <div className="font-semibold">{data.client?.name ?? `Client #${data.client_id}`}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Created</div>
                                <div className="font-semibold">{data.created_at ?? "-"}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Intended sample type</div>
                                <div className="font-semibold">{data.intended_sample_type ?? "-"}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Examination purpose</div>
                                <div className="font-semibold">{data.examination_purpose ?? "-"}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Contact history</div>
                                <div className="font-semibold">{data.contact_history ?? "-"}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Priority</div>
                                <div className="font-semibold">{data.priority ?? "-"}</div>
                            </div>
                        </div>

                        {data.additional_notes ? (
                            <div className="mt-4">
                                <div className="text-xs text-gray-500">Additional notes</div>
                                <div className="text-sm">{data.additional_notes}</div>
                            </div>
                        ) : null}
                    </div>

                    <div className="bg-white rounded-2xl border shadow p-5 mb-4">
                        <h2 className="text-sm font-semibold text-gray-800 mb-3">Requested parameters</h2>
                        {data.items?.length ? (
                            <div className="space-y-2">
                                {data.items.map((it, idx) => (
                                    <div key={idx} className="flex items-center justify-between border rounded-xl px-3 py-2">
                                        <div className="text-sm">
                                            <div className="font-semibold">
                                                Parameter #{it.parameter_id}
                                                {it.parameter?.name ? ` — ${it.parameter.name}` : ""}
                                            </div>
                                            {it.notes ? <div className="text-xs text-gray-600">{it.notes}</div> : null}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-sm text-gray-600">No items.</div>
                        )}
                    </div>

                    <div className="bg-white rounded-2xl border shadow p-5">
                        <h2 className="text-sm font-semibold text-gray-800 mb-3">Actions</h2>

                        {data.sample?.sample_id ? (
                            <div className="mb-3 text-sm">
                                Linked Sample:{" "}
                                <Link to={`/samples/${data.sample.sample_id}`} className="text-primary font-semibold hover:underline">
                                    #{data.sample.sample_id}
                                </Link>
                            </div>
                        ) : (
                            <div className="mb-3 text-sm text-gray-600">
                                Belum ada Sample ID (akan lahir saat intake PASS).
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            {canApproveReject && (
                                <>
                                    <button
                                        disabled={actionLoading}
                                        onClick={() => updateStatus("reviewed")}
                                        className="px-4 py-2 rounded-xl border text-sm font-semibold"
                                    >
                                        Mark Reviewed
                                    </button>
                                    <button
                                        disabled={actionLoading}
                                        onClick={() => updateStatus("approved")}
                                        className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold disabled:opacity-60"
                                    >
                                        Approve
                                    </button>
                                    <button
                                        disabled={actionLoading}
                                        onClick={() => updateStatus("rejected")}
                                        className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-60"
                                    >
                                        Reject
                                    </button>
                                </>
                            )}

                            {canHandover && (
                                <button
                                    disabled={actionLoading}
                                    onClick={handover}
                                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
                                >
                                    Handover to Collector
                                </button>
                            )}

                            {canIntake && (
                                <button
                                    disabled={actionLoading}
                                    onClick={() => setOpenIntake(true)}
                                    className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-60"
                                >
                                    Intake (PASS/FAIL)
                                </button>
                            )}
                        </div>

                        <p className="mt-3 text-[11px] text-gray-500">
                            Kalau tombol tidak muncul, berarti role kamu tidak termasuk yang diizinkan di UI.
                            (Backend tetap akan enforce policy.)
                        </p>
                    </div>

                    <IntakeModal open={openIntake} onClose={() => setOpenIntake(false)} onSubmit={intake} />
                </>
            )}
        </div>
    );
};
