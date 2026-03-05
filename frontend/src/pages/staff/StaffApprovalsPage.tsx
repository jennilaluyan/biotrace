import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
    approveStaff,
    fetchPendingStaffs,
    fetchStaffs,
    rejectStaff,
    type PendingStaff,
    type StaffRow,
} from "../../services/staffApprovals";
import { getUserRoleLabel } from "../../utils/roles";
import StaffApprovalDecisionModal from "../../components/staff/StaffApprovalDecisionModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type TabKey = "staffs" | "approvals";

type ApiErrorLike = {
    response?: { data?: any };
    data?: any;
    message?: string;
};

function getErrMsg(err: unknown, fallback: string) {
    const e = err as ApiErrorLike;
    return (
        e?.response?.data?.message ||
        e?.data?.message ||
        e?.message ||
        fallback
    );
}

function unwrapList<T>(res: any): T[] {
    const x = res?.data ?? res;
    if (Array.isArray(x)) return x;
    if (Array.isArray(x?.data)) return x.data;
    if (Array.isArray(x?.items)) return x.items;
    return [];
}

export const StaffApprovalsPage = () => {
    const { t } = useTranslation();

    // Hindari effect loop gara-gara function identity berubah-ubah
    const tRef = useRef(t);
    useEffect(() => {
        tRef.current = t;
    }, [t]);

    const [tab, setTab] = useState<TabKey>("staffs");

    // Staff list tab
    const [staffQ, setStaffQ] = useState("");
    const [staffs, setStaffs] = useState<StaffRow[]>([]);
    const [staffLoading, setStaffLoading] = useState(false);
    const [staffErr, setStaffErr] = useState<string | null>(null);

    // Approvals tab
    const [pending, setPending] = useState<PendingStaff[]>([]);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [pendingErr, setPendingErr] = useState<string | null>(null);

    // Modal approve/reject
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"approve" | "reject">("approve");
    const [selected, setSelected] = useState<PendingStaff | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const loadStaffs = useCallback(async () => {
        setStaffErr(null);
        setStaffLoading(true);

        try {
            const res = await fetchStaffs();
            const rows = unwrapList<StaffRow>(res);
            setStaffs(rows);
        } catch (err) {
            setStaffErr(
                getErrMsg(
                    err,
                    tRef.current("errors.generic", {
                        defaultValue: "Gagal memuat daftar staf.",
                    }),
                ),
            );
            // penting: hanya kosongkan kalau error (bukan setiap loading)
            setStaffs([]);
        } finally {
            setStaffLoading(false);
        }
    }, []);

    const loadPending = useCallback(async () => {
        setPendingErr(null);
        setPendingLoading(true);

        try {
            const res = await fetchPendingStaffs();
            const rows = unwrapList<PendingStaff>(res);
            setPending(rows);
        } catch (err) {
            setPendingErr(
                getErrMsg(
                    err,
                    tRef.current("errors.generic", {
                        defaultValue: "Gagal memuat permintaan persetujuan staf.",
                    }),
                ),
            );
            setPending([]);
        } finally {
            setPendingLoading(false);
        }
    }, []);

    useEffect(() => {
        // load sekali saat mount (nggak loop, nggak flicker)
        void loadStaffs();
        void loadPending();
    }, [loadStaffs, loadPending]);

    const onRefresh = useCallback(() => {
        if (tab === "staffs") return void loadStaffs();
        return void loadPending();
    }, [tab, loadStaffs, loadPending]);

    const filteredStaffs = useMemo(() => {
        const q = staffQ.trim().toLowerCase();
        if (!q) return staffs;

        return staffs.filter((s) => {
            const roleName =
                s.role?.name ||
                getUserRoleLabel(s.role_id) ||
                String(s.role_id ?? "");
            return (
                String(s.name ?? "").toLowerCase().includes(q) ||
                String(s.email ?? "").toLowerCase().includes(q) ||
                String(roleName).toLowerCase().includes(q)
            );
        });
    }, [staffQ, staffs]);

    const pageTitle =
        t("staffPage.title", {
            defaultValue: t("nav.staffApprovals", { defaultValue: "Staf" }),
        }) || "Staf";

    const pageSubtitle =
        t("staffPage.subtitle", {
            defaultValue:
                "Kelola daftar staf dan setujui permintaan akun staf baru.",
        }) || "";

    const tabStaffsLabel =
        t("staffPage.tabs.staffs", { defaultValue: t("staffs", { defaultValue: "Staf" }) }) || "Staf";

    const tabApprovalsLabel =
        t("staffPage.tabs.approvals", {
            defaultValue: t("staff.approvals.title", { defaultValue: "Persetujuan" }),
        }) || "Persetujuan";

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">
                        {pageTitle}
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">{pageSubtitle}</p>

                    {/* Tabs */}
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            className={cx(
                                "px-3 py-1.5 rounded-full text-sm border transition",
                                tab === "staffs"
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                            )}
                            onClick={() => setTab("staffs")}
                        >
                            {tabStaffsLabel}
                        </button>

                        <button
                            type="button"
                            className={cx(
                                "px-3 py-1.5 rounded-full text-sm border transition",
                                tab === "approvals"
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50",
                            )}
                            onClick={() => setTab("approvals")}
                        >
                            {tabApprovalsLabel}
                        </button>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onRefresh}
                    className="px-4 py-2 rounded-full border border-red-300 text-red-600 bg-white hover:bg-red-50 transition flex items-center gap-2"
                    title={t("common.refresh", { defaultValue: "Muat ulang" })}
                >
                    <RefreshCw
                        className={cx(
                            "w-4 h-4",
                            (tab === "staffs" ? staffLoading : pendingLoading) &&
                            "animate-spin",
                        )}
                    />
                    {t("common.refresh", { defaultValue: "Muat ulang" })}
                </button>
            </div>

            {/* Card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                    <div className="font-semibold text-gray-900">
                        {tab === "staffs"
                            ? t("staffPage.staffs.cardTitle", {
                                defaultValue: "Daftar staf",
                            })
                            : t("staff.approvals.cardTitle", {
                                defaultValue: "Permintaan persetujuan",
                            })}
                    </div>

                    <div className="text-sm text-gray-500">
                        {t("common.totalCount", { defaultValue: "Total" })}:{" "}
                        {tab === "staffs"
                            ? filteredStaffs.length
                            : pending.length}
                    </div>
                </div>

                {/* Search (hanya tab staf) */}
                {tab === "staffs" && (
                    <div className="px-5 py-4">
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                                placeholder={t("staffPage.staffs.searchPlaceholder", {
                                    defaultValue: t("search", { defaultValue: "Cari" }),
                                })}
                                value={staffQ}
                                onChange={(e) => setStaffQ(e.target.value)}
                            />
                        </div>
                        {staffErr && (
                            <p className="mt-3 text-sm text-red-600">{staffErr}</p>
                        )}
                    </div>
                )}

                {/* Content */}
                <div className="px-5 pb-5">
                    {tab === "staffs" ? (
                        <>
                            {staffLoading && staffs.length === 0 ? (
                                <p className="text-sm text-gray-500 py-3">
                                    {t("loading", { defaultValue: "Memuat..." })}
                                </p>
                            ) : filteredStaffs.length === 0 ? (
                                <div className="py-8 text-center text-sm text-gray-500">
                                    {t("staffPage.staffs.emptyTitle", {
                                        defaultValue: "Belum ada staf.",
                                    })}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-gray-500">
                                            <tr className="border-b border-gray-100">
                                                <th className="py-3 pr-3">
                                                    {t("staffPage.staffs.table.staff", {
                                                        defaultValue: "Staf",
                                                    })}
                                                </th>
                                                <th className="py-3 pr-3">
                                                    {t("staffPage.staffs.table.role", {
                                                        defaultValue: "Peran",
                                                    })}
                                                </th>
                                                <th className="py-3 pr-3">
                                                    {t("staffPage.staffs.table.account", {
                                                        defaultValue: "Akun",
                                                    })}
                                                </th>
                                                <th className="py-3">
                                                    {t("staffPage.staffs.table.presence", {
                                                        defaultValue: "Status",
                                                    })}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-800">
                                            {filteredStaffs.map((s) => {
                                                const roleName =
                                                    s.role?.name ||
                                                    getUserRoleLabel(s.role_id) ||
                                                    String(s.role_id ?? "-");

                                                const isOnline = Boolean(s.is_online);
                                                const presenceLabel = isOnline
                                                    ? t("staffPage.staffs.status.online", {
                                                        defaultValue: "Online",
                                                    })
                                                    : t("staffPage.staffs.status.offline", {
                                                        defaultValue: "Offline",
                                                    });

                                                return (
                                                    <tr
                                                        key={s.staff_id}
                                                        className="border-b border-gray-50 last:border-0"
                                                    >
                                                        <td className="py-3 pr-3">
                                                            <div className="font-medium">
                                                                {s.name}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                ID: {s.staff_id}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 pr-3">
                                                            {roleName}
                                                        </td>
                                                        <td className="py-3 pr-3">
                                                            <div>{s.email}</div>
                                                            <div className="text-xs text-gray-500">
                                                                {s.is_active
                                                                    ? t("common.active", { defaultValue: "Aktif" })
                                                                    : t("common.inactive", { defaultValue: "Nonaktif" })}
                                                            </div>
                                                        </td>
                                                        <td className="py-3">
                                                            <span
                                                                className={cx(
                                                                    "inline-flex items-center px-2 py-1 rounded-full text-xs border",
                                                                    isOnline
                                                                        ? "bg-green-50 text-green-700 border-green-200"
                                                                        : "bg-gray-50 text-gray-600 border-gray-200",
                                                                )}
                                                            >
                                                                {presenceLabel}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    ) : (
                        <>
                            {pendingErr && (
                                <p className="mt-3 text-sm text-red-600">
                                    {pendingErr}
                                </p>
                            )}

                            {pendingLoading && pending.length === 0 ? (
                                <p className="text-sm text-gray-500 py-3">
                                    {t("staff.approvals.loading", {
                                        defaultValue: t("loading", { defaultValue: "Memuat..." }),
                                    })}
                                </p>
                            ) : pending.length === 0 ? (
                                <div className="py-8 text-center text-sm text-gray-500">
                                    {t("staff.approvals.emptyTitle", {
                                        defaultValue:
                                            "Tidak ada permintaan persetujuan.",
                                    })}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-gray-500">
                                            <tr className="border-b border-gray-100">
                                                <th className="py-3 pr-3">
                                                    {t("staffApprovals.table.staff", {
                                                        defaultValue: "Staf",
                                                    })}
                                                </th>
                                                <th className="py-3 pr-3">
                                                    {t("staffApprovals.table.role", {
                                                        defaultValue: "Peran",
                                                    })}
                                                </th>
                                                <th className="py-3 pr-3">
                                                    {t("staffApprovals.table.createdAt", {
                                                        defaultValue: "Dibuat",
                                                    })}
                                                </th>
                                                <th className="py-3">
                                                    {t("staffApprovals.table.actions", {
                                                        defaultValue: "Aksi",
                                                    })}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-800">
                                            {pending.map((s) => (
                                                <tr
                                                    key={s.staff_id}
                                                    className="border-b border-gray-50 last:border-0"
                                                >
                                                    <td className="py-3 pr-3">
                                                        <div className="font-medium">
                                                            {s.name}
                                                        </div>
                                                        <div className="text-xs text-gray-500">
                                                            {s.email}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 pr-3">
                                                        {getUserRoleLabel(s.role_id) ||
                                                            String(s.role_id)}
                                                    </td>
                                                    <td className="py-3 pr-3">
                                                        {s.created_at
                                                            ? new Date(s.created_at).toLocaleString()
                                                            : "-"}
                                                    </td>
                                                    <td className="py-3">
                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                className="px-3 py-1.5 rounded-lg text-sm border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition"
                                                                disabled={submitting}
                                                                onClick={() => {
                                                                    setSelected(s);
                                                                    setModalMode("approve");
                                                                    setModalOpen(true);
                                                                }}
                                                            >
                                                                {t("common.approve", {
                                                                    defaultValue: "Setujui",
                                                                })}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="px-3 py-1.5 rounded-lg text-sm border border-red-200 text-red-700 bg-red-50 hover:bg-red-100 transition"
                                                                disabled={submitting}
                                                                onClick={() => {
                                                                    setSelected(s);
                                                                    setModalMode("reject");
                                                                    setModalOpen(true);
                                                                }}
                                                            >
                                                                {t("common.reject", {
                                                                    defaultValue: "Tolak",
                                                                })}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <StaffApprovalDecisionModal
                open={modalOpen}
                mode={modalMode}
                staff={selected}
                submitting={submitting}
                onClose={() => {
                    if (!submitting) setModalOpen(false);
                }}
                onConfirm={async (note?: string) => {
                    if (!selected) return;

                    setSubmitting(true);
                    try {
                        if (modalMode === "approve") {
                            await approveStaff(selected.staff_id);
                        } else {
                            await rejectStaff(selected.staff_id, {
                                note: String(note ?? "").trim(),
                            });
                        }

                        setModalOpen(false);
                        setSelected(null);

                        // refresh approvals tab after action (tanpa bikin loop)
                        await loadPending();
                    } catch (err) {
                        setPendingErr(
                            getErrMsg(
                                err,
                                tRef.current("errors.generic", {
                                    defaultValue: "Terjadi kesalahan.",
                                }),
                            ),
                        );
                    } finally {
                        setSubmitting(false);
                    }
                }}
            />
        </div>
    );
};