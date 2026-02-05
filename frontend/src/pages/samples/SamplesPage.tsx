// L:\Campus\Final Countdown\biotrace\frontend\src\pages\samples\SamplesPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, RefreshCw } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import { useClients } from "../../hooks/useClients";
import { useSamples } from "../../hooks/useSamples";

import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate } from "../../utils/date";

import type { Sample, SampleStatusEnum } from "../../services/samples";

type StatusFilter = "all" | SampleStatusEnum;

type ReagentReqStatus =
    | "draft"
    | "submitted"
    | "approved"
    | "rejected"
    | "denied"
    | "cancelled"
    | string;

const getReagentRequestStatus = (s: any): ReagentReqStatus | null => {
    const direct = s?.reagent_request_status ?? s?.reagentRequestStatus ?? null;
    if (direct) return String(direct).toLowerCase();

    const rr = s?.reagent_request ?? s?.reagentRequest ?? s?.reagentRequestLatest ?? null;
    const nested = rr?.status ?? rr?.request_status ?? null;
    if (nested) return String(nested).toLowerCase();

    return null;
};

// Normalize any status label to: lowercase, spaces (no underscores), not too long.
const normalizeStatusLabel = (label: string) => {
    const s = String(label || "")
        .trim()
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ");

    // small cleanups
    if (s === "in progress") return "in progress";
    if (s === "testing completed") return "testing done";
    if (s === "ready for reagent request") return "ready for reagent";
    if (s === "awaiting analyst intake") return "awaiting intake";
    if (s === "awaiting lab promotion") return "awaiting promotion";
    if (s === "awaiting crosscheck") return "awaiting crosscheck";
    if (s === "crosscheck passed") return "crosscheck passed";
    if (s === "crosscheck failed") return "crosscheck failed";
    if (s === "reagent request (submitted)") return "reagent submitted";
    if (s === "reagent request (draft)") return "reagent draft";
    if (s === "reagent request (approved)") return "reagent approved";
    if (s === "reagent request (denied)") return "reagent denied";

    // generic shortening for reagent request (xxx)
    const m = s.match(/^reagent request \((.+)\)$/);
    if (m?.[1]) {
        const inner = m[1].trim();
        return `reagent ${inner}`;
    }

    return s;
};

export const SamplesPage = () => {
    const [dateFrom, setDateFrom] = useState<string>(""); // YYYY-MM-DD
    const [dateTo, setDateTo] = useState<string>(""); // YYYY-MM-DD

    const navigate = useNavigate();

    const { user } = useAuth();
    const roleId = getUserRoleId(user) ?? ROLE_ID.CLIENT;
    const roleLabel = getUserRoleLabel(user);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [reloadTick, setReloadTick] = useState(0);

    const [commentCounts, setCommentCounts] = useState<Record<number, number>>({});

    const canViewSamples = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.LAB_HEAD ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR
        );
    }, [roleId]);

    const canCreateSample = roleId === ROLE_ID.ADMIN;

    // UI filters
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [clientFilter, setClientFilter] = useState<string>("all");
    const [page, setPage] = useState(1);

    const { clients, loading: clientsLoading } = useClients();

    const clientIdParam = clientFilter === "all" ? undefined : Number(clientFilter);
    const statusEnumParam = statusFilter === "all" ? undefined : (statusFilter as SampleStatusEnum);

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
            const hay = [String(s.sample_id), s.lab_sample_code, s.sample_type, s.current_status, s.status_enum]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            return hay.includes(term);
        });
    }, [labOnlyItems, searchTerm]);

    const statusChipClass = (tone: "gray" | "blue" | "yellow" | "green" | "red") => {
        switch (tone) {
            case "blue":
                return "bg-blue-50 text-blue-700";
            case "yellow":
                return "bg-yellow-50 text-yellow-800";
            case "green":
                return "bg-green-50 text-green-700";
            case "red":
                return "bg-red-50 text-red-700";
            default:
                return "bg-gray-100 text-gray-700";
        }
    };

    const getSamplesListStatusChip = (s: Sample): { label: string; className: string } => {
        const anyS = s as any;

        // 0) Reagent request stage has highest priority once it exists
        const rrStatus = getReagentRequestStatus(anyS);
        if (rrStatus) {
            if (rrStatus === "draft") {
                return { label: normalizeStatusLabel("reagent request (draft)"), className: statusChipClass("gray") };
            }
            if (rrStatus === "submitted") {
                return { label: normalizeStatusLabel("reagent request (submitted)"), className: statusChipClass("yellow") };
            }
            if (rrStatus === "approved") {
                return { label: normalizeStatusLabel("reagent request (approved)"), className: statusChipClass("green") };
            }
            if (rrStatus === "rejected" || rrStatus === "denied") {
                return { label: normalizeStatusLabel("reagent request (denied)"), className: statusChipClass("red") };
            }
            return { label: normalizeStatusLabel(`reagent request (${rrStatus})`), className: statusChipClass("gray") };
        }

        // 1) Crosscheck status (analyst gate)
        const cs = String(anyS?.crosscheck_status ?? "pending").toLowerCase();
        if (cs === "failed") {
            return { label: normalizeStatusLabel("crosscheck failed"), className: statusChipClass("red") };
        }
        if (cs === "passed") {
            return { label: normalizeStatusLabel("crosscheck passed"), className: statusChipClass("green") };
        }

        // 2) Analyst intake fallback
        const hasLabCode = !!s.lab_sample_code;
        if (!hasLabCode) {
            return { label: normalizeStatusLabel("awaiting lab promotion"), className: statusChipClass("gray") };
        }

        const analystReceivedAt = anyS?.analyst_received_at ?? null;
        if (!analystReceivedAt) {
            return { label: normalizeStatusLabel("awaiting analyst intake"), className: statusChipClass("yellow") };
        }

        // 3) current_status fallback (lab workflow)
        const current = String(s.current_status ?? "").toLowerCase().replace(/_/g, " ");
        if (current === "received") return { label: normalizeStatusLabel("received"), className: statusChipClass("blue") };
        if (current === "in progress") return { label: normalizeStatusLabel("in progress"), className: statusChipClass("blue") };
        if (current === "testing completed") return { label: normalizeStatusLabel("testing completed"), className: statusChipClass("blue") };
        if (current === "verified") return { label: normalizeStatusLabel("verified"), className: statusChipClass("green") };
        if (current === "validated") return { label: normalizeStatusLabel("validated"), className: statusChipClass("green") };
        if (current === "reported") return { label: normalizeStatusLabel("reported"), className: statusChipClass("green") };

        // 4) Default
        return { label: normalizeStatusLabel("awaiting crosscheck"), className: statusChipClass("yellow") };
    };

    /**
     * ✅ Group samples per LOO.
     */
    const groups = useMemo(() => {
        type Group = {
            key: string;
            loId: number | null;
            loNumber: string | null;
            loGeneratedAt: string | null;
            reagentRequestStatus: string | null;
            samples: Sample[];
        };

        const map = new Map<string, Group>();

        for (const s of visibleItems) {
            const anyS = s as any;

            const loId = (anyS?.lo_id ?? null) as number | null;
            const loNumber = (anyS?.lo_number ?? null) as string | null;
            const loGeneratedAt = (anyS?.lo_generated_at ?? null) as string | null;

            const rrStatus = getReagentRequestStatus(anyS);

            const key = loId ? `lo:${loId}` : "no-loo";

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    loId,
                    loNumber,
                    loGeneratedAt,
                    reagentRequestStatus: rrStatus,
                    samples: [],
                });
            } else {
                const g = map.get(key)!;
                if (!g.reagentRequestStatus && rrStatus) g.reagentRequestStatus = rrStatus;
                if (!g.loNumber && loNumber) g.loNumber = loNumber;
                if (!g.loGeneratedAt && loGeneratedAt) g.loGeneratedAt = loGeneratedAt;
            }

            map.get(key)!.samples.push(s);
        }

        const arr = Array.from(map.values());

        // sort: LOO groups first (desc by loId), then "no-loo"
        arr.sort((a, b) => {
            if (a.loId == null && b.loId != null) return 1;
            if (a.loId != null && b.loId == null) return -1;
            if (a.loId != null && b.loId != null) return b.loId - a.loId;
            return 0;
        });

        for (const g of arr) {
            g.samples.sort((a, b) => (b.sample_id ?? 0) - (a.sample_id ?? 0));
        }

        return arr;
    }, [visibleItems]);

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
                <h1 className="text-2xl font-semibold text-primary mb-2">403 – Access denied</h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not allowed to access the samples module.
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <h1 className="text-lg md:text-xl font-bold text-gray-900">Sample Management</h1>

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
                                placeholder="Search by sample type, code, status…"
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
                            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
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
                            className="lims-icon-button"
                            onClick={() => setReloadTick((t) => t + 1)}
                            aria-label="Refresh"
                            title="Refresh"
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {error && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>
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
                                <span className="font-semibold">{total}</span> (lab samples only).
                            </div>

                            {/* GROUPED BY LOO */}
                            <div className="space-y-4">
                                {groups.map((g) => {
                                    const allPassed = g.samples.every(
                                        (s) => String((s as any)?.crosscheck_status ?? "pending").toLowerCase() === "passed"
                                    );
                                    const rr = (g.reagentRequestStatus ?? null) as string | null;

                                    const rrLabel =
                                        rr === "draft"
                                            ? "Continue Reagent Request"
                                            : rr === "submitted"
                                                ? "View Reagent Request (submitted)"
                                                : rr === "approved"
                                                    ? "View Reagent Request (approved)"
                                                    : rr
                                                        ? `View Reagent Request (${rr})`
                                                        : "Create Reagent Request";

                                    const rrTone =
                                        rr === "approved"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : rr === "submitted"
                                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                                : rr === "draft"
                                                    ? "bg-slate-50 text-slate-700 border-slate-200"
                                                    : "bg-white text-primary border-primary/30";

                                    return (
                                        <div key={g.key} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                            <div className="px-4 md:px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-extrabold text-gray-900">
                                                        {g.loId ? `LOO ${g.loNumber ?? `#${g.loId}`}` : "No LOO (Legacy/Manual)"}
                                                    </div>
                                                    <div className="text-xs text-gray-600 mt-1">
                                                        {g.loId
                                                            ? `samples: ${g.samples.length} • crosscheck: ${allPassed ? "passed" : "not ready"}`
                                                            : `samples: ${g.samples.length}`}
                                                    </div>
                                                </div>

                                                {g.loId ? (
                                                    <button
                                                        type="button"
                                                        className={`px-3 py-2 rounded-xl border text-xs font-bold ${rrTone} ${!allPassed ? "opacity-50 cursor-not-allowed" : ""
                                                            }`}
                                                        disabled={!allPassed}
                                                        title={!allPassed ? "Blocked: all samples in this LOO must be crosscheck passed" : undefined}
                                                        onClick={() => navigate(`/reagents/requests/loo/${g.loId}`)}
                                                    >
                                                        {rrLabel}
                                                    </button>
                                                ) : null}
                                            </div>

                                            <div className="overflow-x-auto">
                                                <table className="min-w-full text-sm">
                                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                                        <tr>
                                                            {/* Removed: Sample ID */}
                                                            <th className="text-left font-semibold px-4 py-3">Lab Code</th>
                                                            <th className="text-left font-semibold px-4 py-3">Sample Type</th>
                                                            <th className="text-left font-semibold px-4 py-3">Status</th>
                                                            <th className="text-left font-semibold px-4 py-3">Received</th>
                                                            <th className="text-right font-semibold px-4 py-3">Actions</th>
                                                        </tr>
                                                    </thead>

                                                    <tbody className="divide-y divide-gray-100">
                                                        {g.samples.map((s) => {
                                                            const chip = getSamplesListStatusChip(s);

                                                            return (
                                                                <tr key={s.sample_id} className="hover:bg-gray-50">
                                                                    <td className="px-4 py-3 text-gray-900">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-mono text-xs">
                                                                                {s.lab_sample_code ?? "-"}
                                                                            </span>
                                                                        </div>
                                                                    </td>

                                                                    <td className="px-4 py-3 text-gray-700">{s.sample_type ?? "-"}</td>

                                                                    <td className="px-4 py-3">
                                                                        <span
                                                                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${chip.className}`}
                                                                            title={chip.label}
                                                                        >
                                                                            {normalizeStatusLabel(chip.label)}
                                                                        </span>
                                                                    </td>

                                                                    <td className="px-4 py-3 text-gray-700">
                                                                        {s.received_at ? formatDate(s.received_at) : "-"}
                                                                    </td>

                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <button
                                                                                type="button"
                                                                                className="lims-icon-button"
                                                                                aria-label="View"
                                                                                title="View"
                                                                                onClick={() =>
                                                                                    navigate(`/samples/${s.sample_id}`, {
                                                                                        state: {
                                                                                            reagent_request_status: getReagentRequestStatus(s as any),
                                                                                            lo_id: (s as any)?.lo_id ?? null,
                                                                                            lo_number: (s as any)?.lo_number ?? null,
                                                                                        },
                                                                                    })
                                                                                }
                                                                            >
                                                                                <Eye size={16} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    Page <span className="font-semibold">{meta?.current_page ?? 1}</span> of{" "}
                                    <span className="font-semibold">{totalPages}</span>
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

                            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                <div className="font-semibold">Kapan sampel muncul di sini?</div>
                                <div className="mt-1">
                                    Sampel akan muncul di halaman ini setelah sudah dimasukkan ke <b>LOO</b> (atau sampel lama yang memang sudah punya workflow lab).
                                </div>
                                <div className="mt-2 text-xs text-slate-600">
                                    Kalau sampel baru selesai diverifikasi tapi belum muncul di sini, itu normal—cek dulu di <b>LOO Generator</b>.
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
