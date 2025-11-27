import { useEffect, useState } from "react";
import { clientService, Client } from "../../services/clients";
import { ClientFormModal } from "../../components/clients/ClientFormModal";

type TypeFilter = "all" | "individual" | "institution";

export const ClientsPage = () => {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

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

        load();
    }, []);

    const handleOpenCreate = () => setIsCreateOpen(true);
    const handleCloseCreate = () => setIsCreateOpen(false);

    const handleCreateSubmit = (values: any) => {
        console.log("Create client (pending API wiring):", values);
        setIsCreateOpen(false);
    };

    // Filtering logic
    const filteredClients = clients.filter((client) => {
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

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 md:px-6 py-4">
                <h1 className="text-lg md:text-xl font-bold text-gray-900">
                    Client Management
                </h1>

                <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="lims-btn-primary"
                >
                    + New client
                </button>
            </div>

            {/* CARD utama */}
            <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">


                {/* Search + filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="client-search">
                            Search clients
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                {/* SVG icon hitam/putih */}
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

                {/* TABLE / STATE */}
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
                                            {filteredClients.map((client) => {
                                                const isInstitution = client.type === "institution";

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
                                                                        PIC: {client.contact_person_name}
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
                                                                {isInstitution ? "Institution" : "Individual"}
                                                            </span>
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700 text-xs md:text-sm max-w-[120px] md:max-w-none truncate">
                                                            {primaryContact}
                                                        </td>

                                                        <td className="px-4 py-3 text-gray-700 text-xs md:text-sm max-w-[140px] md:max-w-none truncate">
                                                            {institutionLabel}
                                                        </td>

                                                        <td className="px-4 py-3 text-right">
                                                            <div className="inline-flex gap-1.5">
                                                                {/* View */}
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-600"
                                                                    aria-label="View client"
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

                                                                {/* Edit */}
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button text-gray-600"
                                                                    aria-label="Edit client"
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

                                                                {/* Delete */}
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button lims-icon-button--danger"
                                                                    aria-label="Delete client"
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

            {/* Modal create client */}
            <ClientFormModal
                open={isCreateOpen}
                mode="create"
                onClose={handleCloseCreate}
                onSubmit={handleCreateSubmit}
            />
        </div>
    );
};
