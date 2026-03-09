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
    request_batch_id?: string | null;
    request_batch_item_no?: number | null;
    request_batch_total?: number | null;
    client?: { name?: string | null; organization?: string | null } | null;
    requested_parameters?: RequestedParameter[] | null;
};

type ApprovalState = { OM: boolean; LH: boolean; ready: boolean };
type StatusFilter = "all" | "ready" | "needs_approval";

function normalizeRole(label: string) {
    return String(label || "").trim().toLowerCase();
}

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

function resolveResultUrl(res: any): string | null {
    const obj = res?.data ?? res;

    const downloadUrl = obj?.download_url ?? res?.download_url;
    if (typeof downloadUrl === "string" && downloadUrl.trim() !== "") {
        return normalizeUrlToSameOriginPath(downloadUrl);
    }

    const pdfFileId = toIntOrZero(obj?.pdf_file_id ?? obj?.pdfFileId ?? res?.pdf_file_id ?? res?.pdfFileId);
    if (pdfFileId > 0) return `/api/v1/files/${pdfFileId}`;

    const pdfUrl = obj?.pdf_url ?? res?.pdf_url;
    if (typeof pdfUrl === "string" && pdfUrl.trim() !== "") {
        return normalizeUrlToSameOriginPath(pdfUrl);
    }

    const looId = obj?.lo_id ?? obj?.loo_id ?? obj?.id ?? res?.lo_id ?? res?.id;
    if (typeof looId === "number" && looId > 0) {
        return `/api/v1/reports/documents/loo/${looId}/pdf`;
    }

    const fileUrl = obj?.file_url ?? res?.file_url;
    if (typeof fileUrl === "string" && fileUrl.trim() !== "") {
        const normalized = normalizeUrlToSameOriginPath(fileUrl);
        if (/^https?:\/\//i.test(normalized)) return normalized;
        if (normalized.startsWith("/api/") || normalized.startsWith("/v1/")) return normalized;
    }

    return null;
}

function pickReceivedAt(sample: CandidateSample): string | null {
    return sample.received_at ?? sample.physically_received_at ?? sample.admin_received_from_client_at ?? null;
}

function getErrorMessage(err: any, fallback: string): string {
    return err?.response?.data?.message ?? err?.data?.message ?? err?.message ?? fallback;
}

export function LooGeneratorPage() {
    const { t } = useTranslation();
    const { user } = useAuth();

    const roleLabel = getUserRoleLabel(user);
    const actorRole = getActorRoleCode(roleLabel);

    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [candidates, setCandidates] = useState<CandidateSample[]>([]);
    const [q, setQ] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    const [approvals, setApprovals] = useState<Record<number, ApprovalState>>({});
    const [selected, setSelected] = useState<Record<number, boolean>>({});
    const [paramSel, setParamSel] = useState<Record<number, Record<number, boolean>>>({});

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

    const initSelectionMaps = useCallback((list: CandidateSample[]) => {
        const nextSelected: Record<number, boolean> = {};
        const nextParamSel: Record<number, Record<number, boolean>> = {};

        for (const sample of list) {
            nextSelected[sample.sample_id] = false;

            const nextSampleParamSel: Record<number, boolean> = {};
            for (const parameter of sample.requested_parameters ?? []) {
                nextSampleParamSel[parameter.parameter_id] = true;
            }

            nextParamSel[sample.sample_id] = nextSampleParamSel;
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
            const state = await looService.getApprovals(sampleIds);

            const next: Record<number, ApprovalState> = {};
            for (const sampleId of sampleIds) {
                const row = state?.[sampleId] ?? null;
                next[sampleId] = {
                    OM: !!row?.OM,
                    LH: !!row?.LH,
                    ready: !!row?.ready,
                };
            }

            setApprovals(next);
        } catch {
            const next: Record<number, ApprovalState> = {};
            for (const sampleId of sampleIds) {
                next[sampleId] = { OM: false, LH: false, ready: false };
            }
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

                if (shouldResetResult) {
                    resetResult();
                }

                const res = await apiGet<any>("/v1/samples/requests", {
                    params: { mode: "loo_candidates", q: query || undefined },
                });

                const data = (res?.data?.data ?? res?.data ?? res) as any[];
                const list: CandidateSample[] = Array.isArray(data) ? data : [];

                setCandidates(list);
                initSelectionMaps(list);

                await refreshApprovals(list.map((row) => row.sample_id));
            } catch (err: any) {
                setError(getErrorMessage(err, t("loo.generator.errors.loadFailed", "Failed to load candidates.")));
            } finally {
                setLoading(false);
            }
        },
        [initSelectionMaps, q, refreshApprovals, resetResult, t]
    );

    useEffect(() => {
        load({ resetResult: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (debounceRef.current) {
            window.clearTimeout(debounceRef.current);
        }

        debounceRef.current = window.setTimeout(() => {
            load({ query: q });
        }, 350);

        return () => {
            if (debounceRef.current) {
                window.clearTimeout(debounceRef.current);
            }
        };
    }, [q, load]);

    useEffect(() => {
        if (pollRef.current) {
            window.clearInterval(pollRef.current);
        }

        pollRef.current = window.setInterval(() => {
            if (busy || loading) return;
            refreshApprovals(candidates.map((row) => row.sample_id));
        }, 12000);

        const onFocus = () => {
            if (busy || loading) return;
            refreshApprovals(candidates.map((row) => row.sample_id));
        };

        window.addEventListener("focus", onFocus);
        document.addEventListener("visibilitychange", onFocus);

        return () => {
            if (pollRef.current) {
                window.clearInterval(pollRef.current);
            }
            window.removeEventListener("focus", onFocus);
            document.removeEventListener("visibilitychange", onFocus);
        };
    }, [busy, loading, candidates, refreshApprovals]);

    const candidateById = useMemo(() => {
        return candidates.reduce<Record<number, CandidateSample>>((acc, row) => {
            acc[Number(row.sample_id)] = row;
            return acc;
        }, {});
    }, [candidates]);

    const itemsShown = useMemo(() => {
        if (statusFilter === "all") return candidates;

        return candidates.filter((sample) => {
            const state = approvals[sample.sample_id] ?? { OM: false, LH: false, ready: false };
            if (statusFilter === "ready") return !!state.ready;
            if (statusFilter === "needs_approval") return !state.ready;
            return true;
        });
    }, [approvals, candidates, statusFilter]);

    const selectedIds = useMemo(
        () =>
            Object.keys(selected)
                .filter((key) => selected[Number(key)])
                .map(Number),
        [selected]
    );

    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const selectedSamples = useMemo(
        () => candidates.filter((row) => selectedIdSet.has(Number(row.sample_id))),
        [candidates, selectedIdSet]
    );

    const selectedBatchIds = useMemo(
        () =>
            Array.from(
                new Set(
                    selectedSamples
                        .map((row) => String(row.request_batch_id ?? "").trim())
                        .filter(Boolean)
                )
            ),
        [selectedSamples]
    );

    const hasMixedBatchSelection = selectedBatchIds.length > 1;

    const readySelectedIds = useMemo(
        () =>
            selectedIds.filter((id) => approvals[id]?.ready).filter((id) => {
                if (!selectedBatchIds.length) return true;
                const sample = candidateById[id];
                return String(sample?.request_batch_id ?? "").trim() === selectedBatchIds[0];
            }),
        [approvals, candidateById, selectedBatchIds, selectedIds]
    );

    const anyReadyInList = useMemo(() => {
        return candidates.some((sample) => !!approvals[sample.sample_id]?.ready);
    }, [approvals, candidates]);

    const readyCountInList = useMemo(() => {
        return candidates.filter((sample) => !!approvals[sample.sample_id]?.ready).length;
    }, [approvals, candidates]);

    const selectedShownCount = useMemo(() => {
        return itemsShown.filter((sample) => !!selected[sample.sample_id]).length;
    }, [itemsShown, selected]);

    const toggleAllShown = (value: boolean) => {
        setSelected((prev) => {
            const next = { ...prev };
            for (const sample of itemsShown) {
                next[sample.sample_id] = value;
            }
            return next;
        });
    };

    const setApprovalFor = useCallback(
        async (sampleId: number, nextApproved: boolean) => {
            if (!actorRole) return;

            try {
                setBusy(true);
                setError(null);

                setApprovals((prev) => {
                    const current = prev[sampleId] ?? { OM: false, LH: false, ready: false };
                    const next = { ...current };

                    if (actorRole === "OM") next.OM = nextApproved;
                    if (actorRole === "LH") next.LH = nextApproved;
                    next.ready = !!(next.OM && next.LH);

                    return { ...prev, [sampleId]: next };
                });

                const res = await looService.setApproval(sampleId, nextApproved);

                setApprovals((prev) => ({
                    ...prev,
                    [sampleId]: {
                        OM: !!res.state.OM,
                        LH: !!res.state.LH,
                        ready: !!res.state.ready,
                    },
                }));
            } catch (err: any) {
                setError(getErrorMessage(err, t("loo.generator.errors.approvalFailed", "Failed to update approval.")));
                await refreshApprovals(candidates.map((row) => row.sample_id));
            } finally {
                setBusy(false);
            }
        },
        [actorRole, candidates, refreshApprovals, t]
    );

    const buildParamMapFor = (sampleIds: number[]): Record<number, number[]> => {
        const out: Record<number, number[]> = {};

        for (const sampleId of sampleIds) {
            const map = paramSel[sampleId] ?? {};
            out[sampleId] = Object.keys(map)
                .map(Number)
                .filter((parameterId) => map[parameterId]);
        }

        return out;
    };

    const generateDisabledReason = (() => {
        if (busy) return t(["processing", "common.processing"], "Processing…");
        if (candidates.length === 0) return t("loo.generator.disabled.noCandidates", "No candidates available.");
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

        if (readySelectedIds.length === 0) {
            setError(t("loo.generator.errors.noneReadySelected", "None of the selected samples are ready."));
            return;
        }

        if (hasMixedBatchSelection) {
            setError(
                t("loo.generator.errors.mixedBatch", "Institutional LOO cannot mix different request batches.")
            );
            return;
        }

        const paramMap = buildParamMapFor(readySelectedIds);

        for (const sampleId of readySelectedIds) {
            if (!paramMap[sampleId] || paramMap[sampleId].length === 0) {
                setError(
                    t("loo.generator.errors.paramRequiredForSample", "Select at least one parameter for sample #{{id}}.", {
                        id: sampleId,
                    })
                );
                return;
            }
        }

        try {
            setBusy(true);
            setError(null);
            resetResult();

            const res = await looService.generateForSamples(readySelectedIds, paramMap);
            const obj = (res as any)?.data ?? (res as any);

            const looNumber =
                typeof obj?.number === "string"
                    ? obj.number
                    : typeof obj?.loo_number === "string"
                        ? obj.loo_number
                        : null;

            setResultNumber(looNumber);
            setResultRecordNo(toStrOrNull(obj?.record_no ?? obj?.payload?.record_no));
            setResultFormCode(toStrOrNull(obj?.form_code ?? obj?.payload?.form_code));

            const url = resolveResultUrl(res);
            if (!url) {
                setError(t("loo.generator.errors.missingPreviewUrl", "Preview URL is missing."));
                return;
            }

            setResultUrl(url);
            await load({ resetResult: false, query: q });
        } catch (err: any) {
            setError(getErrorMessage(err, t("loo.generator.errors.generateFailed", "Failed to generate LOO.")));
        } finally {
            setBusy(false);
        }
    };

    const chipBase = "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold";
    const chipOk = "bg-emerald-50 text-emerald-700 border-emerald-200";
    const chipNeutral = "bg-gray-50 text-gray-700 border-gray-200";
    const chipWarn = "bg-amber-50 text-amber-800 border-amber-200";

    return (
        <div className="min-h-[60vh]">
            <div className="flex flex-col gap-3 px-0 py-2 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-lg font-bold text-gray-900 md:text-xl">
                        {t(["nav.looWorkspace", "loo.generator.title"], "LOO Workspace")}
                    </h1>
                    <p className="mt-1 text-xs text-gray-500">
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

            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-gray-100 bg-white px-4 py-4 md:flex-row md:items-center md:px-6">
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
                                className="w-full rounded-xl border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft"
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
                                    "focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-soft"
                                )}
                            >
                                <option value="all">{t("loo.generator.filters.statusAll", "All")}</option>
                                <option value="ready">{t("loo.generator.filters.statusReady", "Ready only")}</option>
                                <option value="needs_approval">{t("loo.generator.filters.statusNeedsApproval", "Needs approval")}</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
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

                <div className="px-4 py-4 md:px-6">
                    {error ? (
                        <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    ) : null}

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

                    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
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

                    {selectedBatchIds.length === 1 ? (
                        <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-xs text-sky-800">
                            {t("loo.generator.batch.selected", "Institutional batch selected")}: {selectedBatchIds[0]}
                        </div>
                    ) : null}

                    {hasMixedBatchSelection ? (
                        <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                            {t("loo.generator.batch.mixed", "Mixed institutional batches are not allowed in one LOO.")}
                        </div>
                    ) : null}

                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                            <span>{t(["loading", "common.loading"], "Loading…")}</span>
                        </div>
                    ) : itemsShown.length === 0 ? (
                        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center">
                            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-gray-500">
                                <FileText size={18} />
                            </div>
                            <div className="mt-3 text-sm font-semibold text-gray-900">
                                {t("loo.generator.emptyTitle", "No candidates found.")}
                            </div>
                            <div className="mx-auto mt-1 max-w-xl text-xs text-gray-500">
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
                            {itemsShown.map((sample) => {
                                const sampleId = sample.sample_id;
                                const state = approvals[sampleId] ?? { OM: false, LH: false, ready: false };
                                const checked = !!selected[sampleId];
                                const receivedAt = pickReceivedAt(sample);
                                const params = sample.requested_parameters ?? [];
                                const selectedParamMap = paramSel[sampleId] ?? {};
                                const readyChip = state.ready ? chipOk : chipWarn;
                                const myApproved = actorRole === "OM" ? state.OM : actorRole === "LH" ? state.LH : false;

                                return (
                                    <div
                                        key={sampleId}
                                        className={cx(
                                            "rounded-2xl border p-4",
                                            state.ready ? "border-emerald-200 bg-emerald-50/20" : "border-gray-200 bg-white"
                                        )}
                                    >
                                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                            <div className="flex items-start gap-3">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => setSelected((prev) => ({ ...prev, [sampleId]: e.target.checked }))}
                                                    disabled={busy}
                                                    className="mt-1"
                                                />

                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="text-sm font-semibold text-gray-900">
                                                            #{sampleId}{" "}
                                                            {sample.lab_sample_code ? (
                                                                <span className="ml-2 rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-xs">
                                                                    {sample.lab_sample_code}
                                                                </span>
                                                            ) : null}
                                                        </div>

                                                        <span className={cx(chipBase, readyChip)}>
                                                            {state.ready
                                                                ? t("loo.generator.approval.readyStatus", "Ready")
                                                                : t("loo.generator.approval.notReadyStatus", "Not ready")}
                                                        </span>

                                                        {sample.request_batch_id ? (
                                                            <span className={cx(chipBase, "bg-sky-50 text-sky-700 border-sky-200")}>
                                                                {t("loo.generator.batch.label", "Batch")} {sample.request_batch_id}
                                                                {sample.request_batch_item_no && sample.request_batch_total
                                                                    ? ` · ${sample.request_batch_item_no}/${sample.request_batch_total}`
                                                                    : ""}
                                                            </span>
                                                        ) : null}
                                                    </div>

                                                    <div className="mt-1 text-xs text-gray-600">
                                                        {sample.client?.name ?? NA}
                                                        {sample.client?.organization ? ` · ${sample.client.organization}` : ""}
                                                        {sample.sample_type ? ` · ${sample.sample_type}` : ""}
                                                    </div>

                                                    <div className="mt-1 text-[11px] text-gray-500">
                                                        {t("loo.generator.timestamps.verified", "Verified")}{" "}
                                                        {sample.verified_at ? formatDateTimeLocal(sample.verified_at) : NA} ·{" "}
                                                        {t("loo.generator.timestamps.received", "Received")}{" "}
                                                        {receivedAt ? formatDateTimeLocal(receivedAt) : NA}
                                                    </div>

                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <span className={cx(chipBase, state.OM ? chipOk : chipNeutral)}>
                                                            {t("loo.generator.approval.om", "OM")}:{" "}
                                                            {state.OM
                                                                ? t("loo.generator.approval.approved", "Approved")
                                                                : t("loo.generator.approval.pending", "Pending")}
                                                        </span>
                                                        <span className={cx(chipBase, state.LH ? chipOk : chipNeutral)}>
                                                            {t("loo.generator.approval.lh", "LH")}:{" "}
                                                            {state.LH
                                                                ? t("loo.generator.approval.approved", "Approved")
                                                                : t("loo.generator.approval.pending", "Pending")}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-end gap-2">
                                                {canAct ? (
                                                    myApproved ? (
                                                        <button
                                                            type="button"
                                                            className="btn-outline"
                                                            onClick={() => setApprovalFor(sampleId, false)}
                                                            disabled={busy}
                                                            title={t("loo.generator.approval.revokeHint", "Revoke your approval")}
                                                        >
                                                            {t("loo.generator.approval.revoke", "Revoke")}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            className="lims-btn-primary"
                                                            onClick={() => setApprovalFor(sampleId, true)}
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

                                        {checked ? (
                                            <div className="mt-4">
                                                <div className="mb-2 text-xs font-semibold text-gray-800">
                                                    {t("loo.generator.params.title", "Parameters")}{" "}
                                                    <span className="text-gray-500">
                                                        {t("loo.generator.params.minOne", "(pick at least one)")}
                                                    </span>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {params.length > 0 ? (
                                                        params.map((parameter) => {
                                                            const parameterId = parameter.parameter_id;
                                                            const active = !!selectedParamMap[parameterId];
                                                            const fallback = t("loo.generator.params.fallback", "Parameter #{{id}}", {
                                                                id: parameterId,
                                                            });
                                                            const label =
                                                                (parameter.code ? `${parameter.code} — ` : "") + (parameter.name ?? fallback);

                                                            return (
                                                                <button
                                                                    key={parameterId}
                                                                    type="button"
                                                                    className={cx(
                                                                        "inline-flex items-center rounded-full border px-3 py-1 text-xs",
                                                                        active
                                                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                                            : "border-gray-200 bg-gray-50 text-gray-700"
                                                                    )}
                                                                    onClick={() =>
                                                                        setParamSel((prev) => ({
                                                                            ...prev,
                                                                            [sampleId]: {
                                                                                ...(prev[sampleId] ?? {}),
                                                                                [parameterId]: !active,
                                                                            },
                                                                        }))
                                                                    }
                                                                    disabled={busy}
                                                                    aria-pressed={active}
                                                                    title={label}
                                                                >
                                                                    {label}
                                                                </button>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-xs text-gray-500">
                                                            {t("loo.generator.params.none", "No parameters found.")}
                                                        </span>
                                                    )}
                                                </div>

                                                {!state.ready ? (
                                                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
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

                    <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
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

                            <div className="mt-3 flex flex-wrap items-center gap-2">
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