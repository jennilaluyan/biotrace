import { useCallback, useEffect, useMemo, useState } from "react";
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
    Pencil,
    Eye,
    Loader2,
} from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";
import { api } from "../../services/api";
import {
    acknowledgeParameterRequest,
    approveParameterRequest,
    fetchParameterRequests,
    rejectParameterRequest,
    type ParameterRequestRow,
    type Paginator,
    type ParameterRequestStatus,
} from "../../services/parameterRequests";

import ParameterRequestCreateModal from "../../components/parameters/ParameterRequestCreateModal";
import ParameterRequestDecisionModal from "../../components/parameters/ParameterRequestDecisionModal";
import ParameterEditModal, { type ParameterEditRow } from "../../components/parameters/ParameterEditModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

/**
 * Some endpoints wrap payload as:
 * { success, message, data: T }
 * Others may return T directly (legacy).
 *
 * This helper keeps the page resilient without touching the api service layer.
 */
function unwrapApiData<T>(res: any): T {
    const body = res?.data ?? res;
    const isEnvelope =
        body &&
        typeof body === "object" &&
        "data" in body &&
        (("success" in body && typeof (body as any).success === "boolean") ||
            "message" in body ||
            "extra" in body ||
            "error" in body);

    return (isEnvelope ? (body as any).data : body) as T;
}

type TabKey = "parameters" | "requests";

type ParameterRow = {
    parameter_id: number;
    catalog_no?: number | null;
    code: string;
    name: string;
    status: "Active" | "Inactive";
    tag: "Routine" | "Research";
    created_at?: string;
    updated_at?: string | null;
    workflow_group?: string | null;
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

function isDecidedRow(row: ParameterRequestRow) {
    const s = String(row.status ?? "").toLowerCase().trim();
    return s === "approved" || s === "rejected";
}

export default function ParametersPage() {
    const { t } = useTranslation();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);

    const isSampleCollector = roleId === ROLE_ID.SAMPLE_COLLECTOR;
    const canSeeRequestsTab = !isSampleCollector;

    // Admin/Analyst can submit requests (create OR update request)
    const canCreateRequest = roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.ANALYST;

    // Only OM/LH can approve/reject requests
    const canApproveReject = roleId === ROLE_ID.OPERATIONAL_MANAGER || roleId === ROLE_ID.LAB_HEAD;

    // Admin/Analyst can open "edit" modal (which submits UPDATE request)
    const canEditParameters = roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.ANALYST;

    const [tab, setTab] = useState<TabKey>("parameters");

    // Parameters tab
    const [pQ, setPQ] = useState("");
    const [pPage, setPPage] = useState(1);
    const [pPerPage, setPPerPage] = useState(20);
    const [pLoading, setPLoading] = useState(false);
    const [pError, setPError] = useState<string | null>(null);
    const [pData, setPData] = useState<ParamPager | null>(null);

    // Requests tab
    const [rQ, setRQ] = useState("");
    const [rStatus, setRStatus] = useState<ParameterRequestStatus | "all">("pending");
    const [rPage, setRPage] = useState(1);
    const [rPerPage, setRPerPage] = useState(20);
    const [rLoading, setRLoading] = useState(false);
    const [rError, setRError] = useState<string | null>(null);
    const [rData, setRData] = useState<Paginator<ParameterRequestRow> | null>(null);

    const [createOpen, setCreateOpen] = useState(false);

    // Decision modal (OM/LH)
    const [decisionOpen, setDecisionOpen] = useState(false);
    const [decisionMode, setDecisionMode] = useState<"approve" | "reject">("approve");
    const [decisionTarget, setDecisionTarget] = useState<ParameterRequestRow | null>(null);
    const [decisionNote, setDecisionNote] = useState("");
    const [decisionSubmitting, setDecisionSubmitting] = useState(false);
    const [decisionError, setDecisionError] = useState<string | null>(null);

    // Edit parameter modal (submits UPDATE request)
    const [editOpen, setEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<ParameterEditRow | null>(null);

    // Requester "read receipt" (acknowledge)
    const [ackBusyId, setAckBusyId] = useState<number | null>(null);
    const [ackChecked, setAckChecked] = useState<Record<number, boolean>>({});

    const paramsRows = useMemo(() => pData?.data ?? [], [pData]);
    const reqRows = useMemo(() => rData?.data ?? [], [rData]);

    const staffId = useMemo(() => {
        const u: any = user;
        const v = u?.staff_id ?? u?.staffId ?? u?.id ?? null;
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
    }, [user]);

    const loadParameters = useCallback(async () => {
        setPLoading(true);
        setPError(null);

        try {
            const res = await api.get("/v1/parameters", {
                params: { q: pQ.trim() || undefined, page: pPage, per_page: pPerPage },
            });
            setPData(unwrapApiData(res));
        } catch (e: any) {
            setPError(getErrorMessage(e, t("parametersPage.errors.loadParametersFailed")));
        } finally {
            setPLoading(false);
        }
    }, [pQ, pPage, pPerPage, t]);

    const refreshRequests = useCallback(
        async (opts?: { q?: string; status?: ParameterRequestStatus | "all"; page?: number; per_page?: number }) => {
            if (!canSeeRequestsTab) return;

            const q = (opts?.q ?? rQ).trim();
            const status = opts?.status ?? rStatus;
            const page = opts?.page ?? rPage;
            const perPage = opts?.per_page ?? rPerPage;

            setRLoading(true);
            setRError(null);

            try {
                const res = await fetchParameterRequests({
                    q: q || undefined,
                    status,
                    page,
                    per_page: perPage,
                });
                setRData(res);
            } catch (e: any) {
                setRError(getErrorMessage(e, t("parametersPage.errors.loadRequestsFailed")));
            } finally {
                setRLoading(false);
            }
        },
        [canSeeRequestsTab, rQ, rStatus, rPage, rPerPage, t]
    );

    const openApprove = (row: ParameterRequestRow) => {
        setDecisionTarget(row);
        setDecisionMode("approve");
        setDecisionNote("");
        setDecisionError(null);
        setDecisionOpen(true);
    };

    const openReject = (row: ParameterRequestRow) => {
        setDecisionTarget(row);
        setDecisionMode("reject");
        setDecisionNote("");
        setDecisionError(null);
        setDecisionOpen(true);
    };

    const closeDecision = (allowForce = false) => {
        if (decisionSubmitting && !allowForce) return;
        setDecisionOpen(false);
        setDecisionTarget(null);
        setDecisionError(null);
        setDecisionNote("");
    };

    const confirmDecision = useCallback(async () => {
        if (!decisionTarget) return;

        setDecisionError(null);
        setDecisionSubmitting(true);

        try {
            const id = Number(decisionTarget.id);

            if (decisionMode === "approve") {
                await approveParameterRequest(id);

                // Approval can create a new parameter OR apply updates to an existing one
                await refreshRequests();
                await loadParameters();

                closeDecision(true);
                return;
            }

            const note = decisionNote.trim();
            if (!note) {
                setDecisionError(t("parametersPage.decisionModal.rejectNoteValidation"));
                return;
            }

            await rejectParameterRequest(id, note);
            await refreshRequests();
            closeDecision(true);
        } catch (e: any) {
            setDecisionError(
                getErrorMessage(
                    e,
                    decisionMode === "approve"
                        ? t("parametersPage.errors.approveFailed")
                        : t("parametersPage.errors.rejectFailed")
                )
            );
        } finally {
            setDecisionSubmitting(false);
        }
    }, [decisionTarget, decisionMode, decisionNote, refreshRequests, loadParameters, t]);

    const onRefreshClick = () => {
        if (tab === "parameters") loadParameters();
        else refreshRequests();
    };

    const openEdit = (row: ParameterRow) => {
        if (!canEditParameters) return;

        setEditTarget({
            parameter_id: row.parameter_id,
            code: row.code,
            name: row.name,
            workflow_group: row.workflow_group ?? null,
            status: row.status,
            tag: row.tag,
        });

        setEditOpen(true);
    };

    /**
     * A request is acknowledgeable when:
     * - current user is Admin/Analyst (requester role)
     * - row requested_by matches my staff_id
     * - row is decided (approved/rejected)
     * - requester_ack_at is still null
     */
    const canAcknowledgeRow = useCallback(
        (row: ParameterRequestRow) => {
            if (!canCreateRequest) return false;
            if (!staffId) return false;
            if ((row.requested_by ?? 0) !== staffId) return false;
            if (!isDecidedRow(row)) return false;
            if (row.requester_ack_at) return false;
            return true;
        },
        [canCreateRequest, staffId]
    );

    const acknowledge = useCallback(
        async (reqId: number) => {
            setAckBusyId(reqId);
            try {
                await acknowledgeParameterRequest(reqId);

                // Clear local checkbox state so it won't stay "checked" if row remains due to paging
                setAckChecked((m) => {
                    const next = { ...m };
                    delete next[reqId];
                    return next;
                });

                await refreshRequests();
            } catch (e: any) {
                setRError(getErrorMessage(e, t("parametersPage.errors.ackFailed", { defaultValue: "Failed to acknowledge." })));
            } finally {
                setAckBusyId(null);
            }
        },
        [refreshRequests, t]
    );

    useEffect(() => {
        if (!canSeeRequestsTab && tab === "requests") setTab("parameters");
    }, [canSeeRequestsTab, tab]);

    useEffect(() => {
        loadParameters();
    }, [loadParameters]);

    useEffect(() => {
        if (!canSeeRequestsTab) return;
        refreshRequests();
    }, [canSeeRequestsTab, refreshRequests]);

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between px-0 py-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="text-gray-700" size={18} />
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("parametersPage.title")}</h1>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{t("parametersPage.subtitle")}</p>

                    <div className="mt-3 flex items-center gap-2">
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

                        {canSeeRequestsTab ? (
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
                        ) : null}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={onRefreshClick}
                        aria-label={t("parametersPage.actions.refresh")}
                        title={t("parametersPage.actions.refresh")}
                    >
                        <RefreshCw size={16} className={cx((pLoading || rLoading) && "animate-spin")} />
                    </button>

                    {tab === "requests" && canCreateRequest ? (
                        <button
                            className={cx("lims-btn-primary gap-2", "disabled:opacity-50 disabled:cursor-not-allowed")}
                            onClick={() => setCreateOpen(true)}
                            title={t("parametersPage.actions.addRequest")}
                        >
                            <FilePlus2 size={16} />
                            <span className="hidden sm:inline">{t("parametersPage.actions.addRequest")}</span>
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white">
                    {tab === "parameters" ? (
                        <div className="flex flex-col md:flex-row gap-3 md:items-center">
                            <div className="flex-1">
                                <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                        <Search className="h-4 w-4" />
                                    </span>
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
                                        className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-600">{t("parametersPage.filters.perPage")}</span>
                                <select
                                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
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
                    ) : tab === "requests" && canSeeRequestsTab ? (
                        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                            <div className="flex-1">
                                <div className="relative">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                        <Search className="h-4 w-4" />
                                    </span>
                                    <input
                                        value={rQ}
                                        onChange={(e) => setRQ(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                setRPage(1);
                                                refreshRequests({ page: 1 });
                                            }
                                        }}
                                        placeholder={t("parametersPage.filters.searchRequests")}
                                        className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-600">{t("parametersPage.filters.status")}</span>
                                <select
                                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
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
                                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
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
                    ) : null}
                </div>

                <div className="px-4 md:px-6 py-4">
                    {tab === "parameters" ? (
                        <>
                            {pError ? (
                                <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{pError}</div>
                            ) : null}

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.code")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.name")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.category")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.status")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.tag")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.updatedAt")}</th>
                                            {canEditParameters ? (
                                                <th className="text-right font-semibold px-4 py-3">{t("parametersPage.table.actions")}</th>
                                            ) : null}
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {pLoading ? (
                                            <tr>
                                                <td className="px-4 py-6 text-gray-600" colSpan={canEditParameters ? 7 : 6}>
                                                    {t("parametersPage.loading.parameters")}
                                                </td>
                                            </tr>
                                        ) : paramsRows.length === 0 ? (
                                            <tr>
                                                <td className="px-4 py-6 text-gray-600" colSpan={canEditParameters ? 7 : 6}>
                                                    {t("parametersPage.empty.parameters")}
                                                </td>
                                            </tr>
                                        ) : (
                                            paramsRows.map((row) => (
                                                <tr key={row.parameter_id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-semibold text-gray-900">{row.code}</td>
                                                    <td className="px-4 py-3 text-gray-700">{row.name}</td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        <span className={chipClass("neutral")}>{prettyCategory(row.workflow_group)}</span>
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

                                                    {canEditParameters ? (
                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button"
                                                                    aria-label={t("parametersPage.actions.edit", { defaultValue: "Edit" })}
                                                                    title={t("parametersPage.actions.edit", { defaultValue: "Edit" })}
                                                                    onClick={() => openEdit(row)}
                                                                >
                                                                    <Pencil size={16} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    ) : null}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {pData && pData.last_page > 1 ? (
                                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                    <div className="text-xs text-gray-600">
                                        {t("parametersPage.pagination.page")} {pData.current_page} / {pData.last_page}
                                        <span className="ml-2">• {t("parametersPage.pagination.total")} {pData.total}</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            onClick={() => setPPage((x) => Math.max(1, x - 1))}
                                            disabled={pData.current_page <= 1}
                                            title={t("parametersPage.pagination.prev")}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <button
                                            className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            onClick={() => setPPage((x) => Math.min(pData.last_page, x + 1))}
                                            disabled={pData.current_page >= pData.last_page}
                                            title={t("parametersPage.pagination.next")}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : tab === "requests" && canSeeRequestsTab ? (
                        <>
                            {rError ? (
                                <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{rError}</div>
                            ) : null}

                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.requestName")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.category")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.status")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("parametersPage.table.requestedAt")}</th>
                                            <th className="text-right font-semibold px-4 py-3">{t("parametersPage.table.actions")}</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
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
                                            reqRows.map((row) => {
                                                const statusLower = String(row.status ?? "").toLowerCase().trim();
                                                const isPending = statusLower === "pending";
                                                const busy = rLoading || decisionSubmitting;

                                                const reqType = (row as any).request_type as string | undefined;
                                                const typeChip =
                                                    reqType === "update" ? (
                                                        <span className={chipClass("neutral")}>update</span>
                                                    ) : (
                                                        <span className={chipClass("neutral")}>new</span>
                                                    );

                                                const canAck = canAcknowledgeRow(row);
                                                const isAckBusy = ackBusyId === row.id;

                                                return (
                                                    <tr key={row.id} className="hover:bg-gray-50 align-top">
                                                        <td className="px-4 py-3 font-semibold text-gray-900">
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate">{row.parameter_name}</span>
                                                                {typeChip}
                                                            </div>

                                                            {/* Requester view: show decision reason/info before the row disappears */}
                                                            {canAck ? (
                                                                <div className="mt-2 text-xs text-gray-700">
                                                                    <div
                                                                        className={cx(
                                                                            "rounded-xl border px-3 py-2",
                                                                            statusLower === "rejected"
                                                                                ? "border-rose-200 bg-rose-50 text-rose-800"
                                                                                : "border-emerald-200 bg-emerald-50 text-emerald-800"
                                                                        )}
                                                                    >
                                                                        <div className="font-semibold flex items-center gap-2">
                                                                            <Eye className="h-4 w-4" />
                                                                            <span>
                                                                                {statusLower === "rejected"
                                                                                    ? t("parametersPage.ack.rejectionReasonTitle", {
                                                                                        defaultValue: "Rejection reason",
                                                                                    })
                                                                                    : t("parametersPage.ack.approvalTitle", {
                                                                                        defaultValue: "Approved",
                                                                                    })}
                                                                            </span>
                                                                        </div>

                                                                        <div className="mt-1 leading-relaxed">
                                                                            {statusLower === "rejected"
                                                                                ? row.decision_note?.trim()
                                                                                    ? row.decision_note
                                                                                    : t("parametersPage.ack.noReason", {
                                                                                        defaultValue: "No reason provided.",
                                                                                    })
                                                                                : t("parametersPage.ack.approvedInfo", {
                                                                                    defaultValue:
                                                                                        "Your request has been approved and applied.",
                                                                                })}
                                                                        </div>

                                                                        {row.decided_at ? (
                                                                            <div className="mt-1 text-[11px] opacity-80">
                                                                                {t("parametersPage.ack.decidedAt", { defaultValue: "Decided at" })}:{" "}
                                                                                {formatDateTimeLocal(row.decided_at)}
                                                                            </div>
                                                                        ) : null}

                                                                        <div className="mt-2 flex items-center gap-2">
                                                                            <label className="inline-flex items-center gap-2 text-xs">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    className="h-4 w-4"
                                                                                    checked={Boolean(ackChecked[row.id])}
                                                                                    disabled={isAckBusy}
                                                                                    onChange={(e) => {
                                                                                        const checked = e.target.checked;
                                                                                        setAckChecked((m) => ({ ...m, [row.id]: checked }));
                                                                                        if (checked) acknowledge(row.id);
                                                                                    }}
                                                                                />
                                                                                {t("parametersPage.ack.markRead", {
                                                                                    defaultValue: "I have read this decision",
                                                                                })}
                                                                            </label>

                                                                            {isAckBusy ? (
                                                                                <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                                    {t("saving", { defaultValue: "Saving..." })}
                                                                                </span>
                                                                            ) : null}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : null}
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            <span className={chipClass("neutral")}>{prettyCategory(row.category)}</span>
                                                        </td>

                                                        <td className="px-4 py-3">{statusChip(row.status)}</td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            {row.requested_at ? formatDateTimeLocal(row.requested_at) : "—"}
                                                        </td>

                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {!canApproveReject ? (
                                                                    <span className="text-xs text-gray-500">
                                                                        {t("parametersPage.hints.actionsRestricted")}
                                                                    </span>
                                                                ) : !isPending ? (
                                                                    <span className="text-xs text-gray-500">
                                                                        {t("parametersPage.hints.alreadyDecided")}
                                                                    </span>
                                                                ) : (
                                                                    <>
                                                                        <button
                                                                            className={cx(
                                                                                "lims-btn-primary gap-2",
                                                                                "disabled:opacity-50 disabled:cursor-not-allowed"
                                                                            )}
                                                                            onClick={() => openApprove(row)}
                                                                            disabled={busy}
                                                                            title={t("parametersPage.actions.approve")}
                                                                        >
                                                                            <Check size={16} />
                                                                            {t("parametersPage.actions.approve")}
                                                                        </button>

                                                                        <button
                                                                            className={cx(
                                                                                "lims-btn-danger gap-2",
                                                                                "disabled:opacity-50 disabled:cursor-not-allowed"
                                                                            )}
                                                                            onClick={() => openReject(row)}
                                                                            disabled={busy}
                                                                            title={t("parametersPage.actions.reject")}
                                                                        >
                                                                            <X size={16} />
                                                                            {t("parametersPage.actions.reject")}
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {rData && rData.last_page > 1 ? (
                                <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                    <div className="text-xs text-gray-600">
                                        {t("parametersPage.pagination.page")} {rData.current_page} / {rData.last_page}
                                        <span className="ml-2">• {t("parametersPage.pagination.total")} {rData.total}</span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            onClick={() => setRPage((x) => Math.max(1, x - 1))}
                                            disabled={rData.current_page <= 1}
                                            title={t("parametersPage.pagination.prev")}
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        <button
                                            className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            onClick={() => setRPage((x) => Math.min(rData.last_page, x + 1))}
                                            disabled={rData.current_page >= rData.last_page}
                                            title={t("parametersPage.pagination.next")}
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    ) : null}
                </div>
            </div>

            <div className="text-xs text-gray-500 mt-3">{t("parametersPage.hints.enterToSearch")}</div>

            <ParameterRequestCreateModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={() => {
                    setTab("requests");
                    setRQ("");
                    setRStatus("pending");
                    setRPage(1);
                    refreshRequests({ q: "", status: "pending", page: 1 });
                }}
            />

            <ParameterRequestDecisionModal
                open={decisionOpen}
                mode={decisionMode}
                title={
                    decisionMode === "approve"
                        ? t("parametersPage.decisionModal.approveTitle")
                        : t("parametersPage.decisionModal.rejectTitle")
                }
                subtitle={
                    decisionTarget
                        ? decisionMode === "approve"
                            ? t("parametersPage.decisionModal.approveSubtitle")
                            : t("parametersPage.decisionModal.rejectSubtitle", { name: decisionTarget.parameter_name })
                        : null
                }
                approveHint={
                    decisionTarget
                        ? t("parametersPage.decisionModal.approveHint", { name: decisionTarget.parameter_name })
                        : undefined
                }
                submitting={decisionSubmitting}
                error={decisionError}
                rejectNote={decisionNote}
                onRejectNoteChange={setDecisionNote}
                onClose={() => closeDecision(false)}
                onConfirm={confirmDecision}
            />

            <ParameterEditModal
                open={editOpen}
                row={editTarget}
                onClose={() => setEditOpen(false)}
                onSaved={async () => {
                    // After submitting update request, jump to Requests tab
                    setTab("requests");
                    setRStatus("pending");
                    setRPage(1);
                    await refreshRequests({ status: "pending", page: 1 });
                }}
            />
        </div>
    );
}