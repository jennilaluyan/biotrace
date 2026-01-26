import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { useClients } from "../../hooks/useClients";
import { useSamples } from "../../hooks/useSamples";

import { CreateSampleModal } from "../../components/samples/CreateSampleModal";
import { UpdateSampleStatusModal } from "../../components/samples/UpdateSampleStatusModal";

import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate } from "../../utils/date";

import type { Sample, SampleStatusEnum } from "../../services/samples";

type StatusFilter = "all" | SampleStatusEnum;

export const SamplesPage = () => {
    const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
    const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD

    const navigate = useNavigate();

    const { user } = useAuth();
    const roleId = getUserRoleId(user) ?? ROLE_ID.CLIENT;
    const roleLabel = getUserRoleLabel(user);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [statusModalOpen, setStatusModalOpen] = useState(false);
    const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
    const [reloadTick, setReloadTick] = useState(0);

    const [commentCounts, setCommentCounts] = useState<Record<number, number>>(
        {}
    );

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
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [clientFilter, setClientFilter] = useState<string>("all");
    const [page, setPage] = useState(1);

    const { clients, loading: clientsLoading } = useClients();

    const clientIdParam =
        clientFilter === "all" ? undefined : Number(clientFilter);
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

    // Reset page saat filter berubah
    useEffect(() => {
        setPage(1);
    }, [clientFilter, statusFilter, dateFrom, dateTo]);

    /**
     * ✅ STEP 6 (F1):
     * SamplesPage = hanya "Lab Samples" (yang SUDAH punya lab_sample_code).
     * Sample Requests harusnya ada di /samples/requests.
     */
    const labOnlyItems = useMemo(() => {
        return (items ?? []).filter((s: Sample) => !!s.lab_sample_code);
    }, [items]);

    const visibleItems = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return labOnlyItems;

        return labOnlyItems.filter((s: Sample) => {
            const hay = [
                String(s.sample_id),
                s.lab_sample_code,
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
    }, [labOnlyItems, searchTerm]);

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
    const from =
        total === 0 ? 0 : (meta!.current_page - 1) * meta!.per_page + 1;
    const to = Math.min(
        meta?.current_page ? meta.current_page * meta.per_page : 0,
        total
    );

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

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
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
                                placeholder="Search by sample type, code, client…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

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

                    <div className="w-full md:w-52">
                        <label className="sr-only" htmlFor="sample-status-filter">
                            Status
                        </label>
                        <select
                            id="sample-status-filter"
                            value={statusFilter}
                            onChange={(e) =>
                                setStatusFilter(e.target.value as StatusFilter)
                            }
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All status</option>
                            <option value="registered">Registered</option>
                            <option value="testing">Testing</option>
                            <option value="reported">Reported</option>
                        </select>
                    </div>

                    <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
                        <div className="w-full sm:w-40">
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
                        <div className="w-full sm:w-40">
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
                    </div>

                    <div className="w-full md:w-auto flex justify-start md:justify-end">
                        <button
                            type="button"
                            className="lims-btn"
                            onClick={() => setReloadTick((t) => t + 1)}
                        >
                            Refresh
                        </button>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                            {error}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-sm text-gray-600">Loading samples…</div>
                    ) : visibleItems.length === 0 ? (
                        <div className="text-sm text-gray-600">No lab samples found.</div>
                    ) : (
                        <>
                            <div className="text-xs text-gray-600 mb-3">
                                Showing <span className="font-semibold">{from}</span> to{" "}
                                <span className="font-semibold">{to}</span> of{" "}
                                <span className="font-semibold">{total}</span> (lab samples
                                only).
                            </div>

                            <div className="overflow-x-auto rounded-xl border border-gray-200">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-50 text-gray-700">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">
                                                Sample ID
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                Lab Code
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                Sample Type
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                Client
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                Status
                                            </th>
                                            <th className="text-left font-semibold px-4 py-3">
                                                Received
                                            </th>
                                            <th className="text-right font-semibold px-4 py-3">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {visibleItems.map((s) => {
                                            const badgeClass = statusBadgeClassByEnum(s.status_enum);
                                            const statusLabel = statusLabelByCurrent(s.current_status);

                                            const commentCount = commentCounts[s.sample_id] ?? 0;

                                            return (
                                                <tr key={s.sample_id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-900 font-semibold">
                                                        {s.sample_id}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-900">
                                                        {s.lab_sample_code ?? "-"}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {s.sample_type ?? "-"}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">
                                                                {s.client?.name ?? "-"}
                                                            </span>
                                                            <span className="text-xs text-gray-500">
                                                                {s.client?.email ?? "-"}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex flex-col gap-1">
                                                            <span
                                                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badgeClass}`}
                                                            >
                                                                {s.status_enum ?? "-"}
                                                            </span>
                                                            <span className="text-xs text-gray-500">
                                                                {statusLabel}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">
                                                        {s.received_at ? formatDate(s.received_at) : "-"}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                className="lims-btn"
                                                                onClick={() => navigate(`/samples/${s.sample_id}`)}
                                                            >
                                                                View
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="lims-btn"
                                                                onClick={() => {
                                                                    setSelectedSample(s);
                                                                    setStatusModalOpen(true);
                                                                }}
                                                            >
                                                                Update status{" "}
                                                                {commentCount > 0 ? (
                                                                    <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-semibold">
                                                                        {commentCount}
                                                                    </span>
                                                                ) : null}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    Page{" "}
                                    <span className="font-semibold">{meta?.current_page ?? 1}</span>{" "}
                                    of <span className="font-semibold">{totalPages}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => goToPage((meta?.current_page ?? 1) - 1)}
                                        disabled={(meta?.current_page ?? 1) <= 1}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    >
                                        Prev
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => goToPage((meta?.current_page ?? 1) + 1)}
                                        disabled={(meta?.current_page ?? 1) >= totalPages}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ✅ FIX: CreateSampleModal requires clients */}
            <CreateSampleModal
                open={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                clients={clients ?? []}
                clientsLoading={clientsLoading}
                onCreated={() => {
                    setCreateModalOpen(false);
                    setReloadTick((t) => t + 1);
                }}
            />

            <UpdateSampleStatusModal
                open={statusModalOpen}
                onClose={() => {
                    setStatusModalOpen(false);
                    setSelectedSample(null);
                }}
                sample={selectedSample}
                roleId={roleId}
                onUpdated={() => {
                    setStatusModalOpen(false);
                    setSelectedSample(null);
                    setReloadTick((t) => t + 1);
                }}
                onCommentsCountChange={(sampleId, count) => {
                    setCommentCounts((prev) => ({ ...prev, [sampleId]: count }));
                }}
            />
        </div>
    );
};
