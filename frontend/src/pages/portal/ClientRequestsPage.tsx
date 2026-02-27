import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, FilePlus2, RefreshCw, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { Sample } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
import { ClientRequestFormModal } from "../../components/portal/ClientRequestFormModal";
import { useClientAuth } from "../../hooks/useClientAuth";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type ClientRequestItem = Sample & {
    admin_received_from_collector_at?: string | null;
    collector_returned_to_admin_at?: string | null;
    client_picked_up_at?: string | null;
};

type FlashPayload = { type: "success" | "warning" | "error"; message: string };

type StatusTone = {
    label: string;
    cls: string;
    sub?: string;
    raw?: string | null;
};

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

function humanizeToken(raw?: string | null) {
    const s = String(raw ?? "").trim();
    if (!s) return "";
    return s
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/(^\w)|(\s+\w)/g, (m) => m.toUpperCase());
}

function statusChipClass(kind: "gray" | "primary" | "amber" | "indigo" | "emerald") {
    switch (kind) {
        case "primary":
            return "bg-primary-soft/10 text-primary-soft";
        case "amber":
            return "bg-amber-50 text-amber-800";
        case "indigo":
            return "bg-indigo-50 text-indigo-700";
        case "emerald":
            return "bg-emerald-50 text-emerald-700";
        default:
            return "bg-gray-100 text-gray-700";
    }
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

    // auto dismiss flash
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

    const mapRequestStatus = useCallback(
        (raw?: string | null): { label: string; cls: string } => {
            const s = String(raw ?? "").trim().toLowerCase();

            if (!s) {
                return {
                    label: t("portalRequestsPage.status.unknown"),
                    cls: statusChipClass("gray"),
                };
            }

            // known client-facing statuses
            if (s === "draft")
                return { label: t("portalRequestsPage.status.draft"), cls: statusChipClass("gray") };

            if (s === "submitted")
                return { label: t("portalRequestsPage.status.submitted"), cls: statusChipClass("primary") };

            if (s === "returned" || s === "needs_revision")
                return { label: t("portalRequestsPage.status.needsRevision"), cls: statusChipClass("amber") };

            if (s === "ready_for_delivery")
                return { label: t("portalRequestsPage.status.readyForDelivery"), cls: statusChipClass("indigo") };

            if (s === "physically_received")
                return { label: t("portalRequestsPage.status.physicallyReceived"), cls: statusChipClass("emerald") };

            // fallback for internal-ish tokens that sometimes leak into portal list
            const nice = humanizeToken(s);

            // heuristic tone
            const isBad = /(reject|deny|fail|return|revision)/i.test(s);
            const isGood = /(approve|validated|received|completed|done)/i.test(s);
            const isWaiting = /(submit|await|pending|review|queue|intake|assign)/i.test(s);

            const cls = isBad
                ? statusChipClass("amber")
                : isGood
                    ? statusChipClass("emerald")
                    : isWaiting
                        ? statusChipClass("indigo")
                        : statusChipClass("gray");

            return { label: nice || String(raw), cls };
        },
        [t]
    );

    /**
     * ✅ Client-visible status:
     * - Picked Up when client_picked_up_at exists
     * - Pickup Required when returned/needs_revision AND admin has received it back AND not picked up yet
     * - Otherwise fallback to request_status mapping
     */
    const deriveClientStatus = useCallback(
        (it: ClientRequestItem): StatusTone => {
            const pickedAt = it.client_picked_up_at ?? null;
            const waitingSince = it.admin_received_from_collector_at ?? it.collector_returned_to_admin_at ?? null;

            const rs = String((it as any).request_status ?? "").toLowerCase();

            if (pickedAt) {
                return {
                    label: t("portalRequestsPage.status.pickedUp"),
                    cls: statusChipClass("emerald"),
                    sub: t("portalRequestsPage.sub.pickedUpAt", { date: fmtDate(pickedAt) }),
                    raw: rs,
                };
            }

            const isReturnedFamily = rs === "returned" || rs === "needs_revision";
            if (isReturnedFamily && waitingSince) {
                return {
                    label: t("portalRequestsPage.status.pickupRequired"),
                    cls: statusChipClass("amber"),
                    sub: t("portalRequestsPage.sub.waitingSince", { date: fmtDate(waitingSince) }),
                    raw: rs,
                };
            }

            const mapped = mapRequestStatus((it as any).request_status ?? null);
            return { label: mapped.label, cls: mapped.cls, raw: rs };
        },
        [t, mapRequestStatus]
    );

    const load = useCallback(async () => {
        try {
            setError(null);
            setLoading(true);

            const res = await clientSampleRequestService.list({ page: 1, per_page: 100 });
            setItems((res.data ?? []) as ClientRequestItem[]);
        } catch (e: any) {
            setError(getErrMsg(e));
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [getErrMsg]);

    useEffect(() => {
        let cancelled = false;
        if (authLoading) return;

        if (!isClientAuthenticated) {
            navigate("/login", { replace: true });
            return;
        }

        const run = async () => {
            if (cancelled) return;
            await load();
        };

        run();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, isClientAuthenticated, navigate, load]);

    const filtered = useMemo(() => {
        let list = items;

        const sf = statusFilter.toLowerCase();

        if (sf !== "all") {
            if (sf === "pickup_required") {
                list = list.filter((it) => deriveClientStatus(it).label.toLowerCase() === t("portalRequestsPage.status.pickupRequired").toLowerCase());
            } else if (sf === "picked_up") {
                list = list.filter((it) => deriveClientStatus(it).label.toLowerCase() === t("portalRequestsPage.status.pickedUp").toLowerCase());
            } else if (sf === "needs_revision") {
                // unify returned + needs_revision
                list = list.filter((it) => {
                    const rs = String((it as any).request_status ?? "").toLowerCase();
                    return rs === "needs_revision" || rs === "returned";
                });
            } else {
                list = list.filter((it) => String((it as any).request_status ?? "").toLowerCase() === sf);
            }
        }

        const term = searchTerm.trim().toLowerCase();
        if (!term) return list;

        return list.filter((it) => {
            const d = deriveClientStatus(it);
            const hay = [
                String((it as any).sample_id ?? ""),
                (it as any).lab_sample_code,
                (it as any).request_status,
                d.label,
                d.sub,
                (it as any).sample_type,
                (it as any).additional_notes,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(term);
        });
    }, [items, searchTerm, statusFilter, deriveClientStatus, t]);

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

            {/* Flash banner */}
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
                {/* Filter bar (match SamplesPage style) */}
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

                    <div className="w-full md:w-60">
                        <label className="sr-only" htmlFor="request-status-filter">
                            {t("status")}
                        </label>

                        <select
                            id="request-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("portalRequestsPage.filters.allStatus")}</option>
                            <option value="draft">{t("portalRequestsPage.status.draft")}</option>
                            <option value="submitted">{t("portalRequestsPage.status.submitted")}</option>
                            <option value="needs_revision">{t("portalRequestsPage.status.needsRevision")}</option>
                            <option value="ready_for_delivery">{t("portalRequestsPage.status.readyForDelivery")}</option>
                            <option value="physically_received">{t("portalRequestsPage.status.physicallyReceived")}</option>
                            <option value="pickup_required">{t("portalRequestsPage.status.pickupRequired")}</option>
                            <option value="picked_up">{t("portalRequestsPage.status.pickedUp")}</option>
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
                                                const st = deriveClientStatus(it as ClientRequestItem);

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
                                                                    title={st.raw ? String(st.raw) : undefined}
                                                                >
                                                                    {st.label}
                                                                </span>
                                                                {st.sub ? <span className="text-[11px] text-gray-500">{st.sub}</span> : null}
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{updated}</td>

                                                        <td className="px-4 py-3">
                                                            <div className="flex items-center justify-end">
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
