// src/pages/requests/SampleRequestsPage.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sampleRequestService, type SampleRequestStatus, type SampleRequest } from "../../services/sampleRequests";
import { RequestStatusPill } from "../../components/requests/RequestStatusPill";

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: "", label: "All statuses" },
    { value: "submitted", label: "submitted" },
    { value: "reviewed", label: "reviewed" },
    { value: "approved", label: "approved" },
    { value: "rejected", label: "rejected" },
    { value: "cancelled", label: "cancelled" },
    { value: "handed_over_to_collector", label: "handed_over_to_collector" },
    { value: "intake_failed", label: "intake_failed" },
    { value: "converted_to_sample", label: "converted_to_sample" },
];

export const SampleRequestsPage = () => {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [rows, setRows] = useState<SampleRequest[]>([]);
    const [status, setStatus] = useState<string>("");

    const load = async () => {
        try {
            setErr(null);
            setLoading(true);
            const res = await sampleRequestService.getAll({ status: status || undefined });
            setRows(res.data.data ?? []);
        } catch (e: any) {
            const msg = e?.data?.message ?? e?.data?.error ?? "Failed to load requests";
            setErr(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status]);

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <h1 className="text-2xl font-semibold text-primary">Sample Requests Queue</h1>
                    <p className="text-sm text-gray-600">
                        Ini antrian “pre-sample” (belum punya Sample ID).
                    </p>
                </div>

                <div className="min-w-[220px]">
                    <label className="block text-xs text-gray-600 mb-1">Filter status</label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full rounded-xl border px-3 py-2 text-sm bg-white"
                    >
                        {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {err && <div className="mb-3 text-xs text-red-700 bg-red-100 px-3 py-2 rounded">{err}</div>}

            <div className="bg-white rounded-2xl shadow border overflow-hidden">
                <div className="px-4 py-3 border-b text-sm font-semibold text-gray-800">Request list</div>

                {loading ? (
                    <div className="p-6 text-sm text-gray-600">Loading...</div>
                ) : rows.length === 0 ? (
                    <div className="p-6 text-sm text-gray-600">No requests found.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-600">
                            <tr>
                                <th className="text-left px-4 py-3">Request #</th>
                                <th className="text-left px-4 py-3">Client</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Created</th>
                                <th className="text-left px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.request_id} className="border-t">
                                    <td className="px-4 py-3 font-semibold">#{r.request_id}</td>
                                    <td className="px-4 py-3">{r.client?.name ?? `Client #${r.client_id}`}</td>
                                    <td className="px-4 py-3">
                                        <RequestStatusPill status={r.request_status as SampleRequestStatus} />
                                    </td>
                                    <td className="px-4 py-3 text-gray-600">{r.created_at ?? "-"}</td>
                                    <td className="px-4 py-3">
                                        <Link
                                            to={`/sample-requests/${r.request_id}`}
                                            className="text-primary font-semibold hover:underline"
                                        >
                                            View detail
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
