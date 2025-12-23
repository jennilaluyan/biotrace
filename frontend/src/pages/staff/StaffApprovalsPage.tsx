// L:\Campus\Final Countdown\biotrace\frontend\src\pages\staff\StaffApprovalsPage.tsx
import { useEffect, useState } from "react";
import {
    approveStaff,
    fetchPendingStaffs,
    rejectStaff,
    type PendingStaff,
} from "../../services/staffs";
import { getRoleLabelById } from "../../utils/roles";
import { formatDate } from "../../utils/date";

export const StaffApprovalsPage = () => {
    const [items, setItems] = useState<PendingStaff[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

    const load = async () => {
        setErr(null);
        setLoading(true);
        try {
            const res = await fetchPendingStaffs();
            setItems(res.data ?? []);
        } catch (e: any) {
            setErr(e?.data?.message ?? "Failed to load pending staffs");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const onApprove = async (staffId: number) => {
        if (!confirm("Approve this staff?")) return;
        try {
            setActionLoadingId(staffId);
            await approveStaff(staffId);
            await load();
        } catch (e: any) {
            setErr(e?.data?.message ?? "Failed to approve staff");
        } finally {
            setActionLoadingId(null);
        }
    };

    const onReject = async (staffId: number) => {
        const note = window.prompt("Reject note (optional):") ?? undefined;
        if (!confirm("Reject this staff registration?")) return;

        try {
            setActionLoadingId(staffId);
            await rejectStaff(staffId, note);
            await load();
        } catch (e: any) {
            setErr(e?.data?.message ?? "Failed to reject staff");
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <div className="min-h-[60vh]">
            {/* Header bar */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        Staff Approvals
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Approve or reject staff registrations (Lab Head only).
                    </p>
                </div>

                <button
                    type="button"
                    onClick={load}
                    className="btn-outline self-start md:self-auto"
                >
                    Refresh
                </button>
            </div>

            {/* Card shell */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">
                        Pending staff registrations
                    </div>
                    <div className="text-xs text-gray-500">
                        Total: <span className="font-semibold">{items.length}</span>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading && (
                        <div className="text-sm text-gray-600">
                            Loading pending staffs...
                        </div>
                    )}

                    {err && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {err}
                        </div>
                    )}

                    {!loading && !err && (
                        <>
                            {items.length === 0 ? (
                                <div className="text-sm text-gray-600">
                                    No pending registrations.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">Staff</th>
                                                <th className="px-4 py-3 text-left">Role</th>
                                                <th className="px-4 py-3 text-left">Created</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {items.map((s) => {
                                                const busy = actionLoadingId === s.staff_id;

                                                const createdLabel = s.created_at
                                                    ? new Date(s.created_at).toLocaleString()
                                                    : "-";

                                                const roleName =
                                                    s.role?.name ||
                                                    getRoleLabelById(s.role_id) ||
                                                    "—";

                                                return (
                                                    <tr
                                                        key={s.staff_id}
                                                        className="border-t border-gray-100 hover:bg-gray-50/60"
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">
                                                                {s.name}
                                                            </div>
                                                            <div className="text-[11px] text-gray-500">
                                                                {s.email}
                                                            </div>
                                                            <div className="text-[11px] text-gray-500">
                                                                Status: Pending
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            {roleName}
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            {formatDate(s.created_at)}
                                                        </td>

                                                        <td className="px-4 py-3 text-right">
                                                            <div className="inline-flex items-center gap-2">
                                                                {/* ✅ Approve dulu, baru Reject */}
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className="lims-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    onClick={() => onApprove(s.staff_id)}
                                                                >
                                                                    {busy ? "..." : "Approve"}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className="lims-btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    onClick={() => onReject(s.staff_id)}
                                                                >
                                                                    {busy ? "..." : "Reject"}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
