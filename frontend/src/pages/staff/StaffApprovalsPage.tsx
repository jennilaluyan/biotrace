import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Check, X, Loader2, UserCheck } from "lucide-react";

import {
    approveStaff,
    fetchPendingStaffs,
    rejectStaff,
    type PendingStaff,
} from "../../services/staffs";
import { getRoleLabelById } from "../../utils/roles";
import { formatDate } from "../../utils/date";

type ApiError = {
    data?: { message?: string; error?: string };
    response?: { data?: any };
    message?: string;
};

const getApiMessage = (e: unknown) => {
    const err = e as ApiError;
    return (
        err?.data?.message ??
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message ??
        null
    );
};

export const StaffApprovalsPage = () => {
    const { t } = useTranslation();

    const [items, setItems] = useState<PendingStaff[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

    const total = useMemo(() => items.length, [items]);

    const load = async () => {
        setErr(null);
        setLoading(true);
        try {
            const res = await fetchPendingStaffs();
            setItems(res.data ?? []);
        } catch (e) {
            setErr(getApiMessage(e) ?? t("staffApprovals.errors.loadFailed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onApprove = async (staffId: number) => {
        const ok = window.confirm(t("staffApprovals.confirm.approve"));
        if (!ok) return;

        try {
            setErr(null);
            setActionLoadingId(staffId);
            await approveStaff(staffId);
            await load();
        } catch (e) {
            setErr(getApiMessage(e) ?? t("staffApprovals.errors.approveFailed"));
        } finally {
            setActionLoadingId(null);
        }
    };

    const onReject = async (staffId: number) => {
        const ok = window.confirm(t("staffApprovals.confirm.reject"));
        if (!ok) return;

        const note = window.prompt(t("staffApprovals.confirm.rejectNotePrompt")) ?? undefined;

        try {
            setErr(null);
            setActionLoadingId(staffId);
            await rejectStaff(staffId, note);
            await load();
        } catch (e) {
            setErr(getApiMessage(e) ?? t("staffApprovals.errors.rejectFailed"));
        } finally {
            setActionLoadingId(null);
        }
    };

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        {t("staffApprovals.title")}
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">{t("staffApprovals.subtitle")}</p>
                </div>

                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="btn-outline self-start md:self-auto inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t("common.refresh")}
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">
                        {t("staffApprovals.cardTitle")}
                    </div>
                    <div className="text-xs text-gray-500">{t("common.totalCount", { count: total })}</div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t("staffApprovals.loading")}
                        </div>
                    )}

                    {err && !loading && (
                        <div
                            role="alert"
                            aria-live="polite"
                            className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4 flex items-start justify-between gap-3"
                        >
                            <div className="min-w-0">{err}</div>
                            <button type="button" onClick={load} className="btn-outline shrink-0">
                                {t("common.refresh")}
                            </button>
                        </div>
                    )}

                    {!loading && !err && (
                        <>
                            {items.length === 0 ? (
                                <div className="flex items-start gap-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-4">
                                    <UserCheck className="h-5 w-5 text-gray-500 mt-0.5" />
                                    <div>
                                        <div className="font-medium text-gray-900">{t("staffApprovals.emptyTitle")}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">{t("staffApprovals.emptyHint")}</div>
                                    </div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">{t("staffApprovals.table.staff")}</th>
                                                <th className="px-4 py-3 text-left">{t("staffApprovals.table.role")}</th>
                                                <th className="px-4 py-3 text-left">{t("staffApprovals.table.requestedAt")}</th>
                                                <th className="px-4 py-3 text-right">{t("common.actions")}</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {items.map((s) => {
                                                const busy = actionLoadingId === s.staff_id;
                                                const roleName = s.role?.name || getRoleLabelById(s.role_id) || "—";

                                                return (
                                                    <tr
                                                        key={s.staff_id}
                                                        className="border-t border-gray-100 hover:bg-gray-50/60"
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">{s.name}</div>
                                                            <div className="text-[11px] text-gray-500">{s.email}</div>
                                                            <div className="mt-1 inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] text-amber-700">
                                                                {t("staffApprovals.statusPending")}
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{roleName}</td>

                                                        <td className="px-4 py-3 text-gray-700">{formatDate(s.created_at)}</td>

                                                        <td className="px-4 py-3 text-right">
                                                            <div className="inline-flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className="lims-btn-primary disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                                                    onClick={() => onApprove(s.staff_id)}
                                                                >
                                                                    {busy ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <Check className="h-4 w-4" />
                                                                    )}
                                                                    {busy ? t("common.processing") : t("common.approve")}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className="lims-btn-danger disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                                                    onClick={() => onReject(s.staff_id)}
                                                                >
                                                                    {busy ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <X className="h-4 w-4" />
                                                                    )}
                                                                    {busy ? t("common.processing") : t("common.reject")}
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
