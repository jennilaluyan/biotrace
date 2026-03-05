import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Eye, FilePlus2, RefreshCw, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { ClientRequestStatusView, Sample } from "../../services/samples";
import { getClientRequestStatusView } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
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

type FlashPayload = { type: "success" | "warning" | "error"; message: string };

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

function buildClientRequestNumberMap(items: any[]) {
    const rows = items
        .map((it) => ({
            id: getSampleId(it),
            createdAt: it?.created_at ?? it?.createdAt ?? null,
        }))
        .filter((x) => Number.isFinite(Number(x.id)) && Number(x.id) > 0) as Array<{ id: number; createdAt: string | null }>;

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

type StatusFilter = "all" | Exclude<ClientRequestStatusView, "unknown">;

function statusChipClass(kind: "gray" | "primary" | "amber" | "indigo" | "emerald" | "rose" | "sky" | "violet") {
    switch (kind) {
        case "primary":
            return "bg-primary-soft/10 text-primary-soft";
        case "amber":
            return "bg-amber-50 text-amber-800";
        case "indigo":
            return "bg-indigo-50 text-indigo-700";
        case "emerald":
            return "bg-emerald-50 text-emerald-700";
        case "rose":
            return "bg-rose-50 text-rose-800";
        case "sky":
            return "bg-sky-50 text-sky-800";
        case "violet":
            return "bg-violet-50 text-violet-800";
        default:
            return "bg-gray-100 text-gray-700";
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
    if (filter === "all") return t("portalRequestsPage.filters.allStatus", { defaultValue: "All statuses" });
    return statusLabel(t, filter);
}

function requestStatusChip(item: any, t: TFunction) {
    const bucket = getClientRequestStatusView(item);

    if (bucket === "submitted") return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("primary") };
    if (bucket === "ready_for_delivery") return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("indigo") };
    if (bucket === "received_by_admin") return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("emerald") };

    if (bucket === "returned" || bucket === "needs_revision")
        return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("amber") };

    if (bucket === "intake_inspection") return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("sky") };
    if (bucket === "testing") return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("violet") };
    if (bucket === "reported") return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("emerald") };
    if (bucket === "rejected") return { label: statusLabel(t, bucket).toLowerCase(), cls: statusChipClass("rose") };

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

    const [createOpen, setCreateOpen] = useState(false);
    const [flash, setFlash] = useState<FlashPayload | null>(null);

    const [coaPreviewOpen, setCoaPreviewOpen] = useState(false);
    const [coaPreviewSampleId, setCoaPreviewSampleId] = useState<number | null>(null);

    const openCoaPreview = (sampleId: number) => {
        setCoaPreviewSampleId(sampleId);
        setCoaPreviewOpen(true);
    };

    useEffect(() => {
        const st = (location.state as any) ?? {};
        if (st?.openCreate) setCreateOpen(true);
        if (st?.flash?.message) setFlash(st.flash as FlashPayload);

        if (st?.openCreate || st?.flash) {
            navigate(location.pathname + location.search, { replace: true, state: {} });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

            const res = await clientSampleRequestService.list({ page: 1, per_page: 200 });
            setItems((res.data ?? []) as ClientRequestItem[]);
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, isClientAuthenticated, navigate, load]);

    const requestNoBySampleId = useMemo(() => buildClientRequestNumberMap(items), [items]);

    const filtered = useMemo(() => {
        let list = items;

        if (statusFilter !== "all") {
            list = list.filter((it) => getClientRequestStatusView(it as any) === statusFilter);
        }

        const term = searchTerm.trim().toLowerCase();
        if (!term) return list;

        return list.filter((it) => {
            const sid = getSampleId(it);
            const requestNo = sid ? requestNoBySampleId.get(sid) : null;

            const st = requestStatusChip(it as any, t);

            const hay = [
                String(requestNo ?? ""),
                String(sid ?? ""),
                (it as any).lab_sample_code,
                (it as any).request_status,
                st.label,
                (it as any).sample_type,
                (it as any).additional_notes,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(term);
        });
    }, [items, searchTerm, statusFilter, requestNoBySampleId, t]);

    const clearFilters = () => {
        setSearchTerm("");
        setStatusFilter("all");
    };

    const resultMeta = useMemo(() => ({ total: items.length, shown: filtered.length }), [items.length, filtered.length]);

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        {t("portalRequestsPage.title", "Sample Requests")}
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                        {t("portalRequestsPage.subtitle", "Create, submit, and track your requests.")}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="lims-btn-primary self-start md:self-auto inline-flex items-center gap-2"
                >
                    <FilePlus2 size={16} />
                    {t("portalRequestsPage.newRequest", "New request")}
                </button>
            </div>

            {flash ? (
                <div
                    className={cx(
                        "mt-2 rounded-2xl border px-4 py-3 text-sm flex items-start justify-between gap-3",
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

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="request-search">
                            {t("portalRequestsPage.filters.searchLabel", "Search")}
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500" aria-hidden="true">
                                <Search className="h-4 w-4" />
                            </span>

                            <input
                                id="request-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t("portalRequestsPage.filters.searchPlaceholder", "Search by request ID, status, sample type…")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
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
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            {STATUS_FILTERS.map((v) => (
                                <option key={v} value={v}>
                                    {statusFilterLabel(t, v).toLowerCase()}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="w-full md:w-auto flex items-center justify-start md:justify-end gap-2">
                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={load}
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

                <div className="px-4 md:px-6 py-4">
                    {loading ? <div className="text-sm text-gray-600">{t("portalRequestsPage.loading", "Loading…")}</div> : null}

                    {error && !loading ? (
                        <div className="text-sm text-rose-900 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl mb-4">
                            {error}
                        </div>
                    ) : null}

                    {!loading && !error ? (
                        <>
                            <div className="text-xs text-gray-600 mb-3">
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
                                    <div className="text-sm text-gray-600 mt-1">
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
                                        <thead className="bg-white text-gray-700 border-b border-gray-100">
                                            <tr>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.request", "Request")}</th>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.sampleType", "Sample type")}</th>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.scheduledDelivery", "Scheduled delivery")}</th>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.status", "Status")}</th>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.updated", "Updated")}</th>
                                                <th className="text-right font-semibold px-4 py-3">{t("actions", "Actions")}</th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-gray-100">
                                            {filtered.map((it: any, idx: number) => {
                                                const sid = getSampleId(it);
                                                const requestNo = sid ? requestNoBySampleId.get(sid) : null;

                                                const updated = fmtDate(it.updated_at ?? it.created_at);
                                                const sched = fmtDate(it.scheduled_delivery_at);
                                                const st = requestStatusChip(it as any, t);

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
                                                            <span className={cx("inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold", st.cls)}>
                                                                {st.label}
                                                            </span>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{updated}</td>

                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {(it as any)?.coa_released_to_client_at && Number.isFinite(coaSampleId) ? (
                                                                    <button
                                                                        type="button"
                                                                        className="lims-icon-button"
                                                                        onClick={() => openCoaPreview(coaSampleId)}
                                                                        aria-label={t("portal.actions.downloadCoa", "Download COA")}
                                                                        title={t("portal.actions.downloadCoa", "Download COA")}
                                                                    >
                                                                        <Download size={16} />
                                                                    </button>
                                                                ) : null}

                                                                <button
                                                                    type="button"
                                                                    className={cx("lims-icon-button", !sid && "opacity-40 cursor-not-allowed")}
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
                    setFlash({ type: "success", message: t("portalRequestsPage.flash.submitted", "Request submitted.") });
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