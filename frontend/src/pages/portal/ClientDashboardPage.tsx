import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ArrowRight,
    ClipboardList,
    FilePlus2,
    Loader2,
    RefreshCw,
    Clock,
    AlertTriangle,
} from "lucide-react";

import { clientSampleRequestService } from "../../services/sampleRequests";
import type { Sample } from "../../services/samples";
import { useClientAuth } from "../../hooks/useClientAuth";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Tone = { label: string; cls: string };

function statusTone(raw?: string | null): Tone {
    const s = (raw ?? "").toLowerCase();
    if (s === "draft") return { label: "Draft", cls: "bg-gray-100 text-gray-700" };
    if (s === "submitted") return { label: "Submitted", cls: "bg-primary-soft/10 text-primary-soft" };
    if (s === "needs_revision" || s === "returned") return { label: "Needs revision", cls: "bg-amber-100 text-amber-900" };
    if (s === "ready_for_delivery") return { label: "Ready for delivery", cls: "bg-indigo-50 text-indigo-700" };
    if (s === "physically_received") return { label: "Physically received", cls: "bg-emerald-100 text-emerald-900" };
    return { label: raw ? String(raw) : "Unknown", cls: "bg-gray-100 text-gray-700" };
}

function fmtDate(iso?: string | null) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
}

function getRequestId(it: any): number | null {
    const raw = it?.sample_id ?? it?.id ?? it?.request_id;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
}

const StatCard = ({
    title,
    value,
    subtitle,
    icon,
}: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ReactNode;
}) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <div className="text-xs text-gray-500">{title}</div>
                <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
                {subtitle ? <div className="text-xs text-gray-500 mt-2">{subtitle}</div> : null}
            </div>
            {icon ? (
                <div className="shrink-0 rounded-2xl border border-gray-200 bg-gray-50 p-2 text-gray-700">
                    {icon}
                </div>
            ) : null}
        </div>
    </div>
);

export default function ClientDashboardPage() {
    const navigate = useNavigate();
    const { client, loading: authLoading, isClientAuthenticated } = useClientAuth() as any;

    const [items, setItems] = useState<Sample[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        try {
            setError(null);
            setLoading(true);
            const res = await clientSampleRequestService.list({ page: 1, per_page: 100 });
            setItems(res.data ?? []);
        } catch {
            setItems([]);
            setError("We couldn’t load your requests. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (authLoading) return;
        if (!isClientAuthenticated) {
            navigate("/login", { replace: true });
            return;
        }
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, isClientAuthenticated, navigate]);

    const stats = useMemo(() => {
        const total = items.length;
        const byStatus = items.reduce<Record<string, number>>((acc, s) => {
            const k = String((s as any).request_status ?? "unknown").toLowerCase();
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
        }, {});
        const drafts = byStatus["draft"] ?? 0;
        const submitted = byStatus["submitted"] ?? 0;
        const returned = (byStatus["returned"] ?? 0) + (byStatus["needs_revision"] ?? 0);
        const ready = byStatus["ready_for_delivery"] ?? 0;
        return { total, drafts, submitted, returned, ready };
    }, [items]);

    const recent = useMemo(() => {
        const arr = [...items];
        arr.sort((a: any, b: any) => {
            const da = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
            const db = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
            return db - da;
        });
        return arr.slice(0, 5);
    }, [items]);

    return (
        <div className="min-h-[60vh]">
            {/* Hero */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                        <h1 className="text-lg md:text-xl font-bold text-gray-900">Client Dashboard</h1>
                        <p className="text-sm text-gray-600 mt-1">
                            Welcome{client?.name ? `, ${client.name}` : ""}. Create requests, track status, and see what needs action.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            className="lims-btn inline-flex items-center gap-2"
                            onClick={load}
                            disabled={loading}
                            aria-label="Refresh dashboard"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            Refresh
                        </button>

                        <button
                            type="button"
                            className="lims-btn-primary inline-flex items-center gap-2"
                            onClick={() => navigate("/portal/requests", { state: { openCreate: true } })}
                        >
                            <FilePlus2 size={16} />
                            New request
                        </button>

                        <button
                            type="button"
                            className="lims-btn inline-flex items-center gap-2"
                            onClick={() => navigate("/portal/requests")}
                        >
                            <ClipboardList size={16} />
                            View all
                        </button>
                    </div>
                </div>

                <div className="mt-4 text-xs text-gray-500 flex items-center gap-2">
                    <Clock size={14} />
                    Requests move through: Draft → Submitted → Admin review → Delivery schedule → Physical receive.
                </div>
            </div>

            {/* Stats */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard title="Total requests" value={loading ? "…" : stats.total} subtitle="All requests you created." icon={<ClipboardList size={18} />} />
                <StatCard title="Draft" value={loading ? "…" : stats.drafts} subtitle="You can still edit these." icon={<FilePlus2 size={18} />} />
                <StatCard title="Submitted" value={loading ? "…" : stats.submitted} subtitle="Waiting for admin review." icon={<Clock size={18} />} />
                <StatCard title="Needs action" value={loading ? "…" : stats.returned} subtitle="Returned for revision." icon={<AlertTriangle size={18} />} />
            </div>

            {/* Error banner */}
            {error ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <div className="font-medium">{error}</div>
                    <div className="mt-2">
                        <button type="button" className="lims-btn inline-flex items-center gap-2" onClick={load}>
                            <RefreshCw size={16} />
                            Try again
                        </button>
                    </div>
                </div>
            ) : null}

            {/* Recent + Tips */}
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-4 md:px-6 py-4 border-b border-gray-100">
                        <div className="text-sm font-semibold text-gray-900">Recent requests</div>
                        <div className="text-xs text-gray-500 mt-1">Jump back into what you worked on recently.</div>
                    </div>

                    <div className="px-4 md:px-6 py-4">
                        {loading ? (
                            <div className="text-sm text-gray-600">Loading…</div>
                        ) : recent.length === 0 ? (
                            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-5 text-sm text-gray-700">
                                <div className="font-semibold text-gray-900">No requests yet</div>
                                <div className="text-sm text-gray-600 mt-1">
                                    Create your first request to start the workflow.
                                </div>
                                <button
                                    type="button"
                                    className="lims-btn-primary mt-4 inline-flex items-center gap-2"
                                    onClick={() => navigate("/portal/requests", { state: { openCreate: true } })}
                                >
                                    <FilePlus2 size={16} />
                                    Create request
                                </button>
                            </div>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {recent.map((it: any, idx: number) => {
                                    const rid = getRequestId(it);
                                    const st = statusTone(it.request_status ?? null);
                                    const updated = fmtDate(it.updated_at ?? it.created_at);
                                    return (
                                        <li key={String(rid ?? idx)} className="py-3 flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <div className="font-medium text-gray-900">Request #{rid ?? "-"}</div>
                                                    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", st.cls)}>
                                                        {st.label}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">Updated: {updated}</div>
                                            </div>

                                            <button
                                                type="button"
                                                className={cx("lims-btn inline-flex items-center gap-2", !rid && "opacity-50 cursor-not-allowed")}
                                                onClick={() => rid && navigate(`/portal/requests/${rid}`)}
                                                disabled={!rid}
                                                aria-label="Open request"
                                            >
                                                Open <ArrowRight size={16} />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                    <div className="text-sm font-semibold text-gray-900">Tips to avoid delays</div>
                    <div className="mt-3 space-y-3 text-sm text-gray-600">
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            Fill the required fields (sample type, scheduled delivery, and parameter) before submitting.
                        </div>
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            If your request is returned, open it, address the note, save draft, then submit again.
                        </div>
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            Use scheduled delivery time as your plan for drop-off. Times are shown in your local timezone.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
