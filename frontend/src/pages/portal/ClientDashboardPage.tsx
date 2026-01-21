import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clientPortal, ClientSample } from "../../services/clientPortal";
import { useClientAuth } from "../../hooks/useClientAuth";

const StatCard = ({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="text-xs text-gray-500">{title}</div>
        <div className="text-2xl font-semibold text-gray-900 mt-1">{value}</div>
        {subtitle ? <div className="text-xs text-gray-500 mt-2">{subtitle}</div> : null}
    </div>
);

export default function ClientDashboardPage() {
    const navigate = useNavigate();
    const { client, loading: authLoading, isClientAuthenticated } = useClientAuth() as any;

    const [items, setItems] = useState<ClientSample[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;

        if (!isClientAuthenticated) {
            navigate("/login", { replace: true });
            return;
        }

        let cancelled = false;

        const run = async () => {
            try {
                setLoading(true);
                const list = await clientPortal.listSamples();
                if (!cancelled) setItems(list ?? []);
            } catch {
                if (!cancelled) setItems([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [authLoading, isClientAuthenticated, navigate]);

    const stats = useMemo(() => {
        const total = items.length;
        const byStatus = items.reduce<Record<string, number>>((acc, s) => {
            const k = (s.request_status ?? s.status ?? "unknown").toLowerCase();
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
        }, {});
        const drafts = (byStatus["draft"] ?? 0) + (byStatus["pending"] ?? 0);
        const submitted = (byStatus["submitted"] ?? 0) + (byStatus["requested"] ?? 0);
        const returned = (byStatus["returned"] ?? 0) + (byStatus["rejected"] ?? 0);
        return { total, drafts, submitted, returned };
    }, [items]);

    return (
        <div className="min-h-[60vh]">
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h1 className="text-lg md:text-xl font-bold text-gray-900">Dashboard</h1>
                <p className="text-sm text-gray-600 mt-1">
                    Welcome{client?.name ? `, ${client.name}` : ""}. Create and track sample requests here.
                </p>

                <div className="mt-4 flex flex-wrap gap-3">
                    <button className="lims-btn-primary" onClick={() => navigate("/portal/requests")}>
                        Go to requests
                    </button>

                    <button className="lims-btn" onClick={() => navigate("/portal/requests")}>
                        Create new request
                    </button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="Total requests" value={loading ? "…" : stats.total} subtitle="All requests you’ve created." />
                <StatCard title="Draft / in progress" value={loading ? "…" : stats.drafts} subtitle="Requests you can still edit." />
                <StatCard title="Submitted / waiting review" value={loading ? "…" : stats.submitted} subtitle="Requests already sent to the lab." />
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                    <div className="text-sm font-semibold text-gray-900">What happens next?</div>
                    <p className="text-sm text-gray-600 mt-2">
                        Create a request → fill details → submit → admin review → request becomes an official sample.
                    </p>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                    <div className="text-sm font-semibold text-gray-900">Need to revise?</div>
                    <p className="text-sm text-gray-600 mt-2">
                        If admin returns your request, you can edit it and submit again.
                    </p>
                </div>
            </div>
        </div>
    );
}
