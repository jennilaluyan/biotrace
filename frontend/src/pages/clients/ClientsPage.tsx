import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Plus, Search, RefreshCw, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, Users } from "lucide-react";

import { clientService, Client, CreateClientPayload, UpdateClientPayload } from "../../services/clients";
import { ClientFormModal } from "../../components/clients/ClientFormModal";
import { ClientDeleteModal } from "./ClientDeleteModal";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { toClientSlug } from "../../utils/slug";

type TypeFilter = "all" | "individual" | "institution";

const PAGE_SIZE = 10;

function getPagination(current: number, total: number) {
    // compact pagination: 1 … (c-1) c (c+1) … total
    const items: Array<number | "ellipsis"> = [];
    if (total <= 7) {
        for (let i = 1; i <= total; i++) items.push(i);
        return items;
    }

    items.push(1);

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    if (start > 2) items.push("ellipsis");
    for (let i = start; i <= end; i++) items.push(i);
    if (end < total - 1) items.push("ellipsis");

    items.push(total);
    return items;
}

export const ClientsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewClients = roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.LAB_HEAD || roleId === ROLE_ID.OPERATIONAL_MANAGER;
    const canCrudClients = roleId === ROLE_ID.ADMIN;

    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [currentPage, setCurrentPage] = useState(1);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await clientService.getAll();
            setClients(data);
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Failed to load clients list.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canViewClients) load();
        else setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canViewClients]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, typeFilter, clients.length]);

    const handleOpenCreate = () => {
        if (!canCrudClients) return;
        setSelectedClient(null);
        setIsCreateOpen(true);
    };

    const handleOpenEdit = (client: Client) => {
        if (!canCrudClients) return;
        setSelectedClient(client);
        setIsEditOpen(true);
    };

    const handleAskDelete = (client: Client) => {
        if (!canCrudClients) return;
        setSelectedClient(client);
        setIsDeleteOpen(true);
    };

    const handleCloseDelete = () => {
        setIsDeleteOpen(false);
        setSelectedClient(null);
        setDeleteLoading(false);
    };

    const handleCreateSubmit = async (payload: CreateClientPayload | Partial<CreateClientPayload>) => {
        const values = payload as CreateClientPayload;

        try {
            setError(null);
            const created = await clientService.create(values);
            setClients((prev) => [created, ...prev]);
            setCurrentPage(1);
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Failed to create client.");
        } finally {
            setIsCreateOpen(false);
        }
    };

    const handleEditSubmit = async (values: UpdateClientPayload) => {
        if (!selectedClient) return;
        try {
            setError(null);
            const updated = await clientService.update(selectedClient.client_id, values);
            setClients((prev) => prev.map((c) => (c.client_id === updated.client_id ? updated : c)));
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Failed to update client.");
        } finally {
            setIsEditOpen(false);
            setSelectedClient(null);
        }
    };

    const handleConfirmDelete = async () => {
        if (!selectedClient) return;
        try {
            setDeleteLoading(true);
            setError(null);
            await clientService.destroy(selectedClient.client_id);
            setClients((prev) => prev.filter((c) => c.client_id !== selectedClient.client_id));
            handleCloseDelete();
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Failed to remove client.");
            setDeleteLoading(false);
        }
    };

    const filteredClients = useMemo(() => {
        return clients.filter((client) => {
            if (typeFilter !== "all" && client.type !== typeFilter) return false;
            if (!searchTerm.trim()) return true;

            const term = searchTerm.toLowerCase();
            const haystack = [
                client.name,
                client.email,
                client.phone,
                client.institution_name,
                client.contact_person_name,
                client.contact_person_email,
                client.address_ktp,
                client.address_domicile,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [clients, typeFilter, searchTerm]);

    const totalClients = filteredClients.length;
    const totalPages = Math.max(1, Math.ceil(totalClients / PAGE_SIZE));

    const paginatedClients = useMemo(() => {
        const start = (currentPage - 1) * PAGE_SIZE;
        return filteredClients.slice(start, start + PAGE_SIZE);
    }, [filteredClients, currentPage]);

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setCurrentPage(page);
    };

    if (!canViewClients) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to access the clients
                    module.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Clients</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        View and manage the client registry. Client records are used across samples, reports, and audit logs.
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                    <button
                        type="button"
                        onClick={load}
                        className="btn-outline inline-flex items-center gap-2"
                        disabled={loading}
                    >
                        <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                        Refresh
                    </button>

                    {canCrudClients && (
                        <button type="button" onClick={handleOpenCreate} className="lims-btn-primary inline-flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            New client
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="client-search">
                            Search clients
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search className="h-4 w-4" />
                            </span>
                            <input
                                id="client-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search name, email, phone, institution…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="client-type-filter">
                            Client type
                        </label>
                        <select
                            id="client-type-filter"
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

                {/* Body */}
                <div className="px-4 md:px-6 py-4">
                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-sm text-gray-600">Loading clients…</div>
                    ) : filteredClients.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="mx-auto h-10 w-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600">
                                <Users className="h-5 w-5" />
                            </div>
                            <div className="mt-3 text-sm font-semibold text-gray-900">No clients found</div>
                            <div className="mt-1 text-xs text-gray-500">
                                Try adjusting the search or filters{canCrudClients ? ", or create a new client." : "."}
                            </div>

                            {canCrudClients && (
                                <button
                                    type="button"
                                    onClick={handleOpenCreate}
                                    className="mt-4 lims-btn-primary inline-flex items-center gap-2"
                                >
                                    <Plus className="h-4 w-4" />
                                    Create client
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                        <th className="px-4 py-3 text-left">Name</th>
                                        <th className="px-4 py-3 text-left">Type</th>
                                        <th className="px-4 py-3 text-left">Contact</th>
                                        <th className="px-4 py-3 text-left">Institution / Address</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {paginatedClients.map((client) => {
                                        const isInstitution = client.type === "institution";

                                        const primaryContact =
                                            client.email ||
                                            client.phone ||
                                            client.contact_person_email ||
                                            client.contact_person_phone ||
                                            "-";

                                        const institutionOrAddress = isInstitution
                                            ? client.institution_name || client.name
                                            : client.address_domicile || client.address_ktp || "-";

                                        return (
                                            <tr key={client.client_id} className="border-t border-gray-100 hover:bg-gray-50/60">
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{client.name}</div>
                                                    {isInstitution && client.contact_person_name && (
                                                        <div className="text-[11px] text-gray-500">PIC: {client.contact_person_name}</div>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span className={isInstitution ? "lims-badge-institution" : "lims-badge-individual"}>
                                                        {isInstitution ? "Institution" : "Individual"}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">{primaryContact}</td>
                                                <td className="px-4 py-3 text-gray-700">{institutionOrAddress}</td>

                                                <td className="px-4 py-3 text-right">
                                                    <div className="inline-flex gap-1.5">
                                                        <button
                                                            type="button"
                                                            className="lims-icon-button text-gray-600"
                                                            aria-label="View client"
                                                            onClick={() => navigate(`/clients/${toClientSlug(client)}`)}
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </button>

                                                        {canCrudClients && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-600"
                                                                    aria-label="Edit client"
                                                                    onClick={() => handleOpenEdit(client)}
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button lims-icon-button--danger"
                                                                    aria-label="Remove client"
                                                                    onClick={() => handleAskDelete(client)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Pagination */}
                            <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-gray-600">
                                <div>
                                    Showing{" "}
                                    <span className="font-semibold">
                                        {totalClients === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}
                                    </span>{" "}
                                    –{" "}
                                    <span className="font-semibold">{Math.min(currentPage * PAGE_SIZE, totalClients)}</span>{" "}
                                    of <span className="font-semibold">{totalClients}</span> clients
                                </div>

                                <div className="flex items-center justify-end gap-1">
                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 inline-flex items-center gap-2"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        Previous
                                    </button>

                                    {getPagination(currentPage, totalPages).map((it, idx) =>
                                        it === "ellipsis" ? (
                                            <span key={`e-${idx}`} className="px-2 text-gray-400">
                                                …
                                            </span>
                                        ) : (
                                            <button
                                                key={it}
                                                type="button"
                                                onClick={() => handlePageChange(it)}
                                                className={`px-3 py-1 rounded-full text-xs border ${it === currentPage
                                                    ? "bg-primary text-white border-primary"
                                                    : "bg-white text-gray-700 hover:bg-gray-50"
                                                    }`}
                                            >
                                                {it}
                                            </button>
                                        )
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => handlePageChange(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 inline-flex items-center gap-2"
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ClientFormModal
                open={isCreateOpen}
                mode="create"
                initialClient={null}
                onClose={() => setIsCreateOpen(false)}
                onSubmit={handleCreateSubmit}
            />

            <ClientFormModal
                open={isEditOpen}
                mode="edit"
                initialClient={selectedClient ?? null}
                onClose={() => {
                    setIsEditOpen(false);
                    setSelectedClient(null);
                }}
                onSubmit={handleEditSubmit}
            />

            <ClientDeleteModal
                open={isDeleteOpen}
                loading={deleteLoading}
                clientName={selectedClient?.name}
                onCancel={handleCloseDelete}
                onConfirm={handleConfirmDelete}
            />
        </div>
    );
};
