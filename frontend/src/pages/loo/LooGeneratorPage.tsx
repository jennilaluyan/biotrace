// L:\Campus\Final Countdown\biotrace\frontend\src\pages\loo\LooGeneratorPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import { getUserRoleLabel } from "../../utils/roles";
import { formatDateTimeLocal } from "../../utils/date";

import { apiGet } from "../../services/api";
import { looService } from "../../services/loo";
import { ReportPreviewModal } from "../../components/reports/ReportPreviewModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function SearchIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="11" cy="11" r="6" />
            <line x1="16" y1="16" x2="21" y2="21" />
        </svg>
    );
}

function InfoIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
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

export function LooGeneratorPage() {
    const { user } = useAuth();
    const roleLabel = getUserRoleLabel(user);
    const actorRole = getActorRoleCode(roleLabel);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [items, setItems] = useState<CandidateSample[]>([]);
    const [q, setQ] = useState("");

    // approvals per sample
    const [approvals, setApprovals] = useState<Record<number, ApprovalState>>({});

    // selection
    const [selected, setSelected] = useState<Record<number, boolean>>({});
    const [paramSel, setParamSel] = useState<Record<number, Record<number, boolean>>>({});

    // result
    const [busy, setBusy] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [resultNumber, setResultNumber] = useState<string | null>(null);

    // preview modal
    const [previewOpen, setPreviewOpen] = useState(false);

    const canToggleOM = actorRole === "OM";
    const canToggleLH = actorRole === "LH";

    const debounceRef = useRef<number | null>(null);

    const normalizeUrlToSameOriginPath = (url: string): string => {
        const raw = String(url || "").trim();
        if (!raw) return raw;

        if (/^https?:\/\//i.test(raw)) {
            try {
                const u = new URL(raw);
                const p = (u.pathname || "") + (u.search || "");
                return p || raw;
            } catch {
                return raw;
            }
        }
        return raw;
    };

    const resolveResultUrl = (res: any): string | null => {
        const obj = res?.data ?? res;

        const dl = obj?.download_url ?? res?.download_url;
        if (typeof dl === "string" && dl.trim() !== "") return normalizeUrlToSameOriginPath(dl);

        const pdf = obj?.pdf_url ?? res?.pdf_url;
        if (typeof pdf === "string" && pdf.trim() !== "") return normalizeUrlToSameOriginPath(pdf);

        const loId = obj?.lo_id ?? obj?.loo_id ?? obj?.id ?? res?.lo_id ?? res?.id;
        if (typeof loId === "number" && loId > 0) {
            return `/api/v1/reports/documents/loo/${loId}/pdf`;
        }

        const fu = obj?.file_url ?? res?.file_url;
        if (typeof fu === "string" && fu.trim() !== "") {
            const s = normalizeUrlToSameOriginPath(fu);
            if (/^https?:\/\//i.test(s)) return s;
            if (s.startsWith("/api/") || s.startsWith("/v1/")) return s;
        }

        return null;
    };

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

    const load = async (opts?: { resetResult?: boolean; query?: string }) => {
        const resetResult = opts?.resetResult ?? false;
        const query = (opts?.query ?? q).trim();

        try {
            setLoading(true);
            setError(null);

            if (resetResult) {
                setResultUrl(null);
                setResultNumber(null);
                setPreviewOpen(false);
            }

            const res = await apiGet<any>("/v1/samples/requests", {
                params: { mode: "loo_candidates", q: query || undefined },
            });

            const data = (res?.data?.data ?? res?.data ?? res) as any[];
            const list: CandidateSample[] = Array.isArray(data) ? data : [];
            setItems(list);

            // init selection maps (keep it predictable: default unchecked, default params checked)
            const nextSelected: Record<number, boolean> = {};
            const nextParamSel: Record<number, Record<number, boolean>> = {};
            for (const s of list) {
                nextSelected[s.sample_id] = false;
                const map: Record<number, boolean> = {};
                for (const p of s.requested_parameters ?? []) {
                    map[p.parameter_id] = true;
                }
                nextParamSel[s.sample_id] = map;
            }
            setSelected(nextSelected);
            setParamSel(nextParamSel);

            // approvals (IMPORTANT: must show both OM & LH status to anyone)
            try {
                const ids = list.map((x) => x.sample_id);
                if (ids.length) {
                    // Expectation: backend returns { [sampleId]: { OM: bool, LH: bool, ready: bool } }
                    const st = await looService.getApprovals(ids);

                    const next: Record<number, ApprovalState> = {};
                    for (const sid of ids) {
                        const row = (st as any)?.[sid] ?? (st as any)?.data?.[sid] ?? null;
                        next[sid] = {
                            OM: !!row?.OM,
                            LH: !!row?.LH,
                            ready: !!row?.ready,
                        };
                    }
                    setApprovals(next);
                } else {
                    setApprovals({});
                }
            } catch {
                const next: Record<number, ApprovalState> = {};
                for (const s of list) next[s.sample_id] = { OM: false, LH: false, ready: false };
                setApprovals(next);
            }
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.message ??
                "Failed to load LOO candidates.";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load({ resetResult: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Debounced search reload (so it feels like SamplesPage filters)
    useEffect(() => {
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        debounceRef.current = window.setTimeout(() => {
            load({ query: q });
        }, 350);

        return () => {
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q]);

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

    const toggleAll = (v: boolean) => {
        setSelected((prev) => {
            const next = { ...prev };
            for (const s of items) next[s.sample_id] = v;
            return next;
        });
    };

    const setApprovalFor = async (sampleId: number, nextApproved: boolean) => {
        try {
            setBusy(true);
            setError(null);

            // Optimistic UI: update immediately
            setApprovals((prev) => {
                const cur = prev[sampleId] ?? { OM: false, LH: false, ready: false };
                const next = { ...cur };
                if (actorRole === "OM") next.OM = nextApproved;
                if (actorRole === "LH") next.LH = nextApproved;
                next.ready = !!(next.OM && next.LH);
                return { ...prev, [sampleId]: next };
            });

            const res = await looService.setApproval(sampleId, nextApproved);

            // Server truth wins (and should include OM+LH state)
            const st = (res as any)?.state ?? (res as any)?.data?.state ?? (res as any);
            if (st && typeof st === "object") {
                setApprovals((p) => ({
                    ...p,
                    [sampleId]: { OM: !!st.OM, LH: !!st.LH, ready: !!st.ready },
                }));
            } else {
                // fallback: refetch approvals for this list
                const ids = items.map((x) => x.sample_id);
                if (ids.length) {
                    const all = await looService.getApprovals(ids);
                    const next: Record<number, ApprovalState> = {};
                    for (const sid of ids) {
                        const row = (all as any)?.[sid] ?? (all as any)?.data?.[sid] ?? null;
                        next[sid] = { OM: !!row?.OM, LH: !!row?.LH, ready: !!row?.ready };
                    }
                    setApprovals(next);
                }
            }
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.message ??
                "Gagal update approval.";
            setError(msg);

            // rollback by refetch (safe)
            try {
                const ids = items.map((x) => x.sample_id);
                if (ids.length) {
                    const all = await looService.getApprovals(ids);
                    const next: Record<number, ApprovalState> = {};
                    for (const sid of ids) {
                        const row = (all as any)?.[sid] ?? (all as any)?.data?.[sid] ?? null;
                        next[sid] = { OM: !!row?.OM, LH: !!row?.LH, ready: !!row?.ready };
                    }
                    setApprovals(next);
                }
            } catch {
                // ignore
            }
        } finally {
            setBusy(false);
        }
    };

    const generate = async () => {
        if (busy) return;

        if (!selectedIds.length) {
            setError("Pilih minimal 1 sampel.");
            return;
        }

        if (!readySelectedIds.length) {
            setError("Belum ada sampel Ready (OM ✅ dan LH ✅).");
            return;
        }

        const map = buildParamMapFor(readySelectedIds);
        for (const sid of readySelectedIds) {
            if (!map[sid] || map[sid].length === 0) {
                setError(`Parameter uji untuk sample #${sid} belum dipilih (minimal 1).`);
                return;
            }
        }

        try {
            setBusy(true);
            setError(null);
            setResultUrl(null);
            setResultNumber(null);
            setPreviewOpen(false);

            const res = await looService.generateForSamples(readySelectedIds, map);

            const obj = (res as any)?.data ?? (res as any);
            const looNumber =
                typeof obj?.number === "string"
                    ? (obj.number as string)
                    : typeof obj?.loo_number === "string"
                        ? (obj.loo_number as string)
                        : null;

            setResultNumber(looNumber);

            const url = resolveResultUrl(res);
            if (!url) {
                setError("LOO berhasil dibuat, tapi URL preview/download tidak tersedia (butuh download_url / pdf_url / lo_id).");
                return;
            }

            setResultUrl(url);

            // refresh list after generating (result stays visible)
            await load({ resetResult: false, query: q });
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.message ??
                "Gagal generate LOO.";
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    const chipBase = "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold";
    const statusOn = "bg-emerald-50 text-emerald-700 border-emerald-200";
    const statusOff = "bg-gray-50 text-gray-700 border-gray-200";
    const readyOn = "bg-emerald-100 text-emerald-800 border-emerald-200";
    const readyOff = "bg-amber-50 text-amber-800 border-amber-200";

    const generateDisabledReason = (() => {
        if (busy) return "Sedang memproses…";
        if (items.length === 0) return "Belum ada kandidat sampel.";
        if (!anyReadyInList) return "Belum ada sampel Ready (butuh OM ✅ dan LH ✅).";
        if (readySelectedIds.length === 0) return "Pilih minimal 1 sampel yang Ready.";
        return "";
    })();

    return (
        <div className="min-h-[60vh]">
            {/* Header (match SamplesPage) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <h1 className="text-lg md:text-xl font-bold text-gray-900">LOO Generator</h1>

                <div className="text-xs text-gray-600">
                    <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                        <span className="text-gray-500">Role:</span>
                        <span className="font-semibold text-gray-900">{roleLabel}</span>
                    </div>
                </div>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar (match SamplesPage style) */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="loo-search">
                            Search samples
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <SearchIcon />
                            </span>
                            <input
                                id="loo-search"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") load({ query: q });
                                }}
                                placeholder="Search client / lab code / sample type…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-auto flex flex-col sm:flex-row gap-2">
                        <button
                            type="button"
                            className="btn-outline"
                            onClick={() => load({ query: q })}
                            disabled={loading || busy}
                            title={busy ? "Sedang memproses…" : "Ambil ulang kandidat sampel"}
                        >
                            Refresh
                        </button>

                        <button
                            type="button"
                            className="btn-outline"
                            onClick={() => toggleAll(true)}
                            disabled={busy || items.length === 0}
                            title={items.length === 0 ? "Tidak ada sampel" : "Pilih semua"}
                        >
                            Select all
                        </button>

                        <button
                            type="button"
                            className="btn-outline"
                            onClick={() => toggleAll(false)}
                            disabled={busy || items.length === 0}
                            title={items.length === 0 ? "Tidak ada sampel" : "Bersihkan pilihan"}
                        >
                            Clear
                        </button>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-4">
                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    )}

                    {/* Minimal guidance */}
                    <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                        <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-gray-500">
                                <InfoIcon />
                            </span>
                            <div className="text-xs">
                                Sampel dianggap <b>Ready</b> jika <b>OM ready</b> dan <b>LH ready</b>. Hanya sampel Ready yang bisa dibuatkan LOO.
                            </div>
                        </div>
                    </div>

                    {/* Summary strip */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 mb-4">
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            Selected: <span className="font-semibold text-gray-900">{selectedIds.length}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            Ready (selected): <span className="font-semibold text-gray-900">{readySelectedIds.length}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            Ready (in list): <span className="font-semibold text-gray-900">{readyCountInList}</span>
                        </span>
                    </div>

                    {loading ? (
                        <div className="text-sm text-gray-600">Loading candidates…</div>
                    ) : items.length === 0 ? (
                        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center">
                            <div className="mx-auto h-10 w-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500">
                                <InfoIcon />
                            </div>
                            <div className="mt-3 text-sm font-semibold text-gray-900">Tidak ada kandidat</div>
                            <div className="mt-1 text-xs text-gray-500 max-w-xl mx-auto">
                                Sampel akan muncul di sini setelah selesai diverifikasi dan masuk waiting room LOO.
                            </div>
                            <div className="mt-4">
                                <button type="button" className="btn-outline" onClick={() => load({ query: q })} disabled={busy}>
                                    Refresh
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {items.map((s) => {
                                const sid = s.sample_id;
                                const checked = !!selected[sid];

                                const rx =
                                    s.received_at ??
                                    s.physically_received_at ??
                                    s.admin_received_from_client_at ??
                                    null;

                                const params = s.requested_parameters ?? [];
                                const selMap = paramSel[sid] ?? {};

                                const st = approvals[sid] ?? { OM: false, LH: false, ready: false };

                                const rowBorder = st.ready ? "border-emerald-200" : "border-gray-200";
                                const rowBg = checked
                                    ? "bg-amber-50/20 border-amber-200"
                                    : st.ready
                                        ? "bg-emerald-50/20"
                                        : "bg-white";

                                return (
                                    <div key={sid} className={cx("rounded-2xl border p-4", rowBorder, rowBg)}>
                                        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                            {/* Left: selection + identity */}
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => setSelected((p) => ({ ...p, [sid]: e.target.checked }))}
                                                    disabled={busy}
                                                    className="mt-1"
                                                />
                                                <div>
                                                    <div className="text-sm font-semibold text-gray-900">
                                                        #{sid}{" "}
                                                        {s.lab_sample_code ? (
                                                            <span className="ml-2 font-mono text-xs bg-white border border-gray-200 rounded-full px-3 py-1">
                                                                {s.lab_sample_code}
                                                            </span>
                                                        ) : null}
                                                    </div>

                                                    <div className="text-xs text-gray-600 mt-1">
                                                        {s.client?.name ?? "-"}
                                                        {s.client?.organization ? ` · ${s.client.organization}` : ""}
                                                        {s.sample_type ? ` · ${s.sample_type}` : ""}
                                                    </div>

                                                    <div className="text-[11px] text-gray-500 mt-1">
                                                        Verified: {s.verified_at ? formatDateTimeLocal(s.verified_at) : "-"} ·{" "}
                                                        Received: {rx ? formatDateTimeLocal(rx) : "-"}
                                                    </div>

                                                    {/* Approval buttons */}
                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                chipBase,
                                                                st.OM ? statusOn : statusOff,
                                                                canToggleOM ? "cursor-pointer" : "cursor-not-allowed opacity-80"
                                                            )}
                                                            onClick={canToggleOM ? () => setApprovalFor(sid, !st.OM) : undefined}
                                                            disabled={!canToggleOM || busy}
                                                            title={canToggleOM ? "Toggle persetujuan OM" : "Hanya OM yang bisa mengubah ini"}
                                                        >
                                                            OM {st.OM ? "ready" : "not ready"}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                chipBase,
                                                                st.LH ? statusOn : statusOff,
                                                                canToggleLH ? "cursor-pointer" : "cursor-not-allowed opacity-80"
                                                            )}
                                                            onClick={canToggleLH ? () => setApprovalFor(sid, !st.LH) : undefined}
                                                            disabled={!canToggleLH || busy}
                                                            title={canToggleLH ? "Toggle persetujuan LH" : "Hanya LH yang bisa mengubah ini"}
                                                        >
                                                            LH {st.LH ? "ready" : "not ready"}
                                                        </button>

                                                        <span
                                                            className={cx(chipBase, st.ready ? readyOn : readyOff)}
                                                            title={st.ready ? "Ready: OM & LH sudah approve" : "Not ready: masih butuh approve"}
                                                        >
                                                            {st.ready ? "Ready" : "Not ready"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </label>
                                        </div>

                                        {/* Parameters (only when selected) */}
                                        {checked ? (
                                            <div className="mt-3">
                                                <div className="text-xs font-semibold text-gray-800 mb-2">
                                                    Parameters to test <span className="text-gray-500">(minimal 1)</span>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    {params.length ? (
                                                        params.map((p) => {
                                                            const pid = p.parameter_id;
                                                            const on = !!selMap[pid];
                                                            const label =
                                                                (p.code ? `${p.code} — ` : "") + (p.name ?? `Parameter #${pid}`);

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
                                                                    title={label}
                                                                >
                                                                    {label}
                                                                </button>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-xs text-gray-500">No requested parameters.</span>
                                                    )}
                                                </div>

                                                {!st.ready ? (
                                                    <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                                        Boleh pilih parameter dulu, tapi LOO hanya bisa dibuat setelah <b>Ready</b>.
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
                                    <InfoIcon />
                                </span>
                                Generate hanya untuk sampel yang <b>Ready</b>.
                            </span>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                className="btn-outline"
                                onClick={() => {
                                    setResultUrl(null);
                                    setResultNumber(null);
                                    setPreviewOpen(false);
                                }}
                                disabled={busy}
                                title="Bersihkan hasil (tidak menghapus LOO di backend)"
                            >
                                Reset Result
                            </button>

                            <button
                                type="button"
                                className="lims-btn-primary"
                                onClick={generate}
                                disabled={busy || readySelectedIds.length === 0}
                                title={generateDisabledReason}
                            >
                                {busy ? "Generating..." : "Generate LOO PDF"}
                            </button>
                        </div>
                    </div>

                    {/* Result */}
                    {resultUrl ? (
                        <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            <div className="font-semibold">LOO berhasil dibuat</div>
                            <div className="mt-1">
                                Number: <span className="font-mono">{resultNumber ?? "-"}</span>
                            </div>

                            <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <button type="button" className="btn-outline" onClick={() => setPreviewOpen(true)}>
                                    Open Preview
                                </button>
                                <span className="text-xs text-emerald-800">(Download tersedia dari viewer)</span>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            <ReportPreviewModal
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                pdfUrl={resultUrl}
                title={resultNumber ? `LOO ${resultNumber}` : "LOO PDF Preview"}
            />
        </div>
    );
}
