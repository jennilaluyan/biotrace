import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Check, X, Loader2, UserCheck, Users } from "lucide-react";

import {
    approveStaff,
    fetchPendingStaffs,
    fetchStaffs,
    rejectStaff,
    type PendingStaff,
    type StaffRow,
} from "../../services/staffs";
import { getRoleLabelById } from "../../utils/roles";
import { formatDate } from "../../utils/date";

import StaffApprovalDecisionModal from "../../components/staff/StaffApprovalDecisionModal";

type ApiErrorLike = {
    data?: { message?: string; error?: string; details?: any; errors?: any };
    response?: { data?: any };
    message?: string;
};

function getApiMessage(err: unknown, fallback: string) {
    const e = err as ApiErrorLike;
    const data = e?.response?.data ?? e?.data;

    const details = data?.details ?? data?.errors;
    if (details && typeof details === "object") {
        const k = Object.keys(details)[0];
        const v = k ? details[k] : undefined;
        if (Array.isArray(v) && v[0]) return String(v[0]);
        if (typeof v === "string" && v) return v;
    }

    return (
        data?.message ??
        data?.error ??
        (typeof e?.message === "string" ? e.message : null) ??
        fallback
    );
}

function unwrapList<T>(res: any): T[] {
    const x = res?.data ?? res;
    if (Array.isArray(x)) return x;

    if (x && typeof x === "object") {
        const candidates = [
            (x as any).data,
            (x as any).items,
            (x as any).rows,
            (x as any).results,
        ];
        for (const c of candidates) {
            if (Array.isArray(c)) return c;
            if (c && typeof c === "object" && Array.isArray((c as any).data)) return (c as any).data;
        }
    }

    return [];
}

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type TabKey = "staffs" | "approvals";

function chipClass(kind: "neutral" | "good" | "bad" = "neutral") {
    return cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border",
        kind === "good" && "bg-emerald-50 text-emerald-700 border-emerald-200",
        kind === "bad" && "bg-rose-50 text-rose-700 border-rose-200",
        kind === "neutral" && "bg-gray-50 text-gray-700 border-gray-200"
    );
}

function safeDate(iso?: string | null) {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
}

export const StaffApprovalsPage = () => {
    const { t } = useTranslation();

    const [tab, setTab] = useState<TabKey>("staffs");

    // ===== Tab: Staffs list =====
    const [staffQ, setStaffQ] = useState("");
    const [staffItems, setStaffItems] = useState<StaffRow[]>([]);
    const [staffLoading, setStaffLoading] = useState(true);
    const [staffErr, setStaffErr] = useState<string | null>(null);

    // ===== Tab: Approvals (pending) =====
    const [pendingItems, setPendingItems] = useState<PendingStaff[]>([]);
    const [pendingLoading, setPendingLoading] = useState(true);
    const [pendingErr, setPendingErr] = useState<string | null>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"approve" | "reject">("approve");
    const [selectedStaff, setSelectedStaff] = useState<PendingStaff | null>(null);
    const [modalBusy, setModalBusy] = useState(false);
    const [modalErr, setModalErr] = useState<string | null>(null);

    const staffTotal = useMemo(() => staffItems.length, [staffItems]);
    const pendingTotal = useMemo(() => pendingItems.length, [pendingItems]);

    const formatLastSeen = useCallback(
        (iso?: string | null) => {
            const d = safeDate(iso);
            if (!d) return t("staffApprovals.lastSeenNever");

            const diffMs = Date.now() - d.getTime();
            if (diffMs < 60_000) return t("staffApprovals.lastSeenJustNow");

            const mins = Math.floor(diffMs / 60_000);
            if (mins < 60) return t("staffApprovals.lastSeenMinutes", { count: mins });

            const hours = Math.floor(mins / 60);
            if (hours < 24) return t("staffApprovals.lastSeenHours", { count: hours });

            const days = Math.floor(hours / 24);
            return t("staffApprovals.lastSeenDays", { count: days });
        },
        [t]
    );

    const loadStaffs = useCallback(async () => {
        setStaffErr(null);
        setStaffLoading(true);

        try {
            const res = await fetchStaffs({ q: staffQ.trim() || undefined });
            setStaffItems(unwrapList<StaffRow>(res));
        } catch (e) {
            setStaffErr(getApiMessage(e, t("staffApprovals.errors.loadFailed")));
            setStaffItems([]);
        } finally {
            setStaffLoading(false);
        }
    }, [staffQ, t]);

    const loadPending = useCallback(async () => {
        setPendingErr(null);
        setPendingLoading(true);

        try {
            const res = await fetchPendingStaffs();
            setPendingItems(unwrapList<PendingStaff>(res));
        } catch (e) {
            setPendingErr(getApiMessage(e, t("staffApprovals.errors.loadFailed")));
            setPendingItems([]);
        } finally {
            setPendingLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void loadStaffs();
        void loadPending();
    }, [loadStaffs, loadPending]);

    const onRefresh = () => {
        if (tab === "staffs") void loadStaffs();
        else void loadPending();
    };

    const openApprove = useCallback((staff: PendingStaff) => {
        setModalMode("approve");
        setSelectedStaff(staff);
        setModalErr(null);
        setModalOpen(true);
    }, []);

    const openReject = useCallback((staff: PendingStaff) => {
        setModalMode("reject");
        setSelectedStaff(staff);
        setModalErr(null);
        setModalOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        if (modalBusy) return;
        setModalOpen(false);
        setSelectedStaff(null);
        setModalErr(null);
    }, [modalBusy]);

    const onConfirmModal = useCallback(
        async (rejectNote?: string) => {
            const staffId = selectedStaff?.staff_id;
            if (!staffId) return;

            try {
                setModalBusy(true);
                setModalErr(null);

                if (modalMode === "approve") {
                    await approveStaff(staffId);
                } else {
                    await rejectStaff(staffId, rejectNote);
                }

                setModalOpen(false);
                setSelectedStaff(null);

                await loadPending();
                await loadStaffs(); // approved staff should appear in Staffs tab
            } catch (e) {
                const fallback =
                    modalMode === "approve"
                        ? t("staffApprovals.errors.approveFailed")
                        : t("staffApprovals.errors.rejectFailed");

                setModalErr(getApiMessage(e, fallback));
            } finally {
                setModalBusy(false);
            }
        },
        [selectedStaff, modalMode, loadPending, loadStaffs, t]
    );

    const busyRowId = modalBusy ? selectedStaff?.staff_id ?? null : null;
    const refreshBusy = tab === "staffs" ? staffLoading : pendingLoading;

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between px-0 py-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Users className="text-gray-700" size={18} />
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("staffApprovals.title")}</h1>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{t("staffApprovals.subtitle")}</p>

                    <div className="mt-3 flex items-center gap-2">
                        <button
                            className={cx(
                                "rounded-xl px-3 py-2 text-sm font-bold border",
                                tab === "staffs"
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                            )}
                            onClick={() => setTab("staffs")}
                        >
                            {t("staffApprovals.tabs.staffs")}
                        </button>

                        <button
                            className={cx(
                                "rounded-xl px-3 py-2 text-sm font-bold border",
                                tab === "approvals"
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                            )}
                            onClick={() => setTab("approvals")}
                        >
                            {t("staffApprovals.tabs.approvals")}
                        </button>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={refreshBusy}
                    className="btn-outline self-start md:self-auto inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {refreshBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {t("common.refresh")}
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">
                        {tab === "staffs" ? t("staffApprovals.staffsCardTitle") : t("staffApprovals.approvalsCardTitle")}
                    </div>
                    <div className="text-xs text-gray-500">
                        {t("common.totalCount", { count: tab === "staffs" ? staffTotal : pendingTotal })}
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {tab === "staffs" ? (
                        <>
                            <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
                                <div className="flex-1">
                                    <input
                                        value={staffQ}
                                        onChange={(e) => setStaffQ(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                void loadStaffs();
                                            }
                                        }}
                                        placeholder={t("common.search")}
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>
                            </div>

                            {staffLoading && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t("common.loading")}
                                </div>
                            )}

                            {staffErr && !staffLoading && (
                                <div
                                    role="alert"
                                    aria-live="polite"
                                    className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4 flex items-start justify-between gap-3"
                                >
                                    <div className="min-w-0">{staffErr}</div>
                                    <button type="button" onClick={loadStaffs} className="btn-outline shrink-0">
                                        {t("common.refresh")}
                                    </button>
                                </div>
                            )}

                            {!staffLoading && !staffErr ? (
                                staffItems.length === 0 ? (
                                    <div className="flex items-start gap-3 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-4">
                                        <UserCheck className="h-5 w-5 text-gray-500 mt-0.5" />
                                        <div>
                                            <div className="font-medium text-gray-900">{t("staffApprovals.staffsEmptyTitle")}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">{t("staffApprovals.staffsEmptyHint")}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-gray-50">
                                                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                    <th className="px-4 py-3 text-left">{t("staffApprovals.table.staff")}</th>
                                                    <th className="px-4 py-3 text-left">{t("staffApprovals.table.role")}</th>
                                                    <th className="px-4 py-3 text-left">{t("staffApprovals.table.account")}</th>
                                                    <th className="px-4 py-3 text-left">{t("staffApprovals.table.status")}</th>
                                                    <th className="px-4 py-3 text-left">{t("staffApprovals.table.lastSeen")}</th>
                                                </tr>
                                            </thead>

                                            <tbody className="divide-y divide-gray-100">
                                                {staffItems.map((s) => {
                                                    const roleName = s.role?.name || getRoleLabelById(s.role_id) || "—";

                                                    const online =
                                                        typeof s.is_online === "boolean"
                                                            ? s.is_online
                                                            : (() => {
                                                                const d = safeDate(s.last_seen_at ?? null);
                                                                if (!d) return false;
                                                                return Date.now() - d.getTime() <= 15 * 60_000;
                                                            })();

                                                    return (
                                                        <tr key={s.staff_id} className="hover:bg-gray-50/60">
                                                            <td className="px-4 py-3">
                                                                <div className="font-medium text-gray-900">{s.name}</div>
                                                            </td>
                                                            <td className="px-4 py-3 text-gray-700">{roleName}</td>
                                                            <td className="px-4 py-3 text-gray-700">{s.email}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={online ? chipClass("good") : chipClass("neutral")}>
                                                                    {online ? t("staffApprovals.statusOnline") : t("staffApprovals.statusOffline")}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-gray-700">
                                                                {formatLastSeen(s.last_seen_at ?? null)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            ) : null}
                        </>
                    ) : (
                        <>
                            {pendingLoading && (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {t("staffApprovals.loading")}
                                </div>
                            )}

                            {pendingErr && !pendingLoading && (
                                <div
                                    role="alert"
                                    aria-live="polite"
                                    className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mb-4 flex items-start justify-between gap-3"
                                >
                                    <div className="min-w-0">{pendingErr}</div>
                                    <button type="button" onClick={loadPending} className="btn-outline shrink-0">
                                        {t("common.refresh")}
                                    </button>
                                </div>
                            )}

                            {!pendingLoading && !pendingErr && (
                                <>
                                    {pendingItems.length === 0 ? (
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
                                                    {pendingItems.map((s) => {
                                                        const busy = busyRowId === s.staff_id;
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
                                                                            onClick={() => openApprove(s)}
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
                                                                            onClick={() => openReject(s)}
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
                        </>
                    )}
                </div>
            </div>

            <StaffApprovalDecisionModal
                open={modalOpen}
                mode={modalMode}
                staff={selectedStaff}
                busy={modalBusy}
                error={modalErr}
                onClose={closeModal}
                onConfirm={onConfirmModal}
            />
        </div>
    );
};