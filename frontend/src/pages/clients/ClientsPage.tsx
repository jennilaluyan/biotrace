import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    Plus,
    Search,
    RefreshCw,
    Eye,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
    Users,
    Filter,
    Building2,
    User,
    ShieldAlert
} from "lucide-react";

import { clientService, Client, CreateClientPayload, UpdateClientPayload } from "../../services/clients";
import { ClientFormModal } from "../../components/clients/ClientFormModal";
import { ClientDeleteModal } from "./ClientDeleteModal";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { toClientSlug } from "../../utils/slug";

type TypeFilter = "all" | "individual" | "institution";

const PAGE_SIZE = 10;

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

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
    const { t } = useTranslation();
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
            setError(err?.data?.message ?? err?.data?.error ?? t("clients.list.errors.loadFailed", "Failed to load clients list."));
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

    const handleOpenCreate = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        if (!canCrudClients) return;
        setSelectedClient(null);
        setIsCreateOpen(true);
    };

    const handleOpenEdit = (e: React.MouseEvent, client: Client) => {
        e.preventDefault();
        e.stopPropagation(); // Mencegah bubbling event ke row/parent
        if (!canCrudClients) return;
        setSelectedClient(client);
        setIsEditOpen(true);
    };

    const handleAskDelete = (e: React.MouseEvent, client: Client) => {
        e.preventDefault();
        e.stopPropagation(); // Mencegah bubbling
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
            setError(err?.data?.message ?? err?.data?.error ?? t("clients.list.errors.createFailed", "Failed to create client."));
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
            setError(err?.data?.message ?? err?.data?.error ?? t("clients.list.errors.updateFailed", "Failed to update client."));
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
            setError(err?.data?.message ?? err?.data?.error ?? t("clients.list.errors.deleteFailed", "Failed to remove client."));
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
                <div className="bg-red-50 p-4 rounded-full mb-3">
                    <ShieldAlert className="h-8 w-8 text-red-600" />
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-1">{t("clients.forbidden.title", "Access denied")}</h1>
                <p className="text-sm text-gray-600 max-w-md">
                    {t("clients.forbidden.bodyClients", "Your role ({{role}}) is not allowed to access the Clients module.", { role: roleLabel })}
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh] pb-20">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between px-0 py-2 mb-2">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t("clients.list.title", "Client management")}</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        {t("clients.list.subtitle", "View and maintain client records.")}
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                    <button
                        type="button"
                        onClick={load}
                        className={cx(
                            "lims-icon-button bg-white border border-gray-200 shadow-sm hover:bg-gray-50",
                            loading && "opacity-70 cursor-not-allowed"
                        )}
                        disabled={loading}
                        title={t("refresh", "Refresh")}
                    >
                        <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
                    </button>

                    {canCrudClients && (
                        <button
                            type="button"
                            onClick={handleOpenCreate}
                            className="lims-btn-primary inline-flex items-center gap-2 shadow-sm"
                        >
                            <Plus className="h-4 w-4" />
                            {t("clients.list.newClient", "New client")}
                        </button>
                    )}
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="mb-4 text-sm text-rose-900 bg-rose-50 border border-rose-200 px-4 py-3 rounded-2xl flex items-start gap-2">
                    <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                    {error}
                </div>
            )}

            {/* Content Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters */}
                <div className="px-4 py-3 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1 relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                            <Search className="h-4 w-4" />
                        </span>
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder={t("clients.filters.searchPlaceholder", "Search by name, email, institution...")}
                            className="w-full rounded-xl border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent bg-gray-50/50"
                        />
                    </div>

                    <div className="w-full md:w-auto relative min-w-[180px]">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                            <Filter className="h-4 w-4" />
                        </span>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                            className="w-full rounded-xl border border-gray-200 pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent bg-gray-50/50 appearance-none cursor-pointer"
                        >
                            <option value="all">{t("clients.filters.typeAll", "All types")}</option>
                            <option value="individual">{t("clients.filters.typeIndividual", "Individual")}</option>
                            <option value="institution">{t("clients.filters.typeInstitution", "Institution")}</option>
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-400">
                            <ChevronLeft className="h-3 w-3 -rotate-90" />
                        </span>
                    </div>
                </div>

                {/* Table Body */}
                <div className="relative">
                    {loading && clients.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center text-gray-500">
                            <Loader2 className="h-8 w-8 animate-spin text-primary-soft mb-2" />
                            <p className="text-sm">{t("loading", "Loading...")}</p>
                        </div>
                    ) : filteredClients.length === 0 ? (
                        <div className="py-16 text-center px-4">
                            <div className="mx-auto h-12 w-12 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 mb-3">
                                <Users className="h-6 w-6" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">{t("clients.list.empty", "No clients found.")}</h3>
                            <p className="mt-1 text-xs text-gray-500">
                                {t("clients.list.emptyFiltered", "No clients match the current filters.")}
                            </p>
                            {canCrudClients && (
                                <button
                                    type="button"
                                    onClick={handleOpenCreate}
                                    className="mt-4 btn-outline inline-flex items-center gap-2"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    {t("clients.list.newClient", "New client")}
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wide">
                                    <tr>
                                        <th className="px-4 py-3">{t("clients.table.name", "Name")}</th>
                                        <th className="px-4 py-3">{t("clients.table.type", "Type")}</th>
                                        <th className="px-4 py-3">{t("clients.table.contact", "Contact")}</th>
                                        <th className="px-4 py-3">{t("clients.table.institutionOrAddress", "Institution / Address")}</th>
                                        <th className="px-4 py-3 text-right">{t("clients.table.actions", "Actions")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
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
                                            <tr key={client.client_id} className="hover:bg-gray-50/80 transition-colors group">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cx(
                                                            "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                                                            isInstitution ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"
                                                        )}>
                                                            {isInstitution ? <Building2 size={14} /> : <User size={14} />}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-gray-900">{client.name}</div>
                                                            {isInstitution && client.contact_person_name && (
                                                                <div className="text-[10px] text-gray-500">
                                                                    {t("clients.table.pic", "PIC")}: {client.contact_person_name}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span className={cx(
                                                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border",
                                                        isInstitution
                                                            ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                                                            : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                                    )}>
                                                        {isInstitution ? t("clients.badges.institution", "Institution") : t("clients.badges.individual", "Individual")}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                                                    {primaryContact}
                                                </td>

                                                <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={institutionOrAddress}>
                                                    {institutionOrAddress}
                                                </td>

                                                <td className="px-4 py-3 text-right">
                                                    <div className="inline-flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            type="button"
                                                            className="lims-icon-button text-gray-500 hover:text-primary hover:bg-primary/5"
                                                            title={t("clients.actions.view", "View")}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/clients/${toClientSlug(client)}`);
                                                            }}
                                                        >
                                                            <Eye size={14} />
                                                        </button>

                                                        {canCrudClients && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-500 hover:text-amber-600 hover:bg-amber-50"
                                                                    title={t("clients.actions.edit", "Edit")}
                                                                    onClick={(e) => handleOpenEdit(e, client)}
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-500 hover:text-rose-600 hover:bg-rose-50"
                                                                    title={t("clients.actions.delete", "Delete")}
                                                                    onClick={(e) => handleAskDelete(e, client)}
                                                                >
                                                                    <Trash2 size={14} />
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
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {totalClients > 0 && (
                    <div className="border-t border-gray-100 px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gray-50/50">
                        <div className="text-xs text-gray-500">
                            {t("clients.pagination.showing", {
                                from: totalClients === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1,
                                to: Math.min(currentPage * PAGE_SIZE, totalClients),
                                total: totalClients
                            })}
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                                title={t("clients.pagination.previous", "Previous")}
                            >
                                <ChevronLeft size={16} />
                            </button>

                            <div className="flex items-center gap-1 px-1">
                                {getPagination(currentPage, totalPages).map((it, idx) => (
                                    it === "ellipsis" ? (
                                        <span key={`e-${idx}`} className="px-2 text-xs text-gray-400">…</span>
                                    ) : (
                                        <button
                                            key={it}
                                            type="button"
                                            onClick={() => handlePageChange(it)}
                                            className={cx(
                                                "min-w-7 h-7 rounded-lg text-xs font-medium border transition-colors",
                                                it === currentPage
                                                    ? "bg-primary text-white border-primary"
                                                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                                            )}
                                        >
                                            {it}
                                        </button>
                                    )
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                                title={t("clients.pagination.next", "Next")}
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modals */}
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

// Simple loader helper for local usage
function Loader2({ className, size }: { className?: string; size?: number }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size || 24}
            height={size || 24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}