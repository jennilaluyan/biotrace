import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Search,
    ClipboardList,
    FilePlus2,
    Check,
    X,
} from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";
import { api } from "../../services/api";
import {
    fetchParameterRequests,
    type ParameterRequestRow,
    type Paginator,
    type ParameterRequestStatus,
} from "../../services/parameterRequests";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type TabKey = "parameters" | "requests";

type ParameterRow = {
    parameter_id: number;
    catalog_no?: number | null;
    code: string;
    name: string;
    unit?: string | null;
    unit_id?: number | null;
    method_ref?: string | null;
    status: "Active" | "Inactive";
    tag: "Routine" | "Research";
    created_at?: string;
    updated_at?: string | null;

    // optional (kalau suatu saat backend tambahkan)
    workflow_group?: string | null;
    category?: string | null;
};

type ParamPager = Paginator<ParameterRow>;

function prettyCategory(v?: string | null) {
    const s = String(v ?? "").trim().toLowerCase();
    if (!s) return "—";
    if (s === "pcr") return "PCR";
    if (s === "sequencing") return "Sequencing";
    if (s === "rapid") return "Rapid";
    if (s === "microbiology") return "Microbiology";
    return s.replace(/_/g, " ");
}

function chipClass(kind: "neutral" | "good" | "bad" | "warn" = "neutral") {
    return cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border",
        kind === "good" && "bg-emerald-50 text-emerald-700 border-emerald-100",
        kind === "bad" && "bg-rose-50 text-rose-700 border-rose-100",
        kind === "warn" && "bg-amber-50 text-amber-800 border-amber-100",
        kind === "neutral" && "bg-gray-50 text-gray-700 border-gray-100"
    );
}

function statusChip(status: string) {
    const s = String(status ?? "").toLowerCase().trim();
    if (s === "approved") return <span className={chipClass("good")}>approved</span>;
    if (s === "rejected") return <span className={chipClass("bad")}>rejected</span>;
    if (s === "pending") return <span className={chipClass("warn")}>pending</span>;
    return <span className={chipClass("neutral")}>{s || "—"}</span>;
}

export default function ParametersPage() {
    const { t } = useTranslation();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const isSampleCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const canSeeRequestsTab = !isSampleCollector;

    const canCreateRequest = roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.ANALYST;
    const canApproveReject = roleId === ROLE_ID.OPERATIONAL_MANAGER || roleId === ROLE_ID.LAB_HEAD;

    const [tab, setTab] = useState<TabKey>("parameters");

    // Parameters tab state
    const [pQ, setPQ] = useState("");
    const [pPage, setPPage] = useState(1);
    const [pPerPage, setPPerPage] = useState(20);
    const [pLoading, setPLoading] = useState(false);
    const [pError, setPError] = useState<string | null>(null);
    const [pData, setPData] = useState<ParamPager | null>(null);

    // Requests tab state
    const [rQ, setRQ] = useState("");
    const [rStatus, setRStatus] = useState<ParameterRequestStatus | "all">("pending");
    const [rPage, setRPage] = useState(1);
    const [rPerPage, setRPerPage] = useState(20);
    const [rLoading, setRLoading] = useState(false);
    const [rError, setRError] = useState<string | null>(null);
    const [rData, setRData] = useState<Paginator<ParameterRequestRow> | null>(null);

    // guard: Sample Collector tidak boleh nyangkut di tab requests
    useEffect(() => {
        if (!canSeeRequestsTab && tab === "requests") setTab("parameters");
    }, [canSeeRequestsTab, tab]);

    async function loadParameters() {
        setPLoading(true);
        setPError(null);
        try {
            const res = await api.get<ParamPager>("/v1/parameters", {
                params: { q: pQ.trim() || undefined, page: pPage, per_page: pPerPage },
            });
            setPData(res);
        } catch (e: any) {
            setPError(getErrorMessage(e, t("parametersPage.errors.loadParametersFailed")));
        } finally {
            setPLoading(false);
        }
    }

    async function loadRequests() {
        if (!canSeeRequestsTab) return;
        setRLoading(true);
        setRError(null);
        try {
            const res = await fetchParameterRequests({
                q: rQ.trim() || undefined,
                status: rStatus,
                page: rPage,
                per_page: rPerPage,
            });
            setRData(res);
        } catch (e: any) {
            setRError(getErrorMessage(e, t("parametersPage.errors.loadRequestsFailed")));
        } finally {
            setRLoading(false);
        }
    }

    useEffect(() => {
        loadParameters();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pPage, pPerPage]);

    useEffect(() => {
        if (!canSeeRequestsTab) return;
        loadRequests();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rPage, rPerPage, rStatus, canSeeRequestsTab]);

    const paramsRows = useMemo(() => pData?.data ?? [], [pData]);
    const reqRows = useMemo(() => rData?.data ?? [], [rData]);

    return (
        <div className="p-5 space-y-5">
            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <ClipboardList className="text-gray-700" size={18} />
                                <h1 className="text-base sm:text-lg font-extrabold text-gray-900">
                                    {t("parametersPage.title")}
                                </h1>
                            </div>
                            <p className="mt-1 text-sm text-gray-600">{t("parametersPage.subtitle")}</p>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                className={cx(
                                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                    "border-gray-200 bg-white text-gray-800 hover:bg-gray-50"
                                )}
                                onClick={() => (tab === "parameters" ? loadParameters() : loadRequests())}
                                title={t("parametersPage.actions.refresh")}
                            >
                                <RefreshCw size={16} />
                                <span className="hidden sm:inline">{t("parametersPage.actions.refresh")}</span>
                            </button>

                            {tab === "requests" && canCreateRequest && (
                                <button
                                    className={cx(
                                        "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                                        "bg-gray-900 text-white hover:bg-gray-800"
                                    )}
                                    disabled
                                    title={t("parametersPage.hints.createComingSoon")}
                                >
                                    <FilePlus2 size={16} />
                                    <span className="hidden sm:inline">{t("parametersPage.actions.addRequest")}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mt-4 flex items-center gap-2">
                        <button
                            className={cx(
                                "rounded-xl px-3 py-2 text-sm font-bold border",
                                tab === "parameters"
                                    ? "bg-gray-900 text-white border-gray-900"
                                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                            )}
                            onClick={() => setTab("parameters")}
                        >
                            {t("parametersPage.tabs.parameters")}
                        </button>

                        {canSeeRequestsTab && (
                            <button
                                className={cx(
                                    "rounded-xl px-3 py-2 text-sm font-bold border",
                                    tab === "requests"
                                        ? "bg-gray-900 text-white border-gray-900"
                                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                                )}
                                onClick={() => setTab("requests")}
                            >
                                {t("parametersPage.tabs.requests")}
                            </button>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="px-5 py-5 space-y-4">
                    {/* PARAMETERS TAB */}
                    {tab === "parameters" && (
                        <>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="relative w-full sm:max-w-md">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={pQ}
                                        onChange={(e) => setPQ(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                setPPage(1);
                                                loadParameters();
                                            }
                                        }}
                                        placeholder={t("parametersPage.filters.searchParameters")}
                                        className={cx(
                                            "w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm",
                                            "outline-none focus:ring-2 focus:ring-gray-200"
                                        )}
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600">{t("parametersPage.filters.perPage")}</span>
                                    <select
                                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                                        value={pPerPage}
                                        onChange={(e) => {
                                            setPPerPage(Number(e.target.value));
                                            setPPage(1);
                                        }}
                                    >
                                        {[10, 20, 50, 100].map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {pError && (
                                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                                    {pError}
                                </div>
                            )}

                            <div className="overflow-x-auto rounded-2xl border border-gray-100">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr className="text-left text-gray-700">
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.code")}</th>
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.name")}</th>
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.category")}</th>
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.status")}</th>
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.tag")}</th>
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.updatedAt")}</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {pLoading ? (
                                            <tr>
                                                <td className="px-4 py-6 text-gray-600" colSpan={6}>
                                                    {t("parametersPage.loading.parameters")}
                                                </td>
                                            </tr>
                                        ) : paramsRows.length === 0 ? (
                                            <tr>
                                                <td className="px-4 py-6 text-gray-600" colSpan={6}>
                                                    {t("parametersPage.empty.parameters")}
                                                </td>
                                            </tr>
                                        ) : (
                                            paramsRows.map((row) => {
                                                const cat = row.workflow_group ?? row.category ?? null;
                                                return (
                                                    <tr key={row.parameter_id} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 font-semibold text-gray-900">{row.code}</td>
                                                        <td className="px-4 py-3 text-gray-800">{row.name}</td>
                                                        <td className="px-4 py-3 text-gray-700">
                                                            <span className={chipClass("neutral")}>{prettyCategory(cat)}</span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={row.status === "Active" ? chipClass("good") : chipClass("bad")}>
                                                                {row.status === "Active" ? "active" : "inactive"}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={chipClass("neutral")}>{String(row.tag ?? "").toLowerCase()}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">
                                                            {row.updated_at ? formatDateTimeLocal(row.updated_at) : "—"}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {pData && pData.last_page > 1 && (
                                <div className="flex items-center justify-between pt-2">
                                    <div className="text-xs text-gray-600">
                                        {t("parametersPage.pagination.page")} {pData.current_page} / {pData.last_page}
                                        <span className="ml-2">• {t("parametersPage.pagination.total")} {pData.total}</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50 disabled:opacity-50"
                                            onClick={() => setPPage((x) => Math.max(1, x - 1))}
                                            disabled={pData.current_page <= 1}
                                            title={t("parametersPage.pagination.prev")}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        <button
                                            className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50 disabled:opacity-50"
                                            onClick={() => setPPage((x) => Math.min(pData.last_page, x + 1))}
                                            disabled={pData.current_page >= pData.last_page}
                                            title={t("parametersPage.pagination.next")}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* REQUESTS TAB */}
                    {tab === "requests" && canSeeRequestsTab && (
                        <>
                            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                                <div className="relative w-full lg:max-w-md">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        value={rQ}
                                        onChange={(e) => setRQ(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                setRPage(1);
                                                loadRequests();
                                            }
                                        }}
                                        placeholder={t("parametersPage.filters.searchRequests")}
                                        className={cx(
                                            "w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-sm",
                                            "outline-none focus:ring-2 focus:ring-gray-200"
                                        )}
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600">{t("parametersPage.filters.status")}</span>
                                    <select
                                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                                        value={rStatus}
                                        onChange={(e) => {
                                            setRStatus(e.target.value as any);
                                            setRPage(1);
                                        }}
                                    >
                                        <option value="pending">pending</option>
                                        <option value="approved">approved</option>
                                        <option value="rejected">rejected</option>
                                        <option value="all">{t("parametersPage.filters.all")}</option>
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-600">{t("parametersPage.filters.perPage")}</span>
                                    <select
                                        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
                                        value={rPerPage}
                                        onChange={(e) => {
                                            setRPerPage(Number(e.target.value));
                                            setRPage(1);
                                        }}
                                    >
                                        {[10, 20, 50, 100].map((n) => (
                                            <option key={n} value={n}>
                                                {n}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {rError && (
                                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                                    {rError}
                                </div>
                            )}

                            <div className="overflow-x-auto rounded-2xl border border-gray-100">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50">
                                        <tr className="text-left text-gray-700">
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.requestName")}</th>
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.category")}</th>
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.status")}</th>
                                            <th className="px-4 py-3 font-bold">{t("parametersPage.table.requestedAt")}</th>
                                            <th className="px-4 py-3 font-bold text-right">{t("parametersPage.table.actions")}</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {rLoading ? (
                                            <tr>
                                                <td className="px-4 py-6 text-gray-600" colSpan={5}>
                                                    {t("parametersPage.loading.requests")}
                                                </td>
                                            </tr>
                                        ) : reqRows.length === 0 ? (
                                            <tr>
                                                <td className="px-4 py-6 text-gray-600" colSpan={5}>
                                                    {t("parametersPage.empty.requests")}
                                                </td>
                                            </tr>
                                        ) : (
                                            reqRows.map((row) => (
                                                <tr key={row.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-semibold text-gray-900">{row.parameter_name}</td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        <span className={chipClass("neutral")}>{prettyCategory(row.category)}</span>
                                                    </td>
                                                    <td className="px-4 py-3">{statusChip(row.status)}</td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {row.requested_at ? formatDateTimeLocal(row.requested_at) : "—"}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {canApproveReject ? (
                                                                <>
                                                                    <button
                                                                        className={cx(
                                                                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                                                            "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                                                                        )}
                                                                        disabled
                                                                        title={t("parametersPage.hints.approveRejectComingSoon")}
                                                                    >
                                                                        <Check size={16} />
                                                                        {t("parametersPage.actions.approve")}
                                                                    </button>
                                                                    <button
                                                                        className={cx(
                                                                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold",
                                                                            "border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                                                                        )}
                                                                        disabled
                                                                        title={t("parametersPage.hints.approveRejectComingSoon")}
                                                                    >
                                                                        <X size={16} />
                                                                        {t("parametersPage.actions.reject")}
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <span className="text-xs text-gray-500">{t("parametersPage.hints.actionsRestricted")}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            {rData && rData.last_page > 1 && (
                                <div className="flex items-center justify-between pt-2">
                                    <div className="text-xs text-gray-600">
                                        {t("parametersPage.pagination.page")} {rData.current_page} / {rData.last_page}
                                        <span className="ml-2">• {t("parametersPage.pagination.total")} {rData.total}</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50 disabled:opacity-50"
                                            onClick={() => setRPage((x) => Math.max(1, x - 1))}
                                            disabled={rData.current_page <= 1}
                                            title={t("parametersPage.pagination.prev")}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        <button
                                            className="rounded-xl border border-gray-200 bg-white p-2 hover:bg-gray-50 disabled:opacity-50"
                                            onClick={() => setRPage((x) => Math.min(rData.last_page, x + 1))}
                                            disabled={rData.current_page >= rData.last_page}
                                            title={t("parametersPage.pagination.next")}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Small helper note */}
            <div className="text-xs text-gray-500">
                {t("parametersPage.hints.enterToSearch")}
            </div>
        </div>
    );
}