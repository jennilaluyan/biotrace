import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, ChevronDown, FileText, Info, RefreshCw, RotateCcw, Search, Square } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../hooks/useAuth";
import { getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";

import { apiGet } from "../../services/api";
import { looService } from "../../services/loo";
import { ReportPreviewModal } from "../../components/reports/ReportPreviewModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type RequestedParameter = {
    parameter_id: number;
    code?: string | null;
    name?: string | null;
};

type CandidateSample = {
    sample_id: number;
    lab_sample_code?: string | null;
    sample_type?: string | null;

    verified_at?: string | null;
    received_at?: string | null;
    physically_received_at?: string | null;
    admin_received_from_client_at?: string | null;

    client?: { name?: string | null; organization?: string | null } | null;
    requested_parameters?: RequestedParameter[] | null;
};

type ApprovalState = { OM: boolean; LH: boolean; ready: boolean };
type StatusFilter = "all" | "ready" | "needs_approval";

function normalizeRole(label: string) {
    return String(label || "").trim().toLowerCase();
}

/**
 * Derive role code used by approvals from visible label.
 * Keep forgiving (labels can vary slightly).
 */
function getActorRoleCode(roleLabel: string): "OM" | "LH" | null {
    const r = normalizeRole(roleLabel);
    if (r === "om" || r.includes("operational manager")) return "OM";
    if (r === "lh" || r.includes("laboratory head") || r.includes("lab head")) return "LH";
    return null;
}

function toIntOrZero(v: any): number {
    const n = Number(v ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function toStrOrNull(v: any): string | null {
    const s = String(v ?? "").trim();
    return s ? s : null;
}

/**
 * Normalize absolute URL into same-origin path when possible.
 * This helps preview modal avoid cross-origin session issues.
 */
function normalizeUrlToSameOriginPath(url: string): string {
    const raw = String(url || "").trim();
    if (!raw) return raw;

    if (/^https?:\/\//i.test(raw)) {
        try {
            const u = new URL(raw);
            return (u.pathname || "") + (u.search || "");
        } catch {
            return raw;
        }
    }
    return raw;
}

/**
 * Prefer download_url -> pdf_file_id -> pdf_url -> fallback.
 */
function resolveResultUrl(res: any): string | null {
    const obj = res?.data ?? res;

    const dl = obj?.download_url ?? res?.download_url;
    if (typeof dl === "string" && dl.trim() !== "") return normalizeUrlToSameOriginPath(dl);

    const pdfFileId = toIntOrZero(obj?.pdf_file_id ?? obj?.pdfFileId ?? res?.pdf_file_id ?? res?.pdfFileId);
    if (pdfFileId > 0) return `/api/v1/files/${pdfFileId}`;

    const pdf = obj?.pdf_url ?? res?.pdf_url;
    if (typeof pdf === "string" && pdf.trim() !== "") return normalizeUrlToSameOriginPath(pdf);

    const loId = obj?.lo_id ?? obj?.loo_id ?? obj?.id ?? res?.lo_id ?? res?.id;
    if (typeof loId === "number" && loId > 0) return `/api/v1/reports/documents/loo/${loId}/pdf`;

    const fu = obj?.file_url ?? res?.file_url;
    if (typeof fu === "string" && fu.trim() !== "") {
        const s = normalizeUrlToSameOriginPath(fu);
        if (/^https?:\/\//i.test(s)) return s;
        if (s.startsWith("/api/") || s.startsWith("/v1/")) return s;
    }

    return null;
}

function pickReceivedAt(s: CandidateSample): string | null {
    return s.received_at ?? s.physically_received_at ?? s.admin_received_from_client_at ?? null;
}

export function LooGeneratorPage() {
    const { t } = useTranslation();
    const { user } = useAuth();

    const roleLabel = getUserRoleLabel(user);
    const actorRole = getActorRoleCode(roleLabel);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [items, setItems] = useState<CandidateSample[]>([]);
    const [q, setQ] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    // Server-backed approvals per sample (single source of truth).
    const [approvals, setApprovals] = useState<Record<number, ApprovalState>>({});

    // Selection & param selection (used for bulk generate).
    const [selected, setSelected] = useState<Record<number, boolean>>({});
    const [paramSel, setParamSel] = useState<Record<number, Record<number, boolean>>>({});

    // Preview modal state
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [resultNumber, setResultNumber] = useState<string | null>(null);
    const [resultRecordNo, setResultRecordNo] = useState<string | null>(null);
    const [resultFormCode, setResultFormCode] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);

    const debounceRef = useRef<number | null>(null);
    const pollRef = useRef<number | null>(null);

    const NA = t(["na", "common.na"], "—");
    const canAct = actorRole === "OM" || actorRole === "LH";

    const resetResult = useCallback(() => {
        setResultUrl(null);
        setResultNumber(null);
        setResultRecordNo(null);
        setResultFormCode(null);
        setPreviewOpen(false);
    }, []);

    /**
     * Initialize selection maps for a new list:
     * - selected: false by default
     * - paramSel: all requested parameters checked by default (fast path for users)
     */
    const initSelectionMaps = useCallback((list: CandidateSample[]) => {
        const nextSelected: Record<number, boolean> = {};
        const nextParamSel: Record<number, Record<number, boolean>> = {};

        for (const s of list) {
            nextSelected[s.sample_id] = false;

            const map: Record<number, boolean> = {};
            for (const p of s.requested_parameters ?? []) map[p.parameter_id] = true;
            nextParamSel[s.sample_id] = map;
        }

        setSelected(nextSelected);
        setParamSel(nextParamSel);
    }, []);

    const refreshApprovals = useCallback(async (sampleIds: number[]) => {
        if (!Array.isArray(sampleIds) || sampleIds.length === 0) {
            setApprovals({});
            return;
        }

        try {
            // ✅ Service already normalizes OM/LH keys internally.
            const st = await looService.getApprovals(sampleIds);

            const next: Record<number, ApprovalState> = {};
            for (const sid of sampleIds) {
                const row = st?.[sid] ?? null;
                next[sid] = {
                    OM: !!row?.OM,
                    LH: !!row?.LH,
                    ready: !!row?.ready,
                };
            }
            setApprovals(next);
        } catch {
            // Keep UI stable with safe defaults.
            const next: Record<number, ApprovalState> = {};
            for (const sid of sampleIds) next[sid] = { OM: false, LH: false, ready: false };
            setApprovals(next);
        }
    }, []);

    const load = useCallback(
        async (opts?: { resetResult?: boolean; query?: string }) => {
            const shouldResetResult = opts?.resetResult ?? false;
            const query = (opts?.query ?? q).trim();

            try {
                setLoading(true);
                setError(null);
                if (shouldResetResult) resetResult();

                const res = await apiGet<any>("/v1/samples/requests", {
                    params: { mode: "loo_candidates", q: query || undefined },
                });

                const data = (res?.data?.data ?? res?.data ?? res) as any[];
                const list: CandidateSample[] = Array.isArray(data) ? data : [];

                setItems(list);
                initSelectionMaps(list);

                const ids = list.map((x) => x.sample_id);
                await refreshApprovals(ids);
            } catch (err: any) {
                const msg =
                    err?.response?.data?.message ??
                    err?.data?.message ??
                    err?.message ??
                    t("loo.generator.errors.loadFailed", "Failed to load candidates.");
                setError(msg);
            } finally {
                setLoading(false);
            }
        },
        [q, initSelectionMaps, refreshApprovals, resetResult, t]
    );

    useEffect(() => {
        load({ resetResult: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced search reload
    useEffect(() => {
        if (debounceRef.current) window.clearTimeout(debounceRef.current);

        debounceRef.current = window.setTimeout(() => {
            load({ query: q });
        }, 350);

        return () => {
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
        };
    }, [q, load]);

    /**
     * Auto-refresh approvals only (not the entire list), so we don't destroy selection.
     * Fixes: "LH already approved but OM doesn't see it" / "refresh then disappear".
     */
    useEffect(() => {
        if (pollRef.current) window.clearInterval(pollRef.current);

        pollRef.current = window.setInterval(() => {
            if (busy || loading) return;
            refreshApprovals(items.map((x) => x.sample_id));
        }, 12000);

        const onFocus = () => {
            if (busy || loading) return;
            refreshApprovals(items.map((x) => x.sample_id));
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onFocus);

        return () => {
            if (pollRef.current) window.clearInterval(pollRef.current);
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, [busy, loading, items, refreshApprovals]);

    const itemsShown = useMemo(() => {
        const list = items ?? [];
        if (statusFilter === "all") return list;

        return list.filter((s) => {
            const st = approvals[s.sample_id] ?? { OM: false, LH: false, ready: false };
            if (statusFilter === "ready") return !!st.ready;
            if (statusFilter === "needs_approval") return !st.ready;
            return true;
        });
    }, [items, approvals, statusFilter]);

    const selectedIds = useMemo(() => {
        return Object.keys(selected)
            .map((k) => Number(k))
            .filter((id) => selected[id]);
    }, [selected]);

    const readySelectedIds = useMemo(() => {
        return selectedIds.filter((sid) => !!approvals[sid]?.ready);
    }, [selectedIds, approvals]);

    const anyReadyInList = useMemo(() => {
        return items.some((s) => !!approvals[s.sample_id]?.ready);
    }, [items, approvals]);

    const readyCountInList = useMemo(() => {
        return items.filter((s) => !!approvals[s.sample_id]?.ready).length;
    }, [items, approvals]);

    const selectedShownCount = useMemo(() => {
        return itemsShown.filter((s) => !!selected[s.sample_id]).length;
    }, [itemsShown, selected]);

    const toggleAllShown = (v: boolean) => {
        setSelected((prev) => {
            const next = { ...prev };
            for (const s of itemsShown) next[s.sample_id] = v;
            return next;
        });
    };

    /**
     * Optimistic update + reconcile with server truth.
     * IMPORTANT: backend may return lowercase keys (om/lh/ready) -> service normalizes.
     */
    const setApprovalFor = useCallback(
        async (sampleId: number, nextApproved: boolean) => {
            if (!actorRole) return;

            try {
                setBusy(true);
                setError(null);

                // Optimistic UI update
                setApprovals((prev) => {
                    const cur = prev[sampleId] ?? { OM: false, LH: false, ready: false };
                    const next = { ...cur };

                    if (actorRole === "OM") next.OM = nextApproved;
                    if (actorRole === "LH") next.LH = nextApproved;
                    next.ready = !!(next.OM && next.LH);

                    return { ...prev, [sampleId]: next };
                });

                const res = await looService.setApproval(sampleId, nextApproved);

                // ✅ Always trust the normalized server state
                setApprovals((p) => ({
                    ...p,
                    [sampleId]: {
                        OM: !!res.state.OM,
                        LH: !!res.state.LH,
                        ready: !!res.state.ready,
                    },
                }));
            } catch (err: any) {
                const msg =
                    err?.response?.data?.message ??
                    err?.data?.message ??
                    err?.message ??
                    t("loo.generator.errors.approvalFailed", "Failed to update approval.");
                setError(msg);

                // Rollback via refresh
                await refreshApprovals(items.map((x) => x.sample_id));
            } finally {
                setBusy(false);
            }
        },
        [actorRole, items, refreshApprovals, t]
    );

    const buildParamMapFor = (ids: number[]): Record<number, number[]> => {
        const out: Record<number, number[]> = {};
        for (const sid of ids) {
            const map = paramSel[sid] ?? {};
            const pids = Object.keys(map)
                .map((k) => Number(k))
                .filter((pid) => map[pid]);
            out[sid] = pids;
        }
        return out;
    };

    const generateDisabledReason = (() => {
        if (busy) return t(["processing", "common.processing"], "Processing…");
        if (items.length === 0) return t("loo.generator.disabled.noCandidates", "No candidates available.");
        if (!anyReadyInList) return t("loo.generator.disabled.noneReadyInList", "No ready samples in the list.");
        if (readySelectedIds.length === 0) return t("loo.generator.disabled.pickReady", "Select at least one ready sample.");
        return "";
    })();

    const generate = async () => {
        if (busy) return;

        if (!selectedIds.length) {
            setError(t("loo.generator.errors.selectAtLeastOne", "Select at least 1 sample."));
            return;
        }

        if (!readySelectedIds.length) {
            setError(t("loo.generator.errors.noneReadySelected", "None of the selected samples are ready."));
            return;
        }

        const map = buildParamMapFor(readySelectedIds);

        // Validate at least one param per ready sample
        for (const sid of readySelectedIds) {
            if (!map[sid] || map[sid].length === 0) {
                setError(
                    t("loo.generator.errors.paramRequiredForSample", "Select at least one parameter for sample #{{id}}.", {
                        id: sid,
                    })
                );
                return;
            }
        }

        try {
            setBusy(true);
            setError(null);
            resetResult();

            const res = await looService.generateForSamples(readySelectedIds, map);
            const obj = (res as any)?.data ?? (res as any);

            const looNumber =
                typeof obj?.number === "string"
                    ? (obj.number as string)
                    : typeof obj?.loo_number === "string"
                        ? (obj.loo_number as string)
                        : null;

            setResultNumber(looNumber);
            setResultRecordNo(toStrOrNull(obj?.record_no ?? obj?.payload?.record_no) ?? null);
            setResultFormCode(toStrOrNull(obj?.form_code ?? obj?.payload?.form_code) ?? null);

            const url = resolveResultUrl(res);
            if (!url) {
                setError(t("loo.generator.errors.missingPreviewUrl", "Preview URL is missing."));
                return;
            }

            setResultUrl(url);

            // Refresh list after generating (result stays visible)
            await load({ resetResult: false, query: q });
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.message ??
                t("loo.generator.errors.generateFailed", "Failed to generate LOO.");
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    // Small consistent chip styling
    const chipBase = "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold";
    const chipOk = "bg-emerald-50 text-emerald-700 border-emerald-200";
    const chipNeutral = "bg-gray-50 text-gray-700 border-gray-200";
    const chipWarn = "bg-amber-50 text-amber-800 border-amber-200";

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        {t(["nav.looWorkspace", "loo.generator.title"], "LOO Workspace")}
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        {t(
                            "loo.generator.subtitle",
                            "Pick eligible samples, collect approvals, then generate the Letter of Order (LOO)."
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="text-xs text-gray-600">
                        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                            <span className="text-gray-500">{t("loo.generator.roleLabel", "Role")}</span>
                            <span className="font-semibold text-gray-900">{roleLabel}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={() => load({ query: q })}
                        aria-label={t(["refresh", "common.refresh"], "Refresh")}
                        title={t(["refresh", "common.refresh"], "Refresh")}
                        disabled={loading || busy}
                    >
                        <RefreshCw size={16} className={cx((loading || busy) && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Card */}
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="loo-search">
                            {t(["search", "common.search"], "Search")}
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="loo-search"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") load({ query: q });
                                }}
                                placeholder={t("loo.generator.searchPlaceholder", "Search by sample code / client / sample type…")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-56">
                        <label className="sr-only" htmlFor="loo-status-filter">
                            {t("loo.generator.filters.statusLabel", "Status filter")}
                        </label>
                        <div className="relative">
                            <select
                                id="loo-status-filter"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                                className={cx(
                                    "w-full appearance-none rounded-xl border border-gray-300 bg-white px-3 py-2 pr-9 text-sm",
                                    "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                )}
                            >
                                <option value="all">{t("loo.generator.filters.statusAll", "All")}</option>
                                <option value="ready">{t("loo.generator.filters.statusReady", "Ready only")}</option>
                                <option value="needs_approval">{t("loo.generator.filters.statusNeedsApproval", "Needs approval")}</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        </div>
                    </div>

                    <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            className="btn-outline inline-flex items-center gap-2"
                            onClick={() => toggleAllShown(true)}
                            disabled={busy || itemsShown.length === 0}
                        >
                            <CheckSquare size={16} />
                            {t("loo.generator.selectAll", "Select all")}
                        </button>

                        <button
                            type="button"
                            className="btn-outline inline-flex items-center gap-2"
                            onClick={() => toggleAllShown(false)}
                            disabled={busy || itemsShown.length === 0}
                        >
                            <Square size={16} />
                            {t("loo.generator.clearSelection", "Clear selection")}
                        </button>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    )}

                    {/* Guidance */}
                    <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                        <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-gray-500">
                                <Info size={16} />
                            </span>
                            <div className="text-xs">
                                {t("loo.generator.guidance", "Approvals sync automatically. Only Ready samples can be generated.")}
                            </div>
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mb-4">
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            {t("loo.generator.summary.visible", "Visible")}{" "}
                            <span className="font-semibold text-gray-900">{itemsShown.length}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            {t("loo.generator.summary.selected", "Selected")}{" "}
                            <span className="font-semibold text-gray-900">{selectedShownCount}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            {t("loo.generator.summary.readySelected", "Ready selected")}{" "}
                            <span className="font-semibold text-gray-900">{readySelectedIds.length}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            {t("loo.generator.summary.readyInList", "Ready in list")}{" "}
                            <span className="font-semibold text-gray-900">{readyCountInList}</span>
                        </span>
                    </div>

                    {loading ? (
                        <div className="text-sm text-gray-600 flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                            <span>{t(["loading", "common.loading"], "Loading…")}</span>
                        </div>
                    ) : itemsShown.length === 0 ? (
                        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center">
                            <div className="mx-auto h-10 w-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500">
                                <FileText size={18} />
                            </div>
                            <div className="mt-3 text-sm font-semibold text-gray-900">
                                {t("loo.generator.emptyTitle", "No candidates found.")}
                            </div>
                            <div className="mt-1 text-xs text-gray-500 max-w-xl mx-auto">
                                {t("loo.generator.emptyBody", "Try adjusting your search or status filter, then refresh.")}
                            </div>
                            <div className="mt-4">
                                <button type="button" className="btn-outline" onClick={() => load({ query: q })} disabled={busy}>
                                    {t(["refresh", "common.refresh"], "Refresh")}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {itemsShown.map((s) => {
                                const sid = s.sample_id;
                                const st = approvals[sid] ?? { OM: false, LH: false, ready: false };
                                const checked = !!selected[sid];
                                const rx = pickReceivedAt(s);

                                const params = s.requested_parameters ?? [];
                                const selMap = paramSel[sid] ?? {};

                                const readyChip = st.ready ? chipOk : chipWarn;

                                const canApproveThisRole =
                                    (actorRole === "OM") || (actorRole === "LH");

                                const myApproved = actorRole === "OM" ? st.OM : actorRole === "LH" ? st.LH : false;

                                return (
                                    <div
                                        key={sid}
                                        className={cx(
                                            "rounded-2xl border p-4",
                                            st.ready ? "border-emerald-200 bg-emerald-50/20" : "border-gray-200 bg-white"
                                        )}
                                    >
                                        {/* Top row */}
                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                            <div className="flex items-start gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => setSelected((p) => ({ ...p, [sid]: e.target.checked }))}
                                                    disabled={busy}
                                                    className="mt-1"
                                                />

                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="text-sm font-semibold text-gray-900">
                                                            #{sid}{" "}
                                                            {s.lab_sample_code ? (
                                                                <span className="ml-2 font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                                                    {s.lab_sample_code}
                                                                </span>
                                                            ) : null}
                                                        </div>

                                                        <span className={cx(chipBase, readyChip)}>
                                                            {st.ready ? t("loo.generator.approval.readyStatus", "Ready") : t("loo.generator.approval.notReadyStatus", "Not ready")}
                                                        </span>
                                                    </div>

                                                    <div className="text-xs text-gray-600 mt-1">
                                                        {s.client?.name ?? NA}
                                                        {s.client?.organization ? ` · ${s.client.organization}` : ""}
                                                        {s.sample_type ? ` · ${s.sample_type}` : ""}
                                                    </div>

                                                    <div className="text-[11px] text-gray-500 mt-1">
                                                        {t("loo.generator.timestamps.verified", "Verified")}{" "}
                                                        {s.verified_at ? formatDateTimeLocal(s.verified_at) : NA} ·{" "}
                                                        {t("loo.generator.timestamps.received", "Received")}{" "}
                                                        {rx ? formatDateTimeLocal(rx) : NA}
                                                    </div>

                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <span className={cx(chipBase, st.OM ? chipOk : chipNeutral)}>
                                                            {t("loo.generator.approval.om", "OM")}:{" "}
                                                            {st.OM ? t("loo.generator.approval.approved", "Approved") : t("loo.generator.approval.pending", "Pending")}
                                                        </span>
                                                        <span className={cx(chipBase, st.LH ? chipOk : chipNeutral)}>
                                                            {t("loo.generator.approval.lh", "LH")}:{" "}
                                                            {st.LH ? t("loo.generator.approval.approved", "Approved") : t("loo.generator.approval.pending", "Pending")}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action button (only for current actor role) */}
                                            <div className="flex items-center justify-end gap-2">
                                                {canAct && canApproveThisRole ? (
                                                    myApproved ? (
                                                        <button
                                                            type="button"
                                                            className="btn-outline"
                                                            onClick={() => setApprovalFor(sid, false)}
                                                            disabled={busy}
                                                            title={t("loo.generator.approval.revokeHint", "Revoke your approval")}
                                                        >
                                                            {t("loo.generator.approval.revoke", "Revoke")}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="lims-btn-primary"
                                                            onClick={() => setApprovalFor(sid, true)}
                                                            disabled={busy}
                                                            title={t("loo.generator.approval.approveHint", "Approve this sample")}
                                                        >
                                                            {t("loo.generator.approval.approve", "Approve")}
                                                        </button>
                                                    )
                                                ) : (
                                                    <span className="text-[11px] text-gray-500">
                                                        {t("loo.generator.approval.readOnly", "Read-only")}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Parameters (only show when selected to save space) */}
                                        {checked ? (
                                            <div className="mt-4">
                                                <div className="text-xs font-semibold text-gray-800 mb-2">
                                                    {t("loo.generator.params.title", "Parameters")}{" "}
                                                    <span className="text-gray-500">{t("loo.generator.params.minOne", "(pick at least one)")}</span>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {params.length ? (
                                                        params.map((p) => {
                                                            const pid = p.parameter_id;
                                                            const on = !!selMap[pid];

                                                            const fallback = t("loo.generator.params.fallback", "Parameter #{{id}}", { id: pid });
                                                            const label = (p.code ? `${p.code} — ` : "") + (p.name ?? fallback);

                                                            return (
                                                                <button
                                                                    key={pid}
                                                                    type="button"
                                                                    className={cx(
                                                                        "inline-flex items-center rounded-full px-3 py-1 text-xs border",
                                                                        on
                                                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                            : "bg-gray-50 text-gray-700 border-gray-200"
                                                                    )}
                                                                    onClick={() =>
                                                                        setParamSel((prev) => ({
                                                                            ...prev,
                                                                            [sid]: { ...(prev[sid] ?? {}), [pid]: !on },
                                                                        }))
                                                                    }
                                                                    disabled={busy}
                                                                    aria-pressed={on}
                                                                    title={label}
                                                                >
                                                                    {label}
                                                                </button>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-xs text-gray-500">{t("loo.generator.params.none", "No parameters found.")}</span>
                                                    )}
                                                </div>

                                                {!st.ready ? (
                                                    <div className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                                        {t(
                                                            "loo.generator.params.notReadyNote",
                                                            "You can choose parameters now, but generating is only possible after OM & LH approvals."
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="text-[11px] text-gray-500">
                            <span className="inline-flex items-center gap-2">
                                <span className="text-gray-400">
                                    <Info size={14} />
                                </span>
                                {t("loo.generator.footerHint", "Generate uses only selected samples that are marked as Ready.")}
                            </span>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                className="btn-outline inline-flex items-center gap-2"
                                onClick={resetResult}
                                disabled={busy}
                                title={t("loo.generator.resetHint", "Clear the generated result card")}
                            >
                                <RotateCcw size={16} />
                                {t("loo.generator.reset", "Reset result")}
                            </button>

                            <button
                                type="button"
                                className="lims-btn-primary inline-flex items-center gap-2"
                                onClick={generate}
                                disabled={busy || readySelectedIds.length === 0}
                                title={generateDisabledReason}
                            >
                                <FileText size={16} />
                                {busy ? t("loo.generator.generating", "Generating…") : t("loo.generator.generate", "Generate LOO")}
                            </button>
                        </div>
                    </div>

                    {/* Result */}
                    {resultUrl ? (
                        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            <div className="font-semibold">{t("loo.generator.result.title", "LOO generated")}</div>

                            <div className="mt-1">
                                {t("loo.generator.result.number", "Number")}{" "}
                                <span className="font-mono">{resultNumber ?? NA}</span>
                            </div>

                            <div className="mt-1 text-xs text-emerald-900">
                                {t("loo.generator.result.recordNo", "Record No.")}{" "}
                                <span className="font-mono">{resultRecordNo ?? NA}</span>
                                {"  "}•{"  "}
                                {t("loo.generator.result.formCode", "Form code")}{" "}
                                <span className="font-mono">{resultFormCode ?? NA}</span>
                            </div>

                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <button type="button" className="btn-outline" onClick={() => setPreviewOpen(true)}>
                                    {t("loo.generator.result.openPreview", "Open preview")}
                                </button>
                                <span className="text-xs text-emerald-800">
                                    {t("loo.generator.result.downloadHint", "Use the preview window to download/print the PDF.")}
                                </span>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <ReportPreviewModal
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                pdfUrl={resultUrl}
                title={
                    resultNumber
                        ? t("loo.generator.previewTitle", "LOO {{number}}", { number: resultNumber })
                        : t("loo.generator.previewTitleFallback", "LOO Preview")
                }
            />
        </div>
    );
}