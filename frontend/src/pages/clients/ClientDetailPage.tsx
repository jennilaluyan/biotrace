import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Calendar, Hash, Mail, MapPin, Phone, User } from "lucide-react";

import { clientService, Client } from "../../services/clients";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate, formatDateOnly } from "../../utils/date";
import { clientIdFromSlug, toClientSlug } from "../../utils/slug";

function initialsFromName(name?: string | null) {
    if (!name) return "C";
    const parts = name.split(" ").filter(Boolean);
    const a = parts[0]?.[0]?.toUpperCase() ?? "C";
    const b = parts[1]?.[0]?.toUpperCase() ?? "";
    return `${a}${b}` || "C";
}

export const ClientDetailPage = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canViewClients =
        roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.LAB_HEAD || roleId === ROLE_ID.OPERATIONAL_MANAGER;

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

                const canonical = toClientSlug(data);
                if (slug !== canonical) {
                    navigate(`/clients/${canonical}`, { replace: true });
                }
            } catch (err: any) {
                setError(err?.data?.message ?? err?.data?.error ?? "Failed to load client details.");
            } finally {
                setLoading(false);
            }
        };

        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numericId, canViewClients, slug, navigate]);

    const initials = useMemo(() => initialsFromName(client?.name), [client?.name]);

    if (!canViewClients) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to access the clients
                    module.
                </p>
                <Link to="/clients" className="mt-4 lims-btn-primary inline-flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back to clients
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Top nav */}
            <div className="px-0 py-2 flex items-center justify-between gap-3">
                <Link to="/clients" className="btn-outline inline-flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                </Link>
            </div>

            <div className="lims-detail-shell">
                {loading && <div className="text-sm text-gray-600">Loading client details…</div>}

                {error && !loading && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">
                        {error}
                    </div>
                )}

                {!loading && !error && client && (
                    <div className="space-y-8">
                        {/* HERO */}
                        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
                            {/* Left: Identity */}
                            <div className="w-full lg:max-w-sm">
                                <div className="bg-gray-50 rounded-2xl px-5 py-6 border border-gray-100">
                                    <div className="flex items-center gap-4">
                                        <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary-soft flex items-center justify-center text-white text-xl font-semibold shadow-sm">
                                            {initials}
                                        </div>

                                        <div className="min-w-0">
                                            <h2 className="text-lg font-semibold text-gray-900 truncate">{client.name}</h2>
                                            <p className="text-xs text-gray-500">
                                                {client.type === "institution" ? "Institutional client" : "Individual client"}
                                            </p>

                                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                                                <span
                                                    className={client.type === "institution" ? "lims-badge-institution" : "lims-badge-individual"}
                                                >
                                                    {client.type === "institution" ? "Institution" : "Individual"}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                                                    <Hash className="h-3.5 w-3.5" />
                                                    Client ID: #{client.client_id}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 space-y-3 text-sm">
                                        {client.phone && (
                                            <div className="flex items-start gap-3">
                                                <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-500">
                                                    <Phone className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="lims-detail-label">Phone</div>
                                                    <div className="lims-detail-value">{client.phone}</div>
                                                </div>
                                            </div>
                                        )}

                                        {client.email && (
                                            <div className="flex items-start gap-3">
                                                <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-500">
                                                    <Mail className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="lims-detail-label">Email</div>
                                                    <div className="lims-detail-value break-all">{client.email}</div>
                                                </div>
                                            </div>
                                        )}

                                        {(client.address_domicile || client.address_ktp) && (
                                            <div className="flex items-start gap-3">
                                                <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center shadow-sm text-gray-500">
                                                    <MapPin className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="lims-detail-label">Address</div>
                                                    <div className="lims-detail-value space-y-1">
                                                        {client.address_domicile && (
                                                            <p>
                                                                <span className="text-[11px] text-gray-500">Domicile</span>
                                                                <br />
                                                                {client.address_domicile}
                                                            </p>
                                                        )}
                                                        {client.address_ktp && (
                                                            <p>
                                                                <span className="text-[11px] text-gray-500">KTP address</span>
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

                            {/* Right: Cards */}
                            <div className="flex-1 space-y-4">
                                <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
                                    <h3 className="lims-detail-section-title mb-3">Basic information</h3>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <div className="lims-detail-label">Client type</div>
                                            <div className="lims-detail-value">
                                                {client.type === "institution" ? "Institution" : "Individual"}
                                            </div>
                                        </div>

                                        <div>
                                            <div className="lims-detail-label">Client ID</div>
                                            <div className="lims-detail-value">#{client.client_id}</div>
                                        </div>

                                        <div>
                                            <div className="lims-detail-label inline-flex items-center gap-2">
                                                <Calendar className="h-4 w-4 text-gray-500" />
                                                Created
                                            </div>
                                            <div className="lims-detail-value">{formatDate(client.created_at)}</div>
                                        </div>

                                        <div>
                                            <div className="lims-detail-label">Last updated</div>
                                            <div className="lims-detail-value">{formatDate(client.updated_at)}</div>
                                        </div>
                                    </div>
                                </div>

                                {client.type === "individual" ? (
                                    <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
                                        <h3 className="lims-detail-section-title mb-3 inline-flex items-center gap-2">
                                            <User className="h-4 w-4 text-gray-500" />
                                            Personal profile
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <div className="lims-detail-label">National ID (NIK)</div>
                                                <div className="lims-detail-value">{client.national_id || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">Date of birth</div>
                                                <div className="lims-detail-value">
                                                    {client.date_of_birth ? formatDateOnly(client.date_of_birth) : "-"}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">Gender</div>
                                                <div className="lims-detail-value">{client.gender || "-"}</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
                                        <h3 className="lims-detail-section-title mb-3 inline-flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-gray-500" />
                                            Institution information
                                        </h3>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                            <div>
                                                <div className="lims-detail-label">Institution name</div>
                                                <div className="lims-detail-value">{client.institution_name || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">Institution address</div>
                                                <div className="lims-detail-value">{client.institution_address || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">Contact person</div>
                                                <div className="lims-detail-value">{client.contact_person_name || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">Contact person phone / email</div>
                                                <div className="lims-detail-value">
                                                    {client.contact_person_phone || "-"}
                                                    {client.contact_person_email ? ` • ${client.contact_person_email}` : ""}
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
