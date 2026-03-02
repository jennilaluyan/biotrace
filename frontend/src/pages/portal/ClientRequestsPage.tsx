import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Eye, FilePlus2, RefreshCw, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Sample } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
import { ClientRequestFormModal } from "../../components/portal/ClientRequestFormModal";
import { useClientAuth } from "../../hooks/useClientAuth";

import { getClientTracking } from "../../utils/clientTracking";
import { openClientCoaPdf } from "../../services/clientCoa";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type ClientRequestItem = Sample & {
    // pickup-related timestamps (optional)
    admin_received_from_collector_at?: string | null;
    collector_returned_to_admin_at?: string | null;
    client_picked_up_at?: string | null;

    // tracking fields (optional; attached by backend)
    request_status?: string | null;
    current_status?: string | null;

    coa_is_locked?: boolean;
    coa_released_to_client_at?: string | null;
    coa_checked_at?: string | null;
    coa_release_note?: string | null;

    created_at?: string | null;
    updated_at?: string | null;

    scheduled_delivery_at?: string | null;
    lab_sample_code?: string | null;
    sample_type?: string | null;
    additional_notes?: string | null;
};

type FlashPayload = { type: "success" | "warning" | "error"; message: string };

const fmtDate = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
};

function getRequestId(it: any): number | null {
    const raw = it?.sample_id ?? it?.id ?? it?.request_id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function stableKey(it: any, idx: number) {
    return String(it?.sample_id ?? it?.id ?? it?.lab_sample_code ?? idx);
}

type EffectiveStatus = {
    code:
    | "draft"
    | "submitted"
    | "needs_revision"
    | "returned"
    | "ready_for_delivery"
    | "physically_received"
    | "in_progress"
    | "testing_completed"
    | "verified"
    | "validated"
    | "coa_pending_admin"
    | "coa_available"
    | "reported"
    | "pickup_required"
    | "picked_up"
    | "unknown";
    label: string;
    cls: string;
    sub?: string;
    canDownloadCoa: boolean;
};

function deriveEffectiveStatus(it: ClientRequestItem, t: any): EffectiveStatus {
    // Special pickup states override normal mapping
    const rs = String((it as any).request_status ?? "").toLowerCase();
    const pickedAt = it.client_picked_up_at ?? null;
    const waitingSince = it.admin_received_from_collector_at ?? it.collector_returned_to_admin_at ?? null;
    const isReturnedFamily = rs === "returned" || rs === "needs_revision";

    if (pickedAt) {
        return {
            code: "picked_up",
            label: t("portal.status.pickedUp"),
            cls: "bg-emerald-50 text-emerald-700",
            sub: t("portalRequestsPage.sub.pickedUpAt", { date: fmtDate(pickedAt) }),
            canDownloadCoa: false,
        };
    }

    if (isReturnedFamily && waitingSince) {
        return {
            code: "pickup_required",
            label: t("portal.status.pickupRequired"),
            cls: "bg-amber-50 text-amber-800",
            sub: t("portalRequestsPage.sub.waitingSince", { date: fmtDate(waitingSince) }),
            canDownloadCoa: false,
        };
    }

    const tr = getClientTracking(it, t);

    // Make class compatible with table pill style
    const cls = tr.cls
        .replace("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", "")
        .trim();

    return {
        code: tr.code as any,
        label: tr.label,
        cls: cls || "bg-slate-100 text-slate-700",
        canDownloadCoa: tr.canDownloadCoa,
    };
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
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [createOpen, setCreateOpen] = useState(false);

    const [flash, setFlash] = useState<FlashPayload | null>(null);

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
            t("portalRequestsPage.errors.loadFailed"),
        [t]
    );

    const load = useCallback(async () => {
        try {
            setError(null);
            setLoading(true);
            const res = await clientSampleRequestService.list({ page: 1, per_page: 100 });
            setItems((res?.data ?? []) as ClientRequestItem[]);
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

    const filtered = useMemo(() => {
        let list = items;

        const sf = statusFilter.toLowerCase();
        if (sf !== "all") {
            list = list.filter((it) => {
                const st = deriveEffectiveStatus(it, t);
                if (sf === "needs_revision") {
                    // unify returned + needs_revision
                    return st.code === "needs_revision" || st.code === "returned" || String((it as any).request_status ?? "").toLowerCase() === "returned";
                }
                return st.code === sf;
            });
        }

        const term = searchTerm.trim().toLowerCase();
        if (!term) return list;

        return list.filter((it) => {
            const st = deriveEffectiveStatus(it, t);
            const hay = [
                String((it as any).sample_id ?? ""),
                it.lab_sample_code,
                (it as any).request_status,
                (it as any).current_status,
                st.label,
                st.sub,
                it.sample_type,
                it.additional_notes,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(term);
        });
    }, [items, searchTerm, statusFilter, t]);

    const clearFilters = () => {
        setSearchTerm("");
        setStatusFilter("all");
    };

    const resultMeta = useMemo(() => {
        const total = items.length;
        const shown = filtered.length;
        return { total, shown };
    }, [items.length, filtered.length]);

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("portalRequestsPage.title")}</h1>
                    <p className="text-sm text-gray-600 mt-1">{t("portalRequestsPage.subtitle")}</p>
                </div>

                <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="lims-btn-primary self-start md:self-auto inline-flex items-center gap-2"
                >
                    <FilePlus2 size={16} />
                    {t("portalRequestsPage.newRequest")}
                </button>
            </div>

            {/* Flash */}
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
                        aria-label={t("close")}
                        title={t("close")}
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : null}

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="request-search">
                            {t("portalRequestsPage.filters.searchLabel")}
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
                                placeholder={t("portalRequestsPage.filters.searchPlaceholder")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-72">
                        <label className="sr-only" htmlFor="request-status-filter">
                            {t("status")}
                        </label>

                        <select
                            id="request-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("portal.status.all")}</option>

                            <option value="draft">{t("portal.status.draft")}</option>
                            <option value="submitted">{t("portal.status.submitted")}</option>
                            <option value="needs_revision">{t("portal.status.needsRevision")}</option>
                            <option value="ready_for_delivery">{t("portal.status.readyForDelivery")}</option>
                            <option value="physically_received">{t("portal.status.physicallyReceived")}</option>

                            <option value="in_progress">{t("portal.status.inProgress")}</option>
                            <option value="testing_completed">{t("portal.status.testingCompleted")}</option>
                            <option value="verified">{t("portal.status.verified")}</option>
                            <option value="validated">{t("portal.status.validated")}</option>

                            <option value="coa_pending_admin">{t("portal.status.coaPendingAdmin")}</option>
                            <option value="coa_available">{t("portal.status.coaAvailable")}</option>

                            <option value="pickup_required">{t("portal.status.pickupRequired")}</option>
                            <option value="picked_up">{t("portal.status.pickedUp")}</option>
                        </select>
                    </div>

                    <div className="w-full md:w-auto flex items-center justify-start md:justify-end gap-2">
                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={load}
                            aria-label={t("refresh")}
                            title={t("refresh")}
                            disabled={loading}
                        >
                            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                        </button>

                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={clearFilters}
                            aria-label={t("clearFilters")}
                            title={t("clearFilters")}
                            disabled={loading && !searchTerm && statusFilter === "all"}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-4 md:px-6 py-4">
                    {loading ? <div className="text-sm text-gray-600">{t("portalRequestsPage.loading")}</div> : null}

                    {error && !loading ? (
                        <div className="text-sm text-rose-900 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl mb-4">
                            {error}
                        </div>
                    ) : null}

                    {!loading && !error ? (
                        <>
                            <div className="text-xs text-gray-600 mb-3">
                                {t("portalRequestsPage.meta.showing", { shown: resultMeta.shown, total: resultMeta.total })}
                            </div>

                            {filtered.length === 0 ? (
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                    <div className="font-semibold text-gray-900">{t("portalRequestsPage.empty.title")}</div>
                                    <div className="text-sm text-gray-600 mt-1">{t("portalRequestsPage.empty.body")}</div>

                                    <button
                                        type="button"
                                        className="lims-btn-primary mt-4 inline-flex items-center gap-2"
                                        onClick={() => setCreateOpen(true)}
                                    >
                                        <FilePlus2 size={16} />
                                        {t("portalRequestsPage.empty.cta")}
                                    </button>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-white text-gray-700 border-b border-gray-100">
                                            <tr>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.request")}</th>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.sampleType")}</th>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.scheduledDelivery")}</th>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.status")}</th>
                                                <th className="text-left font-semibold px-4 py-3">{t("portalRequestsPage.table.updated")}</th>
                                                <th className="text-right font-semibold px-4 py-3">{t("actions")}</th>
                                            </tr>
                                        </thead>

                                        <tbody className="divide-y divide-gray-100">
                                            {filtered.map((it: any, idx: number) => {
                                                const rid = getRequestId(it);
                                                const updated = fmtDate(it.updated_at ?? it.created_at);
                                                const sched = fmtDate(it.scheduled_delivery_at);

                                                const st = deriveEffectiveStatus(it as ClientRequestItem, t);

                                                return (
                                                    <tr key={stableKey(it, idx)} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">#{rid ?? "-"}</div>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{it.sample_type ?? "-"}</td>
                                                        <td className="px-4 py-3 text-gray-700">{sched}</td>

                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-col gap-1">
                                                                <span
                                                                    className={cx(
                                                                        "inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold",
                                                                        st.cls
                                                                    )}
                                                                >
                                                                    {st.label}
                                                                </span>
                                                                {st.sub ? <span className="text-[11px] text-gray-500">{st.sub}</span> : null}
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{updated}</td>

                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end gap-2">
                                                                {st.canDownloadCoa && rid ? (
                                                                    <button
                                                                        type="button"
                                                                        className="lims-icon-button"
                                                                        aria-label={t("portal.actions.downloadCoa")}
                                                                        title={t("portal.actions.downloadCoa")}
                                                                        onClick={() => openClientCoaPdf(Number(it.sample_id ?? rid))}
                                                                    >
                                                                        <Download size={16} />
                                                                    </button>
                                                                ) : null}

                                                                <button
                                                                    type="button"
                                                                    className={cx("lims-icon-button", !rid && "opacity-40 cursor-not-allowed")}
                                                                    aria-label={t("portalRequestsPage.actions.open")}
                                                                    title={t("portalRequestsPage.actions.open")}
                                                                    disabled={!rid}
                                                                    onClick={() => rid && navigate(`/portal/requests/${rid}`)}
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
                    setFlash({ type: "success", message: t("portalRequestsPage.flash.created") });
                    await load();
                }}
            />
        </div>
    );
}