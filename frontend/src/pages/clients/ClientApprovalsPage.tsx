import { useEffect, useMemo, useState } from "react";
import { clientApprovalsService } from "../../services/clientApprovals";
import type { Client } from "../../services/clients";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { toClientSlug } from "../../utils/slug";
import { useNavigate } from "react-router-dom";

type TypeFilter = "all" | "individual" | "institution";

export const ClientApprovalsPage = () => {
    const { user } = useAuth();
    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);
    const navigate = useNavigate();

    // ✅ Approve client: biasanya Admin saja (sesuai backend flow kamu)
    const canApproveClients = roleId === ROLE_ID.ADMIN;

    const [items, setItems] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

    const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await clientApprovalsService.listPending();
            setItems(data);
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Failed to load pending clients.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!canApproveClients) {
            setLoading(false);
            return;
        }
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canApproveClients]);

    const filtered = useMemo(() => {
        return items.filter((c) => {
            if (typeFilter !== "all" && c.type !== typeFilter) return false;
            if (!searchTerm.trim()) return true;

            const term = searchTerm.toLowerCase();
            const haystack = [
                c.name,
                c.email,
                c.phone,
                c.institution_name,
                c.contact_person_name,
                c.contact_person_email,
                c.address_ktp,
                c.address_domicile,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [items, searchTerm, typeFilter]);

    const approve = async (clientId: number) => {
        if (!confirm("Approve this client?")) return;
        try {
            setActionLoadingId(clientId);
            await clientApprovalsService.approve(clientId);
            setItems((prev) => prev.filter((x) => x.client_id !== clientId));
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Failed to approve client.");
        } finally {
            setActionLoadingId(null);
        }
    };

    const reject = async (clientId: number) => {
        if (!confirm("Reject this client? This will remove the registration (soft delete).")) return;
        try {
            setActionLoadingId(clientId);
            await clientApprovalsService.reject(clientId);
            setItems((prev) => prev.filter((x) => x.client_id !== clientId));
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Failed to reject client.");
        } finally {
            setActionLoadingId(null);
        }
    };

    if (!canApproveClients) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to approve clients.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Client Approvals</h1>
                    <p className="text-xs text-gray-500 mt-1">Approve or reject newly registered client accounts.</p>
                </div>

                <button type="button" onClick={load} className="btn-outline self-start md:self-auto">
                    Refresh
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="pending-client-search">Search pending clients</label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="11" cy="11" r="6" />
                                    <line x1="16" y1="16" x2="21" y2="21" />
                                </svg>
                            </span>
                            <input
                                id="pending-client-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by name, email, institution…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="sr-only" htmlFor="pending-client-type-filter">Client type</label>
                        <select
                            id="pending-client-type-filter"
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All types</option>
                            <option value="individual">Individual</option>
                            <option value="institution">Institution</option>
                        </select>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {loading && <div className="text-sm text-gray-600">Loading pending clients...</div>}

                    {error && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
                    )}

                    {!loading && !error && (
                        <>
                            {filtered.length === 0 ? (
                                <div className="text-sm text-gray-600">No pending client approvals.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">Client</th>
                                                <th className="px-4 py-3 text-left">Type</th>
                                                <th className="px-4 py-3 text-left">Contact</th>
                                                <th className="px-4 py-3 text-left">Details</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {filtered.map((c) => {
                                                const isInstitution = c.type === "institution";
                                                const primaryContact =
                                                    c.email || c.phone || c.contact_person_email || c.contact_person_phone || "-";
                                                const details = isInstitution
                                                    ? (c.institution_name || "-")
                                                    : (c.address_domicile || c.address_ktp || "-");

                                                const busy = actionLoadingId === c.client_id;

                                                return (
                                                    <tr key={c.client_id} className="border-t border-gray-100 hover:bg-gray-50/60">
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">{c.name}</div>
                                                            <div className="text-[11px] text-gray-500">Status: Pending</div>
                                                        </td>

                                                        <td className="px-4 py-3">
                                                            <span className={isInstitution ? "lims-badge-institution" : "lims-badge-individual"}>
                                                                {isInstitution ? "Institution" : "Individual"}
                                                            </span>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">{primaryContact}</td>
                                                        <td className="px-4 py-3 text-gray-700">{details}</td>

                                                        <td className="px-4 py-3 text-right">
                                                            <div className="inline-flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    className="btn-outline"
                                                                    onClick={() => navigate(`/clients/${toClientSlug(c)}`)}
                                                                >
                                                                    View
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className="lims-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    onClick={() => approve(c.client_id)}
                                                                >
                                                                    {busy ? "..." : "Approve"}
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    className="lims-btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    onClick={() => reject(c.client_id)}
                                                                >
                                                                    {busy ? "..." : "Reject"}
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
                    )}
                </div>
            </div>
        </div>
    );
};
