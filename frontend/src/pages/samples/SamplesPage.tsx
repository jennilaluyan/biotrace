import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { useClients } from "../../hooks/useClients";
import { useSamples } from "../../hooks/useSamples";
import { CreateSampleModal } from "../../components/samples/CreateSampleModal";

import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate } from "../../utils/date";
import type { Sample, SampleStatusEnum } from "../../services/samples";

import { UpdateSampleStatusModal } from "../../components/samples/UpdateSampleStatusModal";

type StatusFilter = "all" | SampleStatusEnum;

export const SamplesPage = () => {
    const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
    const [dateTo, setDateTo] = useState<string>("");     // YYYY-MM-DD

    const navigate = useNavigate();
    const { user } = useAuth();

    const roleIdRaw = getUserRoleId(user);
    const roleId = roleIdRaw ?? ROLE_ID.CLIENT;
    const roleLabel = getUserRoleLabel(user);

    const [createModalOpen, setCreateModalOpen] = useState(false);

    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
    const [reloadTick, setReloadTick] = useState(0);

    const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});

    // Sesuai SamplePolicy::viewAny (backend)
    const canViewSamples = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.LAB_HEAD ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR
        );
    }, [roleId]);

    // Sesuai SamplePolicy::create (backend) -> Administrator only
    const canCreateSample = roleId === ROLE_ID.ADMIN;

    // UI filters
    const [searchTerm, setSearchTerm] = useState("");
    const [clientFilter, setClientFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [page, setPage] = useState(1);

    // dropdown clients
    const { clients, loading: clientsLoading } = useClients();

    // hook list samples (backend pagination)
    const clientIdParam = clientFilter === "all" ? undefined : Number(clientFilter);
    const statusEnumParam =
        statusFilter === "all" ? undefined : (statusFilter as SampleStatusEnum);

    const { items, meta, loading, error } = useSamples({
        page,
        clientId: clientIdParam,
        statusEnum: statusEnumParam,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        reloadTick,
    });

    // Reset ke page 1 saat filter berubah
    useEffect(() => {
        setPage(1);
    }, [clientFilter, statusFilter, dateFrom, dateTo]);

    // Search lokal (backend belum punya param search)
    const visibleItems = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return items;

        return items.filter((s: Sample) => {
            const hay = [
                String(s.sample_id),
                s.sample_type,
                s.client?.name,
                s.client?.email,
                s.current_status,
                s.status_enum,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(term);
        });
    }, [items, searchTerm]);

    // ganti statusLabel/statusBadgeClass jadi begini:

    const statusBadgeClassByEnum = (statusEnum?: SampleStatusEnum) => {
        switch (statusEnum) {
            case "registered":
                return "bg-primary-soft/10 text-primary-soft";
            case "testing":
                return "bg-yellow-100 text-yellow-800";
            case "reported":
                return "bg-green-100 text-green-800";
            default:
                return "bg-gray-100 text-gray-700";
        }
    };

    const statusLabelByCurrent = (current?: Sample["current_status"]) => {
        switch (current) {
            case "received":
                return "Received";
            case "in_progress":
                return "In Progress";
            case "testing_completed":
                return "Testing Completed";
            case "verified":
                return "Verified";
            case "validated":
                return "Validated";
            case "reported":
                return "Reported";
            default:
                return "-";
        }
    };

    const totalPages = meta?.last_page ?? 1;
    const total = meta?.total ?? 0;
    const from = total === 0 ? 0 : (meta!.current_page - 1) * meta!.per_page + 1;
    const to = Math.min(meta?.current_page ? meta.current_page * meta.per_page : 0, total);

    const goToPage = (p: number) => {
        if (p < 1 || p > totalPages) return;
        setPage(p);
    };

    if (!canViewSamples) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not
                    allowed to access the samples module.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <h1 className="text-lg md:text-xl font-bold text-gray-900">
                    Sample Management
                </h1>

                {canCreateSample && (
                    <button
                        type="button"
                        onClick={() => setCreateModalOpen(true)}
                        className="lims-btn-primary self-start md:self-auto"
                    >
                        + New sample
                    </button>
                )}
            </div>

            {/* Card */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    {/* Search */}
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="sample-search">
                            Search samples
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
                                id="sample-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by sample type, client…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Client filter */}
                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="sample-client-filter">
                            Client
                        </label>
                        <select
                            id="sample-client-filter"
                            value={clientFilter}
                            onChange={(e) => setClientFilter(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All clients</option>
                            {clientsLoading ? (
                                <option value="__loading__" disabled>
                                    Loading clients...
                                </option>
                            ) : (
                                (clients ?? []).map((c) => (
                                    <option key={c.client_id} value={String(c.client_id)}>
                                        {c.name}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    {/* Status filter (status_enum backend) */}
                    <div className="w-full md:w-52">
                        <label className="sr-only" htmlFor="sample-status-filter">
                            Status
                        </label>
                        <select
                            id="sample-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All status</option>
                            <option value="registered">Registered</option>
                            <option value="testing">Testing</option>
                            <option value="reported">Reported</option>
                        </select>
                    </div>

                    {/* Date range */}
                    <div className="w-full md:w-44">
                        <label className="sr-only" htmlFor="sample-date-from">
                            From date
                        </label>
                        <input
                            id="sample-date-from"
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        />
                    </div>

                    <div className="w-full md:w-44">
                        <label className="sr-only" htmlFor="sample-date-to">
                            To date
                        </label>
                        <input
                            id="sample-date-to"
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() => {
                            setSearchTerm("");
                            setClientFilter("all");
                            setStatusFilter("all");
                            setDateFrom("");
                            setDateTo("");
                            setPage(1);
                        }}
                        className="w-full md:w-auto rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                        Clear
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 md:px-6 py-4">
                    {loading && (
                        <div className="text-sm text-gray-600">Loading samples...</div>
                    )}

                    {error && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            {visibleItems.length === 0 ? (
                                <div className="text-sm text-gray-600">
                                    No samples found with current filters.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                                <th className="px-4 py-3 text-left">Sample ID</th>
                                                <th className="px-4 py-3 text-left">Client</th>
                                                <th className="px-4 py-3 text-left">Assignee</th>
                                                <th className="px-4 py-3 text-left">Sample type</th>
                                                <th className="px-4 py-3 text-left">Received at</th>
                                                <th className="px-4 py-3 text-left">Status</th>
                                                <th className="px-4 py-3 text-right">Actions</th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {visibleItems.map((s) => (
                                                <tr
                                                    key={s.sample_id}
                                                    className="border-t border-gray-100 hover:bg-gray-50/60"
                                                >
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">#{s.sample_id}</div>
                                                        <div className="text-[11px] text-gray-500">{s.current_status}</div>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">
                                                            {s.client?.name ?? `Client #${s.client_id}`}
                                                        </div>
                                                        {s.client?.email && (
                                                            <div className="text-[11px] text-gray-500">{s.client.email}</div>
                                                        )}
                                                    </td>

                                                    {/* ✅ Assignee */}
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-gray-900">
                                                            {s.assignee?.name ?? "—"}
                                                        </div>
                                                        {s.assignee?.email && (
                                                            <div className="text-[11px] text-gray-500">{s.assignee.email}</div>
                                                        )}
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">{s.sample_type}</td>

                                                    <td className="px-4 py-3 text-gray-700">{formatDate(s.received_at)}</td>

                                                    <td className="px-4 py-3">
                                                        <span
                                                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClassByEnum(
                                                                s.status_enum
                                                            )}`}
                                                        >
                                                            {statusLabelByCurrent(s.current_status)}
                                                        </span>
                                                    </td>

                                                    <td className="px-4 py-3 text-right">
                                                        <div className="inline-flex gap-1.5">
                                                            {/* View */}
                                                            <button
                                                                type="button"
                                                                className="lims-icon-button text-gray-600"
                                                                aria-label="View sample"
                                                                onClick={() => navigate(`/samples/${s.sample_id}`)}
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

                                                            {/* Update status */}
                                                            <button
                                                                type="button"
                                                                className="relative lims-icon-button text-gray-600"
                                                                aria-label="Update status"
                                                                onClick={() => {
                                                                    setSelectedSample(s);
                                                                    setStatusModalOpen(true);
                                                                }}
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
                                                                    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                                                                    <polyline points="21 3 21 9 15 9" />
                                                                </svg>

                                                                {(commentCounts[s.sample_id] ?? 0) > 0 && (
                                                                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-semibold flex items-center justify-center">
                                                                        {commentCounts[s.sample_id]}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>

                                    </table>

                                    {/* Pagination */}
                                    <div className="mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs text-gray-600">
                                        <div>
                                            Showing{" "}
                                            <span className="font-semibold">{from}</span> –{" "}
                                            <span className="font-semibold">{to}</span> of{" "}
                                            <span className="font-semibold">{total}</span> samples
                                        </div>

                                        <div className="flex items-center justify-end gap-1">
                                            <button
                                                type="button"
                                                onClick={() => goToPage(page - 1)}
                                                disabled={page <= 1}
                                                className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                            >
                                                Previous
                                            </button>

                                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                                                (p) => (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => goToPage(p)}
                                                        className={`px-3 py-1 rounded-full text-xs border ${p === page
                                                            ? "bg-primary text-white border-primary"
                                                            : "bg-white text-gray-700 hover:bg-gray-50"
                                                            }`}
                                                    >
                                                        {p}
                                                    </button>
                                                )
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => goToPage(page + 1)}
                                                disabled={page >= totalPages}
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

            <UpdateSampleStatusModal
                open={statusModalOpen}
                onClose={() => setStatusModalOpen(false)}
                sample={selectedSample}
                roleId={roleId ?? ROLE_ID.CLIENT}
                onUpdated={() => setReloadTick((t) => t + 1)}
                onCommentsCountChange={(sampleId, count) =>
                    setCommentCounts((prev) => ({ ...prev, [sampleId]: count }))
                }
            />

            <CreateSampleModal
                open={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                clients={clients ?? []}
                clientsLoading={clientsLoading}
                onCreated={() => setReloadTick((t) => t + 1)}
            />
        </div>
    );
};
