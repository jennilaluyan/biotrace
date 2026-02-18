import { useEffect, useMemo, useRef, useState } from "react";
import {
    Search,
    RefreshCw,
    UserCheck,
    UserX,
    X,
    AlertTriangle,
    Building2,
    User,
    Mail,
    Phone,
    MapPin,
    BadgeCheck,
} from "lucide-react";

import { clientApprovalsService, type ClientApplication } from "../../services/clientApprovals";
import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";

type TypeFilter = "all" | "individual" | "institution";

type ModalMode = "approve" | "reject";
type ModalState =
    | { open: false }
    | { open: true; mode: ModalMode; item: ClientApplication };

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function typeLabel(t: ClientApplication["type"]) {
    return t === "institution" ? "Institution" : "Individual";
}

function typeIcon(t: ClientApplication["type"]) {
    return t === "institution" ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />;
}

function primaryContact(c: ClientApplication) {
    return c.email || c.phone || c.contact_person_email || c.contact_person_phone || "-";
}

function detailsText(c: ClientApplication) {
    if (c.type === "institution") return c.institution_name || "-";
    if (c.national_id) return `NIK: ${c.national_id}`;
    return c.address_domicile || c.address_ktp || "-";
}

export const ClientApprovalsPage = () => {
    const { user } = useAuth();
    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    const canApproveClients = roleId === ROLE_ID.ADMIN;

    const [items, setItems] = useState<ClientApplication[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

    const [modal, setModal] = useState<ModalState>({ open: false });
    const [actionLoading, setActionLoading] = useState(false);
    const [rejectReason, setRejectReason] = useState("");

    const firstActionRef = useRef<HTMLButtonElement | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await clientApprovalsService.listPending();
            setItems(data);
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Failed to load pending client applications.");
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

    useEffect(() => {
        if (modal.open) {
            // lightweight focus management for better accessibility
            const t = window.setTimeout(() => firstActionRef.current?.focus(), 0);
            return () => window.clearTimeout(t);
        }
    }, [modal.open]);

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
                c.contact_person_phone,
                c.address_ktp,
                c.address_domicile,
                c.national_id,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return haystack.includes(term);
        });
    }, [items, searchTerm, typeFilter]);

    const openApprove = (item: ClientApplication) => {
        setError(null);
        setRejectReason("");
        setModal({ open: true, mode: "approve", item });
    };

    const openReject = (item: ClientApplication) => {
        setError(null);
        setRejectReason("");
        setModal({ open: true, mode: "reject", item });
    };

    const closeModal = () => {
        if (actionLoading) return;
        setModal({ open: false });
        setRejectReason("");
    };

    const confirmModalAction = async () => {
        if (!modal.open) return;

        try {
            setActionLoading(true);
            setError(null);

            if (modal.mode === "approve") {
                await clientApprovalsService.approve(modal.item.client_application_id);
            } else {
                const reason = rejectReason.trim() ? rejectReason.trim() : undefined;
                await clientApprovalsService.reject(modal.item.client_application_id, reason);
            }

            await load();
            closeModal();
        } catch (err: any) {
            setError(err?.data?.message ?? err?.data?.error ?? "Action failed. Please try again.");
        } finally {
            setActionLoading(false);
        }
    };

    if (!canApproveClients) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to approve clients.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Page header */}
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Client approvals</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Review new client registrations. Approving creates an active client account.
                    </p>
                </div>

                <div className="flex items-center gap-2 self-start md:self-auto">
                    <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 inline-flex items-center gap-2">
                        <BadgeCheck className="h-4 w-4 text-gray-500" />
                        <span>
                            Pending: <span className="font-semibold text-gray-900">{filtered.length}</span>
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={load}
                        className="btn-outline inline-flex items-center gap-2"
                        disabled={loading}
                    >
                        <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filters */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="pending-client-search">
                            Search pending clients
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search className="h-4 w-4" />
                            </span>
                            <input
                                id="pending-client-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search name, email, phone, institution…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="pending-client-type-filter">
                            Client type
                        </label>
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

                {/* Body */}
                <div className="px-4 md:px-6 py-4">
                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-sm text-gray-600">Loading pending applications…</div>
                    ) : filtered.length === 0 ? (
                        <div className="py-10 text-center">
                            <div className="mx-auto h-10 w-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-600">
                                <BadgeCheck className="h-5 w-5" />
                            </div>
                            <div className="mt-3 text-sm font-semibold text-gray-900">No pending applications</div>
                            <div className="mt-1 text-xs text-gray-500">
                                New client registrations will appear here for review.
                            </div>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead className="bg-gray-50">
                                    <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                        <th className="px-4 py-3 text-left">Applicant</th>
                                        <th className="px-4 py-3 text-left">Type</th>
                                        <th className="px-4 py-3 text-left">Contact</th>
                                        <th className="px-4 py-3 text-left">Details</th>
                                        <th className="px-4 py-3 text-right">Actions</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {filtered.map((c) => {
                                        const isInstitution = c.type === "institution";
                                        return (
                                            <tr
                                                key={c.client_application_id}
                                                className="border-t border-gray-100 hover:bg-gray-50/60"
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900">{c.name}</div>
                                                    <div className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                                                        <span className="inline-flex items-center gap-1">
                                                            <BadgeCheck className="h-3.5 w-3.5" />
                                                            Pending review
                                                        </span>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span className={isInstitution ? "lims-badge-institution" : "lims-badge-individual"}>
                                                        <span className="inline-flex items-center gap-1.5">
                                                            {typeIcon(c.type)}
                                                            {typeLabel(c.type)}
                                                        </span>
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">
                                                    <div className="space-y-1">
                                                        {c.email && (
                                                            <div className="inline-flex items-center gap-2">
                                                                <Mail className="h-4 w-4 text-gray-500" />
                                                                <span className="break-all">{c.email}</span>
                                                            </div>
                                                        )}
                                                        {c.phone && (
                                                            <div className="inline-flex items-center gap-2">
                                                                <Phone className="h-4 w-4 text-gray-500" />
                                                                <span>{c.phone}</span>
                                                            </div>
                                                        )}
                                                        {!c.email && !c.phone && <span>{primaryContact(c)}</span>}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 text-gray-700">
                                                    <div className="space-y-1">
                                                        {c.type === "institution" ? (
                                                            <>
                                                                <div className="inline-flex items-center gap-2">
                                                                    <Building2 className="h-4 w-4 text-gray-500" />
                                                                    <span className="font-medium text-gray-900">
                                                                        {c.institution_name || "-"}
                                                                    </span>
                                                                </div>
                                                                {(c.contact_person_name || c.contact_person_email || c.contact_person_phone) && (
                                                                    <div className="text-xs text-gray-600">
                                                                        PIC:{" "}
                                                                        <span className="font-medium text-gray-900">
                                                                            {c.contact_person_name || "-"}
                                                                        </span>
                                                                        {(c.contact_person_email || c.contact_person_phone) && (
                                                                            <span className="text-gray-500">
                                                                                {" "}
                                                                                • {c.contact_person_email || c.contact_person_phone}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                {c.national_id ? (
                                                                    <div className="text-xs text-gray-700">NIK: {c.national_id}</div>
                                                                ) : (
                                                                    <div className="inline-flex items-start gap-2">
                                                                        <MapPin className="h-4 w-4 text-gray-500 mt-0.5" />
                                                                        <span className="text-xs">{detailsText(c)}</span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 text-right">
                                                    <div className="inline-flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            className="lims-btn-primary inline-flex items-center gap-2"
                                                            onClick={() => openApprove(c)}
                                                        >
                                                            <UserCheck className="h-4 w-4" />
                                                            Approve
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className="lims-btn-danger inline-flex items-center gap-2"
                                                            onClick={() => openReject(c)}
                                                        >
                                                            <UserX className="h-4 w-4" />
                                                            Reject
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
                </div>
            </div>

            {/* Action modal */}
            {modal.open && (
                <div className="lims-modal-backdrop">
                    <div className="lims-modal-panel">
                        <div className="lims-modal-header">
                            <div
                                className={cx(
                                    "h-9 w-9 flex items-center justify-center rounded-full",
                                    modal.mode === "approve" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                                )}
                            >
                                {modal.mode === "approve" ? <UserCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
                            </div>

                            <div className="min-w-0">
                                <h2 className="text-base font-semibold text-gray-900">
                                    {modal.mode === "approve" ? "Approve client application?" : "Reject client application?"}
                                </h2>
                                <p className="text-xs text-gray-500">
                                    {modal.mode === "approve"
                                        ? "This will create an active client account and enable log in."
                                        : "Rejected applications stay in the audit trail for traceability."}
                                </p>
                            </div>

                            <button
                                type="button"
                                className="ml-auto lims-icon-button text-gray-600"
                                onClick={closeModal}
                                aria-label="Close modal"
                                disabled={actionLoading}
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="lims-modal-body">
                            <div className="text-sm text-gray-800">
                                <div className="font-semibold text-gray-900 truncate">{modal.item.name}</div>
                                <div className="text-xs text-gray-500 mt-1 inline-flex items-center gap-2">
                                    <span className={modal.item.type === "institution" ? "lims-badge-institution" : "lims-badge-individual"}>
                                        {typeLabel(modal.item.type)}
                                    </span>
                                    <span className="truncate">
                                        {modal.item.type === "institution" ? modal.item.institution_name || "-" : modal.item.email || modal.item.phone || "-"}
                                    </span>
                                </div>
                            </div>

                            {modal.mode === "reject" && (
                                <div className="mt-4">
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Rejection reason <span className="text-gray-400">(optional)</span>
                                    </label>
                                    <textarea
                                        value={rejectReason}
                                        onChange={(e) => setRejectReason(e.target.value)}
                                        placeholder="Add a short, specific reason to help the applicant fix it…"
                                        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent min-h-[88px]"
                                        disabled={actionLoading}
                                    />
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        Tip: mention what’s missing (e.g., invalid NIK, incomplete institution PIC, mismatched email).
                                    </p>
                                </div>
                            )}

                            {error && (
                                <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
                                    {error}
                                </div>
                            )}
                        </div>

                        <div className="lims-modal-footer">
                            <button
                                type="button"
                                className="btn-outline"
                                onClick={closeModal}
                                disabled={actionLoading}
                                ref={firstActionRef}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                className={cx(
                                    "inline-flex items-center gap-2",
                                    modal.mode === "approve" ? "lims-btn-primary" : "lims-btn-danger"
                                )}
                                onClick={confirmModalAction}
                                disabled={actionLoading}
                            >
                                {actionLoading ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                        Processing…
                                    </>
                                ) : modal.mode === "approve" ? (
                                    <>
                                        <UserCheck className="h-4 w-4" />
                                        Approve
                                    </>
                                ) : (
                                    <>
                                        <UserX className="h-4 w-4" />
                                        Reject
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
