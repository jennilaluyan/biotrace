import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { clientService, Client } from "../../services/clients";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate, formatDateOnly } from "../../utils/date";
import { clientIdFromSlug, toClientSlug } from "../../utils/slug";


export const ClientDetailPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewClients =
        roleId === ROLE_ID.ADMIN ||
        roleId === ROLE_ID.LAB_HEAD ||
        roleId === ROLE_ID.OPERATIONAL_MANAGER;

    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const numericId = clientIdFromSlug(slug);

    useEffect(() => {
        const load = async () => {
            if (!canViewClients) {
                setLoading(false);
                return;
            }

            if (!numericId) {
                setError("Invalid client URL.");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                const data = await clientService.getById(numericId);
                setClient(data);

                // Optional: perbaiki URL kalau slug di URL tidak “kanonis”
                const canonical = toClientSlug(data);
                if (slug !== canonical) {
                    navigate(`/clients/${canonical}`, { replace: true });
                }
            } catch (err: any) {
                const msg =
                    err?.data?.message ??
                    err?.data?.error ??
                    "Failed to load client detail.";
                setError(msg);
            } finally {
                setLoading(false);
            }
        };

        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numericId, canViewClients, slug, navigate]);

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
                <Link to="/clients" className="mt-4 lims-btn-primary">
                    Back to clients
                </Link>
            </div>
        );
    }

    const initials = client?.name
        ? client.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("")
        : "C";

    return (
        <div className="min-h-[60vh]">
            {/* Breadcrumb */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <span className="lims-breadcrumb-icon">
                        <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M4 12h9" />
                            <path d="M11 9l3 3-3 3" />
                            <path d="M4 6v12" />
                        </svg>
                    </span>

                    <Link to="/clients" className="lims-breadcrumb-link">
                        Clients
                    </Link>

                    <span className="lims-breadcrumb-separator">›</span>

                    <span className="lims-breadcrumb-current">
                        Client Detail
                    </span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {loading && (
                    <div className="text-sm text-gray-600">
                        Loading client detail...
                    </div>
                )}

                {error && !loading && (
                    <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                        {error}
                    </div>
                )}

                {!loading && !error && client && (
                    <div className="space-y-8">
                        {/* HERO: left identity card + right info overview */}
                        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
                            {/* Left: profile / identity */}
                            <div className="flex-1 lg:max-w-sm">
                                <div className="bg-gray-50 rounded-2xl px-5 py-6 border border-gray-100">
                                    <div className="flex items-center gap-4">
                                        <div className="h-16 w-16 rounded-full bg-linear-to-br from-primary to-primary-soft flex items-center justify-center text-white text-xl font-semibold shadow-sm">
                                            {initials}
                                        </div>
                                        <div>
                                            <h2 className="text-lg font-semibold text-gray-900">
                                                {client.name}
                                            </h2>
                                            <p className="text-xs text-gray-500">
                                                {client.type === "institution"
                                                    ? "Institutional client"
                                                    : "Individual client"}
                                            </p>
                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                <span
                                                    className={
                                                        client.type === "institution"
                                                            ? "lims-badge-institution"
                                                            : "lims-badge-individual"
                                                    }
                                                >
                                                    {client.type === "institution"
                                                        ? "Institution"
                                                        : "Individual"}
                                                </span>
                                                <span className="text-[11px] text-gray-500">
                                                    Client ID: #{client.client_id}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 space-y-3 text-sm">
                                        {client.phone && (
                                            <div className="flex items-start gap-3">
                                                <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-500">
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        className="h-4 w-4"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="1.8"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.22 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="lims-detail-label">
                                                        Phone
                                                    </div>
                                                    <div className="lims-detail-value">
                                                        {client.phone}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {client.email && (
                                            <div className="flex items-start gap-3">
                                                <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-500">
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        className="h-4 w-4"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="1.8"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2z" />
                                                        <polyline points="22,6 12,13 2,6" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <div className="lims-detail-label">
                                                        Email
                                                    </div>
                                                    <div className="lims-detail-value break-all">
                                                        {client.email}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {(client.address_domicile ||
                                            client.address_ktp) && (
                                                <div className="flex items-start gap-3">
                                                    <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-500">
                                                        <svg
                                                            viewBox="0 0 24 24"
                                                            className="h-4 w-4"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.8"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
                                                            <circle cx="12" cy="10" r="3" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <div className="lims-detail-label">
                                                            Address
                                                        </div>
                                                        <div className="lims-detail-value space-y-1">
                                                            {client.address_domicile && (
                                                                <p>
                                                                    <span className="text-[11px] text-gray-500">
                                                                        Domicile
                                                                    </span>
                                                                    <br />
                                                                    {client.address_domicile}
                                                                </p>
                                                            )}
                                                            {client.address_ktp && (
                                                                <p>
                                                                    <span className="text-[11px] text-gray-500">
                                                                        KTP address
                                                                    </span>
                                                                    <br />
                                                                    {client.address_ktp}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                    </div>
                                </div>
                            </div>

                            {/* Right: basic/company/personal info */}
                            <div className="flex-2 space-y-4">
                                {/* Basic Info card */}
                                <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
                                    <h3 className="lims-detail-section-title mb-3">
                                        Basic Information
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <div className="lims-detail-label">
                                                Client type
                                            </div>
                                            <div className="lims-detail-value">
                                                {client.type === "institution"
                                                    ? "Institution"
                                                    : "Individual"}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">
                                                Client ID
                                            </div>
                                            <div className="lims-detail-value">
                                                #{client.client_id}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">
                                                Created at
                                            </div>
                                            <div className="lims-detail-value">
                                                {formatDate(client.created_at)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">
                                                Last updated
                                            </div>
                                            <div className="lims-detail-value">
                                                {formatDate(client.updated_at)}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Conditional: Individual vs Institution card */}
                                {client.type === "individual" ? (
                                    <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
                                        <h3 className="lims-detail-section-title mb-3">
                                            Personal Profile
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <div className="lims-detail-label">
                                                    National ID (NIK)
                                                </div>
                                                <div className="lims-detail-value">
                                                    {client.national_id || "-"}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">
                                                    Date of birth
                                                </div>
                                                <div className="lims-detail-value">
                                                    {client.date_of_birth ? formatDateOnly(client.date_of_birth) : "-"}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">
                                                    Gender
                                                </div>
                                                <div className="lims-detail-value">
                                                    {client.gender || "-"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
                                        <h3 className="lims-detail-section-title mb-3">
                                            Institution Information
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <div className="lims-detail-label">
                                                    Institution name
                                                </div>
                                                <div className="lims-detail-value">
                                                    {client.institution_name || "-"}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">
                                                    Institution address
                                                </div>
                                                <div className="lims-detail-value">
                                                    {client.institution_address || "-"}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">
                                                    Contact person
                                                </div>
                                                <div className="lims-detail-value">
                                                    {client.contact_person_name || "-"}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">
                                                    Contact person phone / email
                                                </div>
                                                <div className="lims-detail-value">
                                                    {client.contact_person_phone || "-"}
                                                    {client.contact_person_email
                                                        ? ` • ${client.contact_person_email}`
                                                        : ""}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
