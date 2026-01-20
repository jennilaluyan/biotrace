import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    clientService,
    Client,
    CreateClientPayload,
    UpdateClientPayload,
} from "../../services/clients";
import { ClientFormModal } from "../../components/clients/ClientFormModal";
import { ClientDeleteModal } from "./ClientDeleteModal";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { toClientSlug } from "../../utils/slug";

type TypeFilter = "all" | "individual" | "institution";

const PAGE_SIZE = 10;

export const ClientsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewClients =
        roleId === ROLE_ID.ADMIN ||
        roleId === ROLE_ID.LAB_HEAD ||
        roleId === ROLE_ID.OPERATIONAL_MANAGER;

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

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await clientService.getAll();
                setClients(data);
            } catch (err: any) {
                const msg =
                    err?.data?.message ??
                    err?.data?.error ??
                    "Failed to load clients list.";
                setError(msg);
            } finally {
                setLoading(false);
            }
        };

        if (canViewClients) {
            load();
        } else {
            setLoading(false);
        }
    }, [canViewClients]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, typeFilter, clients.length]);

    const handleOpenCreate = () => {
        if (!canCrudClients) return;
        setSelectedClient(null);
        setIsCreateOpen(true);
    };
    const handleCloseCreate = () => setIsCreateOpen(false);

    const handleOpenEdit = (client: Client) => {
        if (!canCrudClients) return;
        setSelectedClient(client);
        setIsEditOpen(true);
    };
    const handleCloseEdit = () => {
        setIsEditOpen(false);
        setSelectedClient(null);
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

    const handleCreateSubmit = async (
        payload: CreateClientPayload | Partial<CreateClientPayload>
    ) => {
        const values = payload as CreateClientPayload;

        try {
            setError(null);
            const created = await clientService.create(values);
            setClients((prev) => [created, ...prev]);
            setCurrentPage(1);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Failed to create client.";
            setError(msg);
        } finally {
            setIsCreateOpen(false);
        }
    };

    const handleEditSubmit = async (values: UpdateClientPayload) => {
        if (!selectedClient) return;
        try {
            setError(null);
            const updated = await clientService.update(
                selectedClient.client_id,
                values
            );
            setClients((prev) =>
                prev.map((c) =>
                    c.client_id === updated.client_id ? updated : c
                )
            );
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Failed to update client.";
            setError(msg);
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
            setClients((prev) =>
                prev.filter((c) => c.client_id !== selectedClient.client_id)
            );
            handleCloseDelete();
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Failed to delete client.";
            setError(msg);
            setDeleteLoading(false);
        }
    };

    // --- Filtering ---
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
        const end = start + PAGE_SIZE;
        return filteredClients.slice(start, end);
    }, [filteredClients, currentPage]);

    const handlePageChange = (page: number) => {
        if (page < 1 || page > totalPages) return;
        setCurrentPage(page);
    };

    const handleViewClient = (client: Client) => {
        const slug = toClientSlug(client);
        navigate(`/clients/${slug}`);
    };

    if (!canViewClients) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role{" "}
                    <span className="font-semibold">({roleLabel})</span> is not
                    allowed to access the clients module.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <h1 className="text-lg md:text-xl font-bold text-gray-900">
                    Client Management
                </h1>

                {canCrudClients && (
                    <button
                        type="button"
                        onClick={handleOpenCreate}
                        className="lims-btn-primary self-start md:self-auto"
                    >
                        + New client
                    </button>
                )}
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="client-search">
                            Search clients
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
                                id="client-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by name, email, institution…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48">
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

                <div className="px-4 md:px-6 py-4">
                    {loading && (
                        <div className="text-sm text-gray-600">Loading clients...</div>
                    )}

                    {error && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            {filteredClients.length === 0 ? (
                                <div className="text-sm text-gray-600">
                                    No clients found with current filters.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">Name</th>
                                                <th className="px-4 py-3 text-left">Type</th>
                                                <th className="px-4 py-3 text-left">Contact</th>
                                                <th className="px-4 py-3 text-left">
                                                    Institution / Address
                                                </th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedClients.map((client) => {
                                                const isInstitution =
                                                    client.type === "institution";

                                                const primaryContact =
                                                    client.email ||
                                                    client.phone ||
                                                    client.contact_person_email ||
                                                    client.contact_person_phone ||
                                                    "-";

                                                const institutionLabel = isInstitution
                                                    ? client.institution_name || client.name
                                                    : client.address_domicile ||
                                                    client.address_ktp ||
                                                    "-";

                                                return (
                                                    <tr
                                                        key={client.client_id}
                                                        className="border-t border-gray-100 hover:bg-gray-50/60"
                                                    >
                                                        <td className="px-4 py-3">
                                                            <div className="font-medium text-gray-900">
                                                                {client.name}
                                                            </div>
                                                            {isInstitution &&
                                                                client.contact_person_name && (
                                                                    <div className="text-[11px] text-gray-500">
                                                                        PIC:{" "}
                                                                        {client.contact_person_name}
                                                                    </div>
                                                                )}
                                                        </td>

                                                        <td className="px-4 py-3">
                                                            <span
                                                                className={
                                                                    isInstitution
                                                                        ? "lims-badge-institution"
                                                                        : "lims-badge-individual"
                                                                }
                                                            >
                                                                {isInstitution
                                                                    ? "Institution"
                                                                    : "Individual"}
                                                            </span>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            {primaryContact}
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700">
                                                            {institutionLabel}
                                                        </td>

                                                        <td className="px-4 py-3 text-right">
                                                            <div className="inline-flex gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-600"
                                                                    aria-label="View client"
                                                                    onClick={() => navigate(`/clients/${toClientSlug(client)}`)}
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
                                                                        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                                                                        <circle cx="12" cy="12" r="3" />
                                                                    </svg>
                                                                </button>

                                                                {canCrudClients && (
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            className="lims-icon-button text-gray-600"
                                                                            aria-label="Edit client"
                                                                            onClick={() =>
                                                                                handleOpenEdit(client)
                                                                            }
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
                                                                                <path d="M12 20h9" />
                                                                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                                                                            </svg>
                                                                        </button>

                                                                        <button
                                                                            type="button"
                                                                            className="lims-icon-button lims-icon-button--danger"
                                                                            aria-label="Delete client"
                                                                            onClick={() =>
                                                                                handleAskDelete(client)
                                                                            }
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
                                                                                <polyline points="3 6 5 6 21 6" />
                                                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                                                                <path d="M10 11v6" />
                                                                                <path d="M14 11v6" />
                                                                                <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                                                                            </svg>
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
                                    {/* Pagination bar */}
                                    <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-gray-600">
                                        <div>
                                            Showing{" "}
                                            <span className="font-semibold">
                                                {totalClients === 0
                                                    ? 0
                                                    : (currentPage - 1) * PAGE_SIZE + 1}
                                            </span>{" "}
                                            –{" "}
                                            <span className="font-semibold">
                                                {Math.min(currentPage * PAGE_SIZE, totalClients)}
                                            </span>{" "}
                                            of{" "}
                                            <span className="font-semibold">{totalClients}</span> clients
                                        </div>

                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() => handlePageChange(currentPage - 1)}
                                                disabled={currentPage === 1}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Previous
                                            </button>

                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                                <button
                                                    key={page}
                                                    type="button"
                                                    onClick={() => handlePageChange(page)}
                                                    className={`px-3 py-1 rounded-full text-xs border ${page === currentPage
                                                        ? "bg-primary text-white border-primary"
                                                        : "bg-white text-gray-700 hover:bg-gray-50"
                                                        }`}
                                                >
                                                    {page}
                                                </button>
                                            ))}

                                            <button
                                                type="button"
                                                onClick={() => handlePageChange(currentPage + 1)}
                                                disabled={currentPage === totalPages}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <ClientFormModal
                open={isCreateOpen}
                mode="create"
                initialClient={null}
                onClose={handleCloseCreate}
                onSubmit={handleCreateSubmit}
            />

            <ClientFormModal
                open={isEditOpen}
                mode="edit"
                initialClient={selectedClient ?? null}
                onClose={handleCloseEdit}
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
