import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    ArrowLeft,
    Building2,
    Calendar,
    Hash,
    Mail,
    MapPin,
    Phone,
    User,
    ShieldAlert,
    RefreshCw
} from "lucide-react";

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

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export const ClientDetailPage = () => {
    const { t } = useTranslation();
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

    const load = async () => {
        if (!canViewClients) {
            setLoading(false);
            return;
        }

        if (!numericId) {
            setError(t("clients.detail.invalidUrl", "Invalid client URL."));
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
            setError(err?.data?.message ?? err?.data?.error ?? t("clients.detail.loadFailed", "Failed to load client details."));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numericId, canViewClients, slug, navigate]);

    const initials = useMemo(() => initialsFromName(client?.name), [client?.name]);

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
                <Link to="/clients" className="mt-4 lims-btn-primary inline-flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    {t("clients.forbidden.backToClients", "Back to clients")}
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh] pb-20">
            {/* Top nav */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <Link to="/clients" className="lims-breadcrumb-link inline-flex items-center gap-2">
                        <ArrowLeft size={16} />
                        {t("clients.detail.breadcrumbClients", "Clients")}
                    </Link>
                    <span className="lims-breadcrumb-separator">›</span>
                    <span className="lims-breadcrumb-current">{t("clients.detail.breadcrumbCurrent", "Client detail")}</span>
                </nav>
            </div>

            <div className="lims-detail-shell mt-2">
                {loading && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 py-10 justify-center">
                        <RefreshCw className="animate-spin h-4 w-4" />
                        {t("loading", "Loading...")}
                    </div>
                )}

                {error && !loading && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-4 py-3 rounded-xl mb-4 flex items-start gap-2">
                        <ShieldAlert className="h-5 w-5 shrink-0" />
                        {error}
                    </div>
                )}

                {!loading && !error && client && (
                    <div className="space-y-8">
                        {/* HERO SECTION */}
                        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
                            {/* Left: Identity Card */}
                            <div className="w-full lg:w-1/3 bg-gray-50/50 rounded-2xl p-5 border border-gray-100 flex flex-col items-center text-center">
                                <div className="h-20 w-20 rounded-full bg-linear-to-br from-primary to-primary-soft flex items-center justify-center text-white text-2xl font-bold shadow-md mb-3">
                                    {initials}
                                </div>

                                <h2 className="text-xl font-bold text-gray-900 wrap-break-word w-full px-2">{client.name}</h2>
                                <p className="text-xs text-gray-500 mb-3">
                                    {client.type === "institution" ? t("clients.detail.type.institutionalClient", "Institutional client") : t("clients.detail.type.individualClient", "Individual client")}
                                </p>

                                <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
                                    <span className={cx(
                                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                                        client.type === "institution"
                                            ? "bg-indigo-50 text-indigo-700 border-indigo-100"
                                            : "bg-emerald-50 text-emerald-700 border-emerald-100"
                                    )}>
                                        {client.type === "institution" ? t("clients.badges.institution", "Institution") : t("clients.badges.individual", "Individual")}
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                                        <Hash className="h-3 w-3" />
                                        #{client.client_id}
                                    </span>
                                </div>

                                <div className="w-full space-y-3 text-sm text-left bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                                    {client.phone && (
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                                                <Phone className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{t("clients.detail.labels.phone", "Phone")}</div>
                                                <div className="font-medium text-gray-900 truncate">{client.phone}</div>
                                            </div>
                                        </div>
                                    )}

                                    {client.email && (
                                        <div className="flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                                                <Mail className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{t("clients.detail.labels.email", "Email")}</div>
                                                <div className="font-medium text-gray-900 break-all">{client.email}</div>
                                            </div>
                                        </div>
                                    )}

                                    {(client.address_domicile || client.address_ktp) && (
                                        <div className="flex items-start gap-3">
                                            <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                                                <MapPin className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1 space-y-2">
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wider">{t("clients.detail.labels.address", "Address")}</div>
                                                {client.address_domicile && (
                                                    <div>
                                                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 rounded mr-1">{t("clients.detail.labels.domicile", "Domicile")}</span>
                                                        <span className="text-gray-900">{client.address_domicile}</span>
                                                    </div>
                                                )}
                                                {client.address_ktp && (
                                                    <div>
                                                        <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 rounded mr-1">{t("clients.detail.labels.ktp", "KTP")}</span>
                                                        <span className="text-gray-900">{client.address_ktp}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: Details Grid */}
                            <div className="flex-1 w-full space-y-6">
                                {/* Basic Info */}
                                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                                    <h3 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-50">
                                        {t("clients.detail.basicTitle", "Basic information")}
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                        <div>
                                            <div className="lims-detail-label">{t("clients.detail.labels.clientType", "Client type")}</div>
                                            <div className="lims-detail-value">
                                                {client.type === "institution" ? t("clients.badges.institution", "Institution") : t("clients.badges.individual", "Individual")}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">{t("clients.detail.labels.clientId", "Client ID")}</div>
                                            <div className="lims-detail-value font-mono">#{client.client_id}</div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label inline-flex items-center gap-1">
                                                <Calendar className="h-3 w-3" /> {t("clients.detail.labels.createdAt", "Created at")}
                                            </div>
                                            <div className="lims-detail-value">{formatDate(client.created_at)}</div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">{t("clients.detail.labels.updatedAt", "Last updated")}</div>
                                            <div className="lims-detail-value">{formatDate(client.updated_at)}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Conditional Info */}
                                {client.type === "individual" ? (
                                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-50 flex items-center gap-2">
                                            <User className="h-4 w-4 text-gray-400" />
                                            {t("clients.detail.personalTitle", "Personal profile")}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.nationalId", "National ID (NIK)")}</div>
                                                <div className="lims-detail-value font-mono">{client.national_id || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.dob", "Date of birth")}</div>
                                                <div className="lims-detail-value">{client.date_of_birth ? formatDateOnly(client.date_of_birth) : "-"}</div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.gender", "Gender")}</div>
                                                <div className="lims-detail-value">{client.gender || "-"}</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-900 mb-4 pb-2 border-b border-gray-50 flex items-center gap-2">
                                            <Building2 className="h-4 w-4 text-gray-400" />
                                            {t("clients.detail.institutionTitle", "Institution information")}
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                                            <div className="md:col-span-2">
                                                <div className="lims-detail-label">{t("clients.detail.labels.institutionName", "Institution name")}</div>
                                                <div className="lims-detail-value font-semibold">{client.institution_name || "-"}</div>
                                            </div>
                                            <div className="md:col-span-2">
                                                <div className="lims-detail-label">{t("clients.detail.labels.institutionAddress", "Institution address")}</div>
                                                <div className="lims-detail-value">{client.institution_address || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.contactPerson", "Contact person")}</div>
                                                <div className="lims-detail-value">{client.contact_person_name || "-"}</div>
                                            </div>
                                            <div>
                                                <div className="lims-detail-label">{t("clients.detail.labels.contactPersonContact", "Contact person phone / email")}</div>
                                                <div className="lims-detail-value">
                                                    {client.contact_person_phone || "-"}
                                                    {client.contact_person_email ? <span className="text-gray-400 mx-1">•</span> : null}
                                                    {client.contact_person_email}
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