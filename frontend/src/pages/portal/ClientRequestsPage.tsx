import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Sample } from "../../services/samples";
import { clientSampleRequestService } from "../../services/sampleRequests";
import { ClientRequestFormModal } from "../../components/portal/ClientRequestFormModal";
import { useClientAuth } from "../../hooks/useClientAuth";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type StatusTone = { label: string; cls: string; sub?: string };

type ClientRequestItem = Sample & {
    // physical workflow timestamps (optional on type)
    admin_received_from_collector_at?: string | null;
    collector_returned_to_admin_at?: string | null;
    client_picked_up_at?: string | null;
};

const statusTone = (raw?: string | null): StatusTone => {
    const s = (raw ?? "").toLowerCase();
    if (s === "draft") return { label: raw ?? "Draft", cls: "bg-gray-100 text-gray-700" };
    if (s === "submitted") return { label: raw ?? "Submitted", cls: "bg-primary-soft/10 text-primary-soft" };
    if (s === "returned" || s === "needs_revision")
        return { label: raw ?? "Returned", cls: "bg-red-100 text-red-700" };
    if (s === "ready_for_delivery") return { label: raw ?? "Ready", cls: "bg-indigo-50 text-indigo-700" };
    if (s === "physically_received") return { label: raw ?? "Received", cls: "bg-green-100 text-green-800" };
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
 * ✅ Step 7: derive a client-visible status:
 * - Picked Up when client_picked_up_at exists
 * - Pickup Required when returned/needs_revision AND admin has received it back from collector AND not picked up yet
 * - Otherwise fallback to request_status mapping
 */
function deriveClientStatus(it: ClientRequestItem): StatusTone {
    const pickedAt = it.client_picked_up_at ?? null;

    // "waiting since" anchor: prefer admin_received_from_collector_at, fallback collector_returned_to_admin_at
    const waitingSince =
        it.admin_received_from_collector_at ?? it.collector_returned_to_admin_at ?? null;

    const rs = String(it.request_status ?? "").toLowerCase();

    if (pickedAt) {
        return {
            label: "Picked Up",
            cls: "bg-green-100 text-green-800",
            sub: `Picked up at ${fmtDate(pickedAt)}`,
        };
    }

    const isReturnedFamily = rs === "returned" || rs === "needs_revision";

    if (isReturnedFamily && waitingSince) {
        return {
            label: "Pickup Required",
            cls: "bg-amber-100 text-amber-800",
            sub: `Waiting since ${fmtDate(waitingSince)}`,
        };
    }

    return statusTone(it.request_status ?? null);
}

export default function ClientRequestsPage() {
    const navigate = useNavigate();
    const { loading: authLoading, isClientAuthenticated } = useClientAuth() as any;

    const [items, setItems] = useState<ClientRequestItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [createOpen, setCreateOpen] = useState(false);

    const filtered = useMemo(() => {
        let list = items;

        const sf = statusFilter.toLowerCase();

        // ✅ Step 7: allow derived-status filtering in UI
        if (sf !== "all") {
            if (sf === "pickup_required") {
                list = list.filter((it) => {
                    const d = deriveClientStatus(it);
                    return d.label.toLowerCase() === "pickup required";
                });
            } else if (sf === "picked_up") {
                list = list.filter((it) => {
                    const d = deriveClientStatus(it);
                    return d.label.toLowerCase() === "picked up";
                });
            } else {
                list = list.filter((it) => String(it.request_status ?? "").toLowerCase() === sf);
            }
        }

        const term = searchTerm.trim().toLowerCase();
        if (!term) return list;

        return list.filter((it) => {
            const d = deriveClientStatus(it);
            const hay = [
                String(it.sample_id ?? ""),
                it.lab_sample_code,
                it.request_status,
                d.label,
                d.sub,
                it.sample_type,
                it.additional_notes,
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
                        Create draft → fill required fields → submit for admin review.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="lims-btn-primary self-start md:self-auto"
                >
                    + New request
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="request-search">
                            Search requests
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <svg
                                    viewBox="0 0 24 24"
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <circle cx="11" cy="11" r="6" />
                                    <line x1="16" y1="16" x2="21" y2="21" />
                                </svg>
                            </span>

                            <input
                                id="request-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by code, sample type, notes…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-56">
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
                            <option value="needs_revision">Returned</option>
                            <option value="ready_for_delivery">Ready for delivery</option>
                            <option value="physically_received">Physically received</option>

                            {/* ✅ Step 7 derived statuses */}
                            <option value="pickup_required">Pickup required</option>
                            <option value="picked_up">Picked up</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={load}
                        className="w-full md:w-auto rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Refresh
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            setSearchTerm("");
                            setStatusFilter("all");
                        }}
                        className="w-full md:w-auto rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Clear
                    </button>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading && <div className="text-sm text-gray-600">Loading requests...</div>}

                    {error && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            {filtered.length === 0 ? (
                                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                    <div className="font-semibold text-gray-900">No requests found</div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        Create your first request to start the workflow.
                                    </div>
                                    <button
                                        type="button"
                                        className="lims-btn-primary mt-4"
                                        onClick={() => setCreateOpen(true)}
                                    >
                                        + Create request
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
                                                                    "lims-icon-button text-gray-600",
                                                                    !rid && "opacity-40 cursor-not-allowed"
                                                                )}
                                                                aria-label="View request"
                                                                disabled={!rid}
                                                                onClick={() => rid && navigate(`/portal/requests/${rid}`)}
                                                            >
                                                                <svg
                                                                    viewBox="0 0 24 24"
                                                                    className="h-4 w-4"
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    strokeWidth="1.8"
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                >
                                                                    <path d="M1 12s4-7 11-7 11 7 11 7 4 7-11 7-11-7-11-7z" />
                                                                    <circle cx="12" cy="12" r="3" />
                                                                </svg>
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
                    )}
                </div>
            </div>

            <ClientRequestFormModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onCreated={async () => {
                    setCreateOpen(false);
                    await load();
                }}
            />
        </div>
    );
}
