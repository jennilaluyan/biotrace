import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, FilePlus2, RefreshCw, Search, X } from "lucide-react";

import type { Sample } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
import { ClientRequestFormModal } from "../../components/portal/ClientRequestFormModal";
import { useClientAuth } from "../../hooks/useClientAuth";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type StatusTone = { label: string; cls: string; sub?: string };

type ClientRequestItem = Sample & {
    admin_received_from_collector_at?: string | null;
    collector_returned_to_admin_at?: string | null;
    client_picked_up_at?: string | null;
};

type FlashPayload = { type: "success" | "warning" | "error"; message: string };

const statusTone = (raw?: string | null): StatusTone => {
    const s = (raw ?? "").toLowerCase();
    if (s === "draft") return { label: raw ?? "Draft", cls: "bg-gray-100 text-gray-700" };
    if (s === "submitted") return { label: raw ?? "Submitted", cls: "bg-primary-soft/10 text-primary-soft" };
    if (s === "returned" || s === "needs_revision")
        return { label: "Needs revision", cls: "bg-amber-100 text-amber-900" };
    if (s === "ready_for_delivery") return { label: "Ready for delivery", cls: "bg-indigo-50 text-indigo-700" };
    if (s === "physically_received") return { label: "Physically received", cls: "bg-emerald-100 text-emerald-900" };
    return { label: raw ?? "Unknown", cls: "bg-gray-100 text-gray-700" };
};

const fmtDate = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
};

const getErrMsg = (e: any) =>
    e?.data?.message ??
    e?.data?.error ??
    (typeof e?.message === "string" ? e.message : null) ??
    "Failed to load sample requests.";

function getRequestId(it: any): number | null {
    const raw = it?.sample_id ?? it?.id ?? it?.request_id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function stableKey(it: any, idx: number) {
    return String(it?.sample_id ?? it?.id ?? it?.lab_sample_code ?? idx);
}

/**
 * ✅ Client-visible status:
 * - Picked Up when client_picked_up_at exists
 * - Pickup Required when returned/needs_revision AND admin has received it back AND not picked up yet
 * - Otherwise fallback to request_status mapping
 */
function deriveClientStatus(it: ClientRequestItem): StatusTone {
    const pickedAt = it.client_picked_up_at ?? null;
    const waitingSince = it.admin_received_from_collector_at ?? it.collector_returned_to_admin_at ?? null;

    const rs = String((it as any).request_status ?? "").toLowerCase();

    if (pickedAt) {
        return {
            label: "Picked up",
            cls: "bg-emerald-100 text-emerald-900",
            sub: `Picked up at ${fmtDate(pickedAt)}`,
        };
    }

    const isReturnedFamily = rs === "returned" || rs === "needs_revision";
    if (isReturnedFamily && waitingSince) {
        return {
            label: "Pickup required",
            cls: "bg-amber-100 text-amber-900",
            sub: `Waiting since ${fmtDate(waitingSince)}`,
        };
    }

    return statusTone((it as any).request_status ?? null);
}

export default function ClientRequestsPage() {
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
        const t = window.setTimeout(() => setFlash(null), 8000);
        return () => window.clearTimeout(t);
    }, [flash]);

    const filtered = useMemo(() => {
        let list = items;

        const sf = statusFilter.toLowerCase();

        if (sf !== "all") {
            if (sf === "pickup_required") {
                list = list.filter((it) => deriveClientStatus(it).label.toLowerCase() === "pickup required");
            } else if (sf === "picked_up") {
                list = list.filter((it) => deriveClientStatus(it).label.toLowerCase() === "picked up");
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
    }, [items, searchTerm, statusFilter]);

    const load = async () => {
        try {
            setError(null);
            setLoading(true);

            const res = await clientSampleRequestService.list({
                page: 1,
                per_page: 100,
            });

            setItems((res.data ?? []) as ClientRequestItem[]);
        } catch (e: any) {
            const msg = getErrMsg(e);
            setError(msg);
            setItems([]);
        } finally {
            setLoading(false);
        }
    };

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
    }, [authLoading, isClientAuthenticated, navigate]);

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample Requests</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Create a request, complete required fields, then submit for admin review.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="lims-btn-primary self-start md:self-auto inline-flex items-center gap-2"
                >
                    <FilePlus2 size={16} />
                    New request
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
                        aria-label="Dismiss"
                        title="Dismiss"
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : null}

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="request-search">
                            Search requests
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="request-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by request ID, sample type, status, notes…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-60">
                        <label className="sr-only" htmlFor="request-status-filter">
                            Status
                        </label>
                        <select
                            id="request-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All status</option>
                            <option value="draft">Draft</option>
                            <option value="submitted">Submitted</option>
                            <option value="needs_revision">Needs revision</option>
                            <option value="ready_for_delivery">Ready for delivery</option>
                            <option value="physically_received">Physically received</option>
                            <option value="pickup_required">Pickup required</option>
                            <option value="picked_up">Picked up</option>
                        </select>
                    </div>

                    <button type="button" onClick={load} className="lims-btn w-full md:w-auto inline-flex items-center gap-2">
                        <RefreshCw size={16} />
                        Refresh
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("all");
                        }}
                        className="lims-btn w-full md:w-auto"
                    >
                        Clear
                    </button>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading ? <div className="text-sm text-gray-600">Loading requests…</div> : null}

                    {error && !loading ? (
                        <div className="text-sm text-rose-900 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl mb-4">
                            {error}
                        </div>
                    ) : null}

                    {!loading && !error ? (
                        <>
                            {filtered.length === 0 ? (
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                    <div className="font-semibold text-gray-900">No requests found</div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        Try clearing filters, or create a new request.
                                    </div>
                                    <button
                                        type="button"
                                        className="lims-btn-primary mt-4 inline-flex items-center gap-2"
                                        onClick={() => setCreateOpen(true)}
                                    >
                                        <FilePlus2 size={16} />
                                        Create request
                                    </button>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">Request</th>
                                                <th className="px-4 py-3 text-left">Sample type</th>
                                                <th className="px-4 py-3 text-left">Scheduled delivery</th>
                                                <th className="px-4 py-3 text-left">Status</th>
                                                <th className="px-4 py-3 text-left">Updated</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {filtered.map((it: any, idx: number) => {
                                                const rid = getRequestId(it);
                                                const updated = fmtDate(it.updated_at ?? it.created_at);
                                                const sched = fmtDate(it.scheduled_delivery_at);
                                                const st = deriveClientStatus(it as ClientRequestItem);

                                                return (
                                                    <tr
                                                        key={stableKey(it, idx)}
                                                        className="border-t border-gray-100 hover:bg-gray-50/60"
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">#{rid ?? "-"}</div>
                                                            <div className="text-[11px] text-gray-500">
                                                                {(it.requested_parameters?.length ?? 0) > 0
                                                                    ? `${it.requested_parameters.length} parameter(s)`
                                                                    : "No parameters"}
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{it.sample_type ?? "-"}</td>
                                                        <td className="px-4 py-3 text-gray-700">{sched}</td>

                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-col gap-1">
                                                                <span
                                                                    className={cx(
                                                                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                                                                        st.cls
                                                                    )}
                                                                >
                                                                    {st.label}
                                                                </span>
                                                                {st.sub ? (
                                                                    <span className="text-[11px] text-gray-500">{st.sub}</span>
                                                                ) : null}
                                                            </div>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{updated}</td>

                                                        <td className="px-4 py-3 text-right">
                                                            <button
                                                                type="button"
                                                                className={cx(
                                                                    "lims-icon-button text-gray-700",
                                                                    !rid && "opacity-40 cursor-not-allowed"
                                                                )}
                                                                aria-label="Open request"
                                                                title="Open request"
                                                                disabled={!rid}
                                                                onClick={() => rid && navigate(`/portal/requests/${rid}`)}
                                                            >
                                                                <Eye size={16} />
                                                            </button>
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
                    setFlash({ type: "success", message: "Request created. Complete the required fields, then submit." });
                    await load();
                }}
            />
        </div>
    );
}
