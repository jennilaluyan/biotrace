import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, RefreshCw, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { useClients } from "../../hooks/useClients";
import { useSamples } from "../../hooks/useSamples";

import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate } from "../../utils/date";

import type { Sample, SampleStatusEnum } from "../../services/samples";

type StatusFilter = "all" | SampleStatusEnum;

type ReagentReqStatus = "draft" | "submitted" | "approved" | "rejected" | "denied" | "cancelled" | string;

const getReagentRequestStatus = (s: any): ReagentReqStatus | null => {
    const direct = s?.reagent_request_status ?? s?.reagentRequestStatus ?? null;
    if (direct) return String(direct).toLowerCase();

    const rr = s?.reagent_request ?? s?.reagentRequest ?? s?.reagentRequestLatest ?? null;
    const nested = rr?.status ?? rr?.request_status ?? null;
    if (nested) return String(nested).toLowerCase();

    return null;
};

const isArchivedSample = (s: any) => {
    return Boolean(
        s?.archived_at ||
        s?.is_archived ||
        s?.coa_generated_at ||
        s?.coa_file_url ||
        s?.coa_report_id ||
        s?.report_generated_at ||
        s?.report_pdf_url ||
        s?.report?.pdf_url
    );
};

const normalizeStatusLabel = (label: string) => {
    const s = String(label || "")
        .trim()
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ");

    // cleanups to consistent “token-ish” english (used for mapping)
    if (s === "in progress") return "in progress";
    if (s === "testing completed") return "testing done";
    if (s === "ready for reagent request") return "ready for reagent";
    if (s === "awaiting analyst intake") return "awaiting intake";
    if (s === "in transit to analyst") return "in transit to analyst";
    if (s === "received by analyst") return "received";
    if (s === "received_by_analyst") return "received";
    if (s === "in_transit_to_analyst") return "in transit to analyst";
    if (s === "awaiting lab promotion") return "awaiting promotion";
    if (s === "awaiting crosscheck") return "awaiting crosscheck";
    if (s === "crosscheck passed") return "crosscheck passed";
    if (s === "crosscheck failed") return "crosscheck failed";
    if (s === "reagent request (submitted)") return "reagent submitted";
    if (s === "reagent request (draft)") return "reagent draft";
    if (s === "reagent request (approved)") return "reagent approved";
    if (s === "reagent request (denied)") return "reagent denied";

    const m = s.match(/^reagent request \((.+)\)$/);
    if (m?.[1]) {
        const inner = m[1].trim();
        return `reagent ${inner}`;
    }

    return s;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export const SamplesPage = () => {
    const { t } = useTranslation();

    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");

    const navigate = useNavigate();

    const { user } = useAuth();
    const roleId = getUserRoleId(user) ?? ROLE_ID.CLIENT;
    const roleLabel = getUserRoleLabel(user);

    const [reloadTick, setReloadTick] = useState(0);

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

    useEffect(() => {
        setPage(1);
    }, [clientFilter, statusFilter, dateFrom, dateTo]);

    const labOnlyItems = useMemo(() => {
        return (items ?? []).filter((s: Sample) => !!s.lab_sample_code).filter((s: Sample) => !isArchivedSample(s as any));
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

    const translateStatus = (rawLabel: string) => {
        const k = normalizeStatusLabel(rawLabel);

        const map: Record<string, string> = {
            "in progress": "sampleStatus.inProgress",
            "testing done": "sampleStatus.testingDone",
            "ready for reagent": "sampleStatus.readyForReagent",
            "awaiting intake": "sampleStatus.awaitingIntake",
            "in transit to analyst": "sampleStatus.inTransitToAnalyst",
            received: "sampleStatus.received",
            "awaiting promotion": "sampleStatus.awaitingPromotion",
            "awaiting crosscheck": "sampleStatus.awaitingCrosscheck",
            "crosscheck passed": "sampleStatus.crosscheckPassed",
            "crosscheck failed": "sampleStatus.crosscheckFailed",
            verified: "sampleStatus.verified",
            validated: "sampleStatus.validated",
            reported: "sampleStatus.reported",

            "reagent draft": "reagentStatus.draft",
            "reagent submitted": "reagentStatus.submitted",
            "reagent approved": "reagentStatus.approved",
            "reagent denied": "reagentStatus.denied",
        };

        const key = map[k];
        if (!key) return rawLabel; // fallback
        const out = t(key);
        return out === key ? rawLabel : out;
    };

    const getSamplesListStatusChip = (s: Sample): { label: string; className: string } => {
        const anyS = s as any;

        const rrStatus = getReagentRequestStatus(anyS);
        if (rrStatus) {
            if (rrStatus === "draft") return { label: "reagent draft", className: statusChipClass("gray") };
            if (rrStatus === "submitted") return { label: "reagent submitted", className: statusChipClass("yellow") };
            if (rrStatus === "approved") return { label: "reagent approved", className: statusChipClass("green") };
            if (rrStatus === "rejected" || rrStatus === "denied") return { label: "reagent denied", className: statusChipClass("red") };
            return { label: `reagent ${rrStatus}`, className: statusChipClass("gray") };
        }

        const rs = String(anyS?.request_status ?? "").trim().toLowerCase();
        if (rs) {
            if (rs === "in_transit_to_analyst") return { label: "in transit to analyst", className: statusChipClass("yellow") };
            if (rs === "received_by_analyst") return { label: "received", className: statusChipClass("blue") };

            const label = normalizeStatusLabel(rs);
            const tone =
                rs.includes("rejected") || rs.includes("failed") || rs.includes("returned")
                    ? "red"
                    : rs.includes("submitted") || rs.includes("ready") || rs.includes("awaiting")
                        ? "yellow"
                        : rs.includes("validated") || rs.includes("passed")
                            ? "green"
                            : "gray";

            return { label, className: statusChipClass(tone as any) };
        }

        const cs = String(anyS?.crosscheck_status ?? "pending").toLowerCase();
        if (cs === "failed") return { label: "crosscheck failed", className: statusChipClass("red") };
        if (cs === "passed") return { label: "crosscheck passed", className: statusChipClass("green") };

        const hasLabCode = !!s.lab_sample_code;
        if (!hasLabCode) return { label: "awaiting promotion", className: statusChipClass("gray") };

        const current = String(s.current_status ?? "").toLowerCase().replace(/_/g, " ");
        if (current === "received") return { label: "received", className: statusChipClass("blue") };
        if (current === "in progress") return { label: "in progress", className: statusChipClass("blue") };
        if (current === "testing completed") return { label: "testing done", className: statusChipClass("blue") };
        if (current === "verified") return { label: "verified", className: statusChipClass("green") };
        if (current === "validated") return { label: "validated", className: statusChipClass("green") };
        if (current === "reported") return { label: "reported", className: statusChipClass("green") };

        return { label: "awaiting crosscheck", className: statusChipClass("yellow") };
    };

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
                <h1 className="text-2xl font-semibold text-primary mb-2">{t("errors.accessDeniedTitle")}</h1>
                <p className="text-sm text-gray-600 text-center max-w-xl">
                    {t("errors.accessDeniedBodyWithRole", { role: roleLabel })}
                </p>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("samplesPage.title")}</h1>

                {canCreateSample && (
                    <button type="button" onClick={() => navigate("/samples/new")} className="lims-btn-primary self-start md:self-auto">
                        {t("samplesPage.newSample")}
                    </button>
                )}
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="sample-search">
                            {t("samplesPage.filters.searchLabel")}
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500" aria-hidden="true">
                                <Search className="h-4 w-4" />
                            </span>

                            <input
                                id="sample-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={t("samplesPage.filters.searchPlaceholder")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="sample-client-filter">
                            {t("samplesPage.filters.client")}
                        </label>
                        <select
                            id="sample-client-filter"
                            value={clientFilter}
                            onChange={(e) => setClientFilter(e.target.value)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("samplesPage.filters.allClients")}</option>
                            {clientsLoading ? (
                                <option value="__loading__" disabled>
                                    {t("samplesPage.filters.loadingClients")}
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
                            {t("common.status")}
                        </label>
                        <select
                            id="sample-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("samplesPage.filters.allStatus")}</option>
                            <option value="registered">{t("samplesPage.status.registered")}</option>
                            <option value="testing">{t("samplesPage.status.testing")}</option>
                            <option value="reported">{t("samplesPage.status.reported")}</option>
                        </select>
                    </div>

                    <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
                        <div className="w-full sm:w-40">
                            <label className="sr-only" htmlFor="sample-date-from">
                                {t("samplesPage.filters.fromDate")}
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
                                {t("samplesPage.filters.toDate")}
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
                            onClick={() => setReloadTick((x) => x + 1)}
                            aria-label={t("common.refresh")}
                            title={t("common.refresh")}
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {error && <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{error}</div>}

                    {loading ? (
                        <div className="text-sm text-gray-600">{t("samplesPage.loading")}</div>
                    ) : visibleItems.length === 0 ? (
                        <div className="text-sm text-gray-600">{t("samplesPage.empty")}</div>
                    ) : (
                        <>
                            <div className="text-xs text-gray-600 mb-3">
                                {t("samplesPage.showing", { from, to, total })}
                            </div>

                            <div className="space-y-4">
                                {groups.map((g) => {
                                    const allPassed = g.samples.every(
                                        (s) => String((s as any)?.crosscheck_status ?? "pending").toLowerCase() === "passed"
                                    );
                                    const rr = (g.reagentRequestStatus ?? null) as string | null;

                                    const rrLabel =
                                        rr === "draft"
                                            ? t("samplesPage.reagent.continue")
                                            : rr === "submitted"
                                                ? t("samplesPage.reagent.viewSubmitted")
                                                : rr === "approved"
                                                    ? t("samplesPage.reagent.viewApproved")
                                                    : rr
                                                        ? t("samplesPage.reagent.viewOther", { status: rr })
                                                        : t("samplesPage.reagent.create");

                                    const rrTone =
                                        rr === "approved"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : rr === "submitted"
                                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                                : rr === "draft"
                                                    ? "bg-slate-50 text-slate-700 border-slate-200"
                                                    : "bg-white text-primary border-primary/30";

                                    const groupTitle = g.loId
                                        ? t("samplesPage.group.titleWithNumber", { number: g.loNumber ?? `#${g.loId}` })
                                        : t("samplesPage.group.noLooTitle");

                                    const groupMeta = g.loId
                                        ? t("samplesPage.group.metaWithCrosscheck", {
                                            count: g.samples.length,
                                            crosscheck: allPassed ? t("samplesPage.group.crosscheckPassed") : t("samplesPage.group.crosscheckNotReady"),
                                        })
                                        : t("samplesPage.group.meta", { count: g.samples.length });

                                    return (
                                        <div key={g.key} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                            <div className="px-4 md:px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
                                                <div>
                                                    <div className="text-sm font-extrabold text-gray-900">{groupTitle}</div>
                                                    <div className="text-xs text-gray-600 mt-1">{groupMeta}</div>
                                                </div>

                                                {g.loId ? (
                                                    <button
                                                        type="button"
                                                        className={cx("px-3 py-2 rounded-xl border text-xs font-bold", rrTone, !allPassed && "opacity-50 cursor-not-allowed")}
                                                        disabled={!allPassed}
                                                        title={!allPassed ? t("samplesPage.reagent.blockedTitle") : undefined}
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
                                                            <th className="text-left font-semibold px-4 py-3">{t("samplesPage.table.labCode")}</th>
                                                            <th className="text-left font-semibold px-4 py-3">{t("samplesPage.table.sampleType")}</th>
                                                            <th className="text-left font-semibold px-4 py-3">{t("samplesPage.table.status")}</th>
                                                            <th className="text-left font-semibold px-4 py-3">{t("samplesPage.table.received")}</th>
                                                            <th className="text-right font-semibold px-4 py-3">{t("common.actions")}</th>
                                                        </tr>
                                                    </thead>

                                                    <tbody className="divide-y divide-gray-100">
                                                        {g.samples.map((s) => {
                                                            const chip = getSamplesListStatusChip(s);
                                                            const displayLabel = translateStatus(chip.label);

                                                            return (
                                                                <tr key={s.sample_id} className="hover:bg-gray-50">
                                                                    <td className="px-4 py-3 text-gray-900">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-mono text-xs">{s.lab_sample_code ?? "-"}</span>
                                                                        </div>
                                                                    </td>

                                                                    <td className="px-4 py-3 text-gray-700">{s.sample_type ?? "-"}</td>

                                                                    <td className="px-4 py-3">
                                                                        <span className={cx("inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold", chip.className)} title={displayLabel}>
                                                                            {displayLabel}
                                                                        </span>
                                                                    </td>

                                                                    <td className="px-4 py-3 text-gray-700">{s.received_at ? formatDate(s.received_at) : "-"}</td>

                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <button
                                                                                type="button"
                                                                                className="lims-icon-button"
                                                                                aria-label={t("common.view")}
                                                                                title={t("common.view")}
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
                                    {t("common.pageOf", { page: meta?.current_page ?? 1, totalPages })}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => goToPage((meta?.current_page ?? 1) - 1)}
                                        disabled={(meta?.current_page ?? 1) <= 1}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    >
                                        {t("common.prev")}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => goToPage((meta?.current_page ?? 1) + 1)}
                                        disabled={(meta?.current_page ?? 1) >= totalPages}
                                        className="px-3 py-1 rounded-full border text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    >
                                        {t("common.next")}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                                <div className="font-semibold">{t("samplesPage.help.title")}</div>
                                <div className="mt-1">{t("samplesPage.help.body")}</div>
                                <div className="mt-2 text-xs text-slate-600">{t("samplesPage.help.hint")}</div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
