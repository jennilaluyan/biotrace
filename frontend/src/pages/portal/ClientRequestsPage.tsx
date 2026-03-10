import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Eye, FilePlus2, RefreshCw, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { ClientRequestStatusView, PaginatedResponse, Sample } from "../../services/samples";
import { getClientRequestStatusView } from "../../services/samples";
import { apiGet } from "../../services/api";
import { ClientRequestFormModal } from "../../components/portal/ClientRequestFormModal";
import { useClientAuth } from "../../hooks/useClientAuth";
import ClientCoaPreviewModal from "../../components/portal/ClientCoaPreviewModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type ClientRequestItem = Sample & {
    admin_received_from_collector_at?: string | null;
    collector_returned_to_admin_at?: string | null;
    client_picked_up_at?: string | null;
};

type FlashPayload = {
    type: "success" | "warning" | "error";
    message: string;
};

type StatusFilter = "all" | Exclude<ClientRequestStatusView, "unknown">;

const STATUS_FILTERS: StatusFilter[] = [
    "all",
    "submitted",
    "returned",
    "needs_revision",
    "ready_for_delivery",
    "received_by_admin",
    "intake_inspection",
    "testing",
    "reported",
    "rejected",
];

function fmtDate(iso?: string | null) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
}

function getSampleId(it: any): number | null {
    const raw = it?.sample_id ?? it?.id ?? it?.request_id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function stableKey(it: any, idx: number) {
    return String(it?.sample_id ?? it?.id ?? it?.lab_sample_code ?? idx);
}

function buildClientRequestNumberMap(items: ClientRequestItem[]) {
    const rows = items
        .map((it) => ({
            id: getSampleId(it),
            createdAt: (it as any)?.created_at ?? (it as any)?.createdAt ?? null,
        }))
        .filter(
            (x): x is { id: number; createdAt: string | null } =>
                Number.isFinite(Number(x.id)) && Number(x.id) > 0
        );

    rows.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : Number.NaN;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : Number.NaN;

        if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
        return a.id - b.id;
    });

    const map = new Map<number, number>();
    rows.forEach((r, idx) => map.set(r.id, idx + 1));
    return map;
}

function unwrapClientRequests(res: any): PaginatedResponse<ClientRequestItem> {
    if (res && typeof res === "object" && "data" in res && "meta" in res) {
        return res as PaginatedResponse<ClientRequestItem>;
    }

    const inner = res?.data ?? res;

    if (inner && typeof inner === "object" && "data" in inner && "meta" in inner) {
        return inner as PaginatedResponse<ClientRequestItem>;
    }

    if (Array.isArray(inner)) {
        return {
            data: inner as ClientRequestItem[],
            meta: {
                current_page: 1,
                last_page: 1,
                per_page: inner.length,
                total: inner.length,
            },
        };
    }

    return {
        data: [],
        meta: {
            current_page: 1,
            last_page: 1,
            per_page: 10,
            total: 0,
        },
    };
}

function statusChipClass(
    kind:
        | "gray"
        | "blue"
        | "amber"
        | "indigo"
        | "emerald"
        | "red"
        | "sky"
        | "violet"
        | "cyan"
) {
    switch (kind) {
        case "blue":
            return "border border-blue-200 bg-blue-50 text-blue-700";
        case "amber":
            return "border border-amber-200 bg-amber-50 text-amber-800";
        case "indigo":
            return "border border-indigo-200 bg-indigo-50 text-indigo-700";
        case "emerald":
            return "border border-emerald-200 bg-emerald-50 text-emerald-700";
        case "red":
            return "border border-red-200 bg-red-50 text-red-700";
        case "sky":
            return "border border-sky-200 bg-sky-50 text-sky-700";
        case "violet":
            return "border border-violet-200 bg-violet-50 text-violet-700";
        case "cyan":
            return "border border-cyan-200 bg-cyan-50 text-cyan-700";
        default:
            return "border border-gray-200 bg-gray-100 text-gray-700";
    }
}

function statusLabel(t: TFunction, bucket: ClientRequestStatusView): string {
    const keyMap: Record<ClientRequestStatusView, string> = {
        submitted: "portalRequestsPage.status.submitted",
        returned: "portalRequestsPage.status.returned",
        needs_revision: "portalRequestsPage.status.needsRevision",
        ready_for_delivery: "portalRequestsPage.status.readyForDelivery",
        received_by_admin: "portalRequestsPage.status.receivedByAdmin",
        intake_inspection: "portalRequestsPage.status.intakeInspection",
        testing: "portalRequestsPage.status.testing",
        reported: "portalRequestsPage.status.reported",
        rejected: "portalRequestsPage.status.rejected",
        unknown: "portalRequestsPage.status.unknown",
    };

    const fallbackMap: Record<ClientRequestStatusView, string> = {
        submitted: "Submitted",
        returned: "Returned",
        needs_revision: "Needs revision",
        ready_for_delivery: "Ready for delivery",
        received_by_admin: "Received by admin",
        intake_inspection: "Intake inspection",
        testing: "Testing",
        reported: "Reported",
        rejected: "Rejected",
        unknown: "Unknown",
    };

    return t(keyMap[bucket], { defaultValue: fallbackMap[bucket] });
}

function statusFilterLabel(t: TFunction, filter: StatusFilter): string {
    if (filter === "all") {
        return t("portalRequestsPage.filters.allStatus", { defaultValue: "All statuses" });
    }

    return statusLabel(t, filter);
}

function requestStatusChip(item: ClientRequestItem, t: TFunction) {
    const bucket = getClientRequestStatusView(item);

    if (bucket === "submitted") {
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("blue") };
    }

    if (bucket === "ready_for_delivery") {
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("cyan") };
    }

    if (bucket === "received_by_admin") {
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("indigo") };
    }

    if (bucket === "returned" || bucket === "needs_revision") {
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("amber") };
    }

    if (bucket === "intake_inspection") {
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("sky") };
    }

    if (bucket === "testing") {
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("violet") };
    }

    if (bucket === "reported") {
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("emerald") };
    }

    if (bucket === "rejected") {
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("red") };
    }

    return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("gray") };
}

export default function ClientRequestsPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { loading: authLoading, isClientAuthenticated } = useClientAuth() as any;

    const [items, setItems] = useState<ClientRequestItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    const [createOpen, setCreateOpen] = useState(false);
    const [flash, setFlash] = useState<FlashPayload | null>(null);

    const [coaPreviewOpen, setCoaPreviewOpen] = useState(false);
    const [coaPreviewSampleId, setCoaPreviewSampleId] = useState<number | null>(null);

    const openCoaPreview = useCallback((sampleId: number) => {
        setCoaPreviewSampleId(sampleId);
        setCoaPreviewOpen(true);
    }, []);

    useEffect(() => {
        const st = (location.state as any) ?? {};

        if (st?.openCreate) setCreateOpen(true);
        if (st?.flash?.message) setFlash(st.flash as FlashPayload);

        if (st?.openCreate || st?.flash) {
            navigate(location.pathname + location.search, { replace: true, state: {} });
        }
    }, [location.pathname, location.search, location.state, navigate]);

    useEffect(() => {
        if (!flash) return;

        const timer = window.setTimeout(() => setFlash(null), 8000);
        return () => window.clearTimeout(timer);
    }, [flash]);

    const getErrMsg = useCallback(
        (e: any) =>
            e?.data?.message ??
            e?.data?.error ??
            (typeof e?.message === "string" ? e.message : null) ??
            t("portalRequestsPage.errors.loadFailed", "Failed to load requests."),
        [t]
    );

    const load = useCallback(async () => {
        try {
            setError(null);
            setLoading(true);

            const res = await apiGet<any>("/v1/client/samples", {
                params: { page: 1, per_page: 200 },
            });

            const paginated = unwrapClientRequests(res);
            setItems(paginated.data ?? []);
        } catch (e: any) {
            setError(getErrMsg(e));
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [getErrMsg]);

    useEffect(() => {
        if (authLoading) return;

        if (!isClientAuthenticated) {
            navigate("/login", { replace: true });
            return;
        }

        void load();
    }, [authLoading, isClientAuthenticated, navigate, load]);

    const requestNoBySampleId = useMemo(() => buildClientRequestNumberMap(items), [items]);

    const filtered = useMemo(() => {
        let list = items;

        if (statusFilter !== "all") {
            list = list.filter((it) => getClientRequestStatusView(it) === statusFilter);
        }

        const term = searchTerm.trim().toLowerCase();
        if (!term) return list;

        return list.filter((it) => {
            const sid = getSampleId(it);
            const requestNo = sid ? requestNoBySampleId.get(sid) : null;
            const st = requestStatusChip(it, t);

            const hay = [
                String(requestNo ?? ""),
                String(sid ?? ""),
                (it as any).lab_sample_code,
                (it as any).request_status,
                st.label,
                it.sample_type,
                it.additional_notes,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(term);
        });
    }, [items, requestNoBySampleId, searchTerm, statusFilter, t]);

    const clearFilters = useCallback(() => {
        setSearchTerm("");
        setStatusFilter("all");
    }, []);

    const resultMeta = useMemo(
        () => ({
            total: items.length,
            shown: filtered.length,
        }),
        [items.length, filtered.length]
    );

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 px-0 py-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 md:text-xl">
                        {t("portalRequestsPage.title", "Sample Requests")}
                    </h1>
                    <p className="mt-1 text-sm text-gray-600">
                        {t("portalRequestsPage.subtitle", "Create, submit, and track your requests.")}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="lims-btn-primary inline-flex items-center gap-2 self-start md:self-auto"
                >
                    <FilePlus2 size={16} />
                    {t("portalRequestsPage.newRequest", "New request")}
                </button>
            </div>

            {flash ? (
                <div
                    className={cx(
                        "mt-2 flex items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm",
                        flash.type === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
                        flash.type === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
                        flash.type === "error" && "border-rose-200 bg-rose-50 text-rose-900"
                    )}
                >
                    <div className="leading-relaxed">{flash.message}</div>
                    <button
                        type="button"
                        onClick={() => setFlash(null)}
                        className="lims-icon-button"
                        aria-label={t("close", "Close")}
                        title={t("close", "Close")}
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : null}

            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-gray-100 bg-white px-4 py-4 md:flex-row md:items-center md:px-6">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="request-search">
                            {t("portalRequestsPage.filters.searchLabel", "Search")}
                        </label>

                        <div className="relative">
                            <span
                                className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500"
                                aria-hidden="true"
                            >
                                <Search className="h-4 w-4" />
                            </span>

                            <input
                                id="request-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t(
                                    "portalRequestsPage.filters.searchPlaceholder",
                                    "Search by request ID, status, sample type…"
                                )}
                                className="w-full rounded-xl border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-60">
                        <label className="sr-only" htmlFor="request-status-filter">
                            {t("status", "Status")}
                        </label>

                        <select
                            id="request-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft"
                        >
                            {STATUS_FILTERS.map((v) => (
                                <option key={v} value={v}>
                                    {statusFilterLabel(t, v).toLowerCase()}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex w-full items-center justify-start gap-2 md:w-auto md:justify-end">
                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={() => void load()}
                            aria-label={t("refresh", "Refresh")}
                            title={t("refresh", "Refresh")}
                            disabled={loading}
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>

                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={clearFilters}
                            aria-label={t("clearFilters", "Clear filters")}
                            title={t("clearFilters", "Clear filters")}
                            disabled={loading && !searchTerm && statusFilter === "all"}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-4 py-4 md:px-6">
                    {loading ? (
                        <div className="text-sm text-gray-600">{t("portalRequestsPage.loading", "Loading…")}</div>
                    ) : null}

                    {error && !loading ? (
                        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                            {error}
                        </div>
                    ) : null}

                    {!loading && !error ? (
                        <>
                            <div className="mb-3 text-xs text-gray-600">
                                {t("portalRequestsPage.meta.showing", "Showing {{shown}} of {{total}}", {
                                    shown: resultMeta.shown,
                                    total: resultMeta.total,
                                })}
                            </div>

                            {filtered.length === 0 ? (
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                    <div className="font-semibold text-gray-900">
                                        {t("portalRequestsPage.empty.title", "No requests")}
                                    </div>
                                    <div className="mt-1 text-sm text-gray-600">
                                        {t("portalRequestsPage.empty.body", "Create a request to start.")}
                                    </div>

                                    <button
                                        type="button"
                                        className="lims-btn-primary mt-4 inline-flex items-center gap-2"
                                        onClick={() => setCreateOpen(true)}
                                    >
                                        <FilePlus2 size={16} />
                                        {t("portalRequestsPage.empty.cta", "Create request")}
                                    </button>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="border-b border-gray-100 bg-white text-gray-700">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold">
                                                    {t("portalRequestsPage.table.request", "Request")}
                                                </th>
                                                <th className="px-4 py-3 text-left font-semibold">
                                                    {t("portalRequestsPage.table.sampleType", "Sample type")}
                                                </th>
                                                <th className="px-4 py-3 text-left font-semibold">
                                                    {t("portalRequestsPage.table.scheduledDelivery", "Scheduled delivery")}
                                                </th>
                                                <th className="px-4 py-3 text-left font-semibold">
                                                    {t("portalRequestsPage.table.status", "Status")}
                                                </th>
                                                <th className="px-4 py-3 text-left font-semibold">
                                                    {t("portalRequestsPage.table.updated", "Updated")}
                                                </th>
                                                <th className="px-4 py-3 text-right font-semibold">
                                                    {t("actions", "Actions")}
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-gray-100">
                                            {filtered.map((it, idx) => {
                                                const sid = getSampleId(it);
                                                const requestNo = sid ? requestNoBySampleId.get(sid) : null;
                                                const updated = fmtDate((it as any).updated_at ?? (it as any).created_at);
                                                const sched = fmtDate(it.scheduled_delivery_at);
                                                const st = requestStatusChip(it, t);
                                                const coaSampleId = Number((it as any).sample_id ?? sid);

                                                return (
                                                    <tr key={stableKey(it, idx)} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">
                                                                #{requestNo ?? "-"}
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{it.sample_type ?? "-"}</td>
                                                        <td className="px-4 py-3 text-gray-700">{sched}</td>

                                                        <td className="px-4 py-3">
                                                            <span
                                                                className={cx(
                                                                    "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold",
                                                                    st.cls
                                                                )}
                                                            >
                                                                {st.label}
                                                            </span>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{updated}</td>

                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {(it as any)?.coa_released_to_client_at &&
                                                                    Number.isFinite(coaSampleId) ? (
                                                                    <button
                                                                        type="button"
                                                                        className="lims-icon-button"
                                                                        onClick={() => openCoaPreview(coaSampleId)}
                                                                        aria-label={t(
                                                                            "portal.actions.downloadCoa",
                                                                            "Download COA"
                                                                        )}
                                                                        title={t(
                                                                            "portal.actions.downloadCoa",
                                                                            "Download COA"
                                                                        )}
                                                                    >
                                                                        <Download size={16} />
                                                                    </button>
                                                                ) : null}

                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "lims-icon-button",
                                                                        !sid && "cursor-not-allowed opacity-40"
                                                                    )}
                                                                    aria-label={t("portalRequestsPage.actions.open", "Open")}
                                                                    title={t("portalRequestsPage.actions.open", "Open")}
                                                                    disabled={!sid}
                                                                    onClick={() => sid && navigate(`/portal/requests/${sid}`)}
                                                                >
                                                                    <Eye size={16} />
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
                    ) : null}
                </div>
            </div>

            <ClientRequestFormModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={async () => {
                    setCreateOpen(false);
                    setFlash({
                        type: "success",
                        message: t("portalRequestsPage.flash.submitted", "Request submitted."),
                    });
                    await load();
                }}
            />

            <ClientCoaPreviewModal
                open={coaPreviewOpen}
                onClose={() => {
                    setCoaPreviewOpen(false);
                    setCoaPreviewSampleId(null);
                }}
                sampleId={coaPreviewSampleId}
                title={t("portal.coa.previewTitle", "COA Preview")}
            />
        </div>
    );
}