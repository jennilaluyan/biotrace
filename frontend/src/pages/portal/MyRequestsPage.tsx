// src/pages/portal/MyRequestsPage.tsx
import React, { useEffect, useState } from "react";
import { sampleRequestService, type SampleRequest } from "../../services/sampleRequests";
import { RequestStatusPill } from "../../components/requests/RequestStatusPill";
import { CreateSampleRequestModal } from "./CreateSampleRequestModal";
import { Link } from "react-router-dom";

export const MyRequestsPage = () => {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [rows, setRows] = useState<SampleRequest[]>([]);
    const [openCreate, setOpenCreate] = useState(false);

    const load = async () => {
        try {
            setErr(null);
            setLoading(true);
            const res = await sampleRequestService.getAll();
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
    }, []);

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h1 className="text-2xl font-semibold text-primary">My Sample Requests</h1>
                    <p className="text-sm text-gray-600">
                        Requests yang masih “pre-sample”. Setelah intake PASS, sample muncul di modul Samples.
                    </p>
                </div>

                <button
                    onClick={() => setOpenCreate(true)}
                    className="lims-btn-primary"
                >
                    + Create request
                </button>
            </div>

            {err && <div className="mb-3 text-xs text-red-700 bg-red-100 px-3 py-2 rounded">{err}</div>}

            <div className="bg-white rounded-2xl shadow border overflow-hidden">
                <div className="px-4 py-3 border-b text-sm font-semibold text-gray-800">Request list</div>

                {loading ? (
                    <div className="p-6 text-sm text-gray-600">Loading...</div>
                ) : rows.length === 0 ? (
                    <div className="p-6 text-sm text-gray-600">No requests yet.</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-600">
                            <tr>
                                <th className="text-left px-4 py-3">Request #</th>
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Created</th>
                                <th className="text-left px-4 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.request_id} className="border-t">
                                    <td className="px-4 py-3 font-semibold">#{r.request_id}</td>
                                    <td className="px-4 py-3">
                                        <RequestStatusPill status={r.request_status} />
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

            <CreateSampleRequestModal
                open={openCreate}
                onClose={() => setOpenCreate(false)}
                onCreated={load}
            />
        </div>
    );
};
