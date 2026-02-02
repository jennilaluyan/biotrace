// L:\Campus\Final Countdown\biotrace\frontend\src\components\loo\LooBatchGenerator.tsx
import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../services/api";
import { looService } from "../../services/loo";
import { formatDateTimeLocal } from "../../utils/date";
import { ReportPreviewModal } from "../reports/ReportPreviewModal";

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

type Props = {
    roleLabel: string;
};

type ApprovalState = { OM: boolean; LH: boolean; ready: boolean };

function normalizeRole(label: string) {
    return String(label || "").trim().toLowerCase();
}

/**
 * Derive role code used by backend approvals from the visible label.
 * Keep this forgiving (labels can change slightly).
 */
function getActorRoleCode(roleLabel: string): "OM" | "LH" | null {
    const r = normalizeRole(roleLabel);
    if (r === "om" || r.includes("operational manager")) return "OM";
    if (r === "lh" || r.includes("laboratory head") || r.includes("lab head")) return "LH";
    return null;
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

export default function LooBatchGenerator({ roleLabel }: Props) {
    const actorRole = getActorRoleCode(roleLabel);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [items, setItems] = useState<CandidateSample[]>([]);
    const [q, setQ] = useState("");

    // approvals
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

    const load = async (opts?: { resetResult?: boolean }) => {
        const resetResult = opts?.resetResult ?? true;

        try {
            setLoading(true);
            setError(null);

            if (resetResult) {
                setResultUrl(null);
                setResultNumber(null);
                setPreviewOpen(false);
            }

            const res = await apiGet<any>("/v1/samples/requests", {
                params: { mode: "loo_candidates", q: q.trim() || undefined },
            });

            const data = (res?.data?.data ?? res?.data ?? res) as any[];
            const list: CandidateSample[] = Array.isArray(data) ? data : [];

            setItems(list);

            // init selection maps
            const nextSelected: Record<number, boolean> = {};
            const nextParamSel: Record<number, Record<number, boolean>> = {};
            for (const s of list) {
                nextSelected[s.sample_id] = false;
                const map: Record<number, boolean> = {};
                for (const p of s.requested_parameters ?? []) {
                    map[p.parameter_id] = true; // default: all selected
                }
                nextParamSel[s.sample_id] = map;
            }
            setSelected(nextSelected);
            setParamSel(nextParamSel);

            // load approvals for the current list
            try {
                const ids = list.map((x) => x.sample_id);
                if (ids.length) {
                    const st = await looService.getApprovals(ids);
                    const next: Record<number, ApprovalState> = {};
                    for (const sid of ids) {
                        const row = st?.[sid];
                        next[sid] = { OM: !!row?.OM, LH: !!row?.LH, ready: !!row?.ready };
                    }
                    setApprovals(next);
                } else {
                    setApprovals({});
                }
            } catch {
                // don't block render if approvals fetch fails
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
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const normalizeUrlToSameOriginPath = (url: string): string => {
        const raw = String(url || "").trim();
        if (!raw) return raw;

        // If absolute, strip origin -> return pathname+search
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
        // backend often returns { message, data: loa }
        const obj = res?.data ?? res;

        // 1) Ideal: backend gives download_url
        const dl = obj?.download_url ?? res?.download_url;
        if (typeof dl === "string" && dl.trim() !== "") return normalizeUrlToSameOriginPath(dl);

        // 2) Also accept pdf_url
        const pdf = obj?.pdf_url ?? res?.pdf_url;
        if (typeof pdf === "string" && pdf.trim() !== "") return normalizeUrlToSameOriginPath(pdf);

        // 3) If we have an id, always use the secure endpoint (same-origin)
        const loId = obj?.lo_id ?? obj?.loo_id ?? obj?.id ?? res?.lo_id ?? res?.id;
        if (typeof loId === "number" && loId > 0) {
            return `/api/v1/reports/documents/loo/${loId}/pdf`;
        }

        // 4) legacy fallback (only if truly public/absolute)
        const fu = obj?.file_url ?? res?.file_url;
        if (typeof fu === "string" && fu.trim() !== "") {
            const s = normalizeUrlToSameOriginPath(fu);
            if (/^https?:\/\//i.test(s)) return s;
            if (s.startsWith("/api/") || s.startsWith("/v1/")) return s;
        }

        return null;
    };

    const setApprovalFor = async (sampleId: number, nextApproved: boolean) => {
        try {
            setBusy(true);
            setError(null);
            const res = await looService.setApproval(sampleId, nextApproved);
            setApprovals((p) => ({ ...p, [sampleId]: res.state }));
        } catch (err: any) {
            const msg =
                err?.response?.data?.message ??
                err?.data?.message ??
                err?.message ??
                "Gagal update approval.";
            setError(msg);
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

        // Step 2 gate: only intersection approved (ready)
        if (!readySelectedIds.length) {
            setError("Belum ada sampel yang disetujui oleh OM dan LH (Ready).");
            return;
        }

        // ensure each READY sample has at least 1 parameter selected
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

            // service biasanya balikin { message, data: { ... } }
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
                setError(
                    "LOO berhasil dibuat, tapi URL untuk preview/download tidak tersedia. Pastikan backend mengembalikan download_url atau lo_id."
                );
                return;
            }

            setResultUrl(url);

            // ✅ Step 4: refresh list but keep generated result visible
            await load({ resetResult: false });
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

    const toggleAll = (v: boolean) => {
        setSelected((prev) => {
            const next = { ...prev };
            for (const s of items) next[s.sample_id] = v;
            return next;
        });
    };

    if (loading) {
        return <div className="text-sm text-gray-600">Loading LOO candidates...</div>;
    }

    const chipBase = "inline-flex items-center rounded-full border px-3 py-1 text-xs";
    const chipOn = "bg-emerald-50 text-emerald-700 border-emerald-200";
    const chipOff = "bg-gray-50 text-gray-700 border-gray-200";
    const readyOn = "bg-emerald-100 text-emerald-800 border-emerald-200";
    const readyOff = "bg-amber-50 text-amber-800 border-amber-200";

    const canToggleOM = actorRole === "OM";
    const canToggleLH = actorRole === "LH";

    const generateDisabledReason = (() => {
        if (busy) return "Sedang memproses…";
        if (items.length === 0) return "Belum ada kandidat sampel di waiting room.";
        if (!anyReadyInList) return "Butuh persetujuan OM & LH (minimal 1 sampel Ready).";
        if (readySelectedIds.length === 0) return "Pilih minimal 1 sampel yang statusnya Ready.";
        return "";
    })();

    return (
        <>
            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-start md:justify-between">
                    <div>
                        <div className="text-lg font-bold text-gray-900">LOO Generator</div>
                        <div className="mt-1 text-xs text-gray-500 max-w-2xl">
                            LOO Generator adalah <b>ruang tunggu</b>. Sampel baru dianggap{" "}
                            <b>Ready</b> jika <b>OM</b> dan <b>LH</b> sama-sama menyetujui.
                            Hanya sampel <b>Ready</b> yang bisa masuk ke LOO.
                        </div>

                        {/* Legend / guidance */}
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                            <span className="inline-flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                                Ready = OM ✅ & LH ✅
                            </span>
                            <span className="inline-flex items-center gap-2">
                                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                                Not ready = masih kurang salah satu persetujuan
                            </span>
                        </div>
                    </div>

                    <div className="text-xs text-gray-600">
                        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                            <span className="text-gray-500">Role:</span>
                            <span className="font-semibold text-gray-900">{roleLabel}</span>
                        </div>
                    </div>
                </div>

                {/* Body */}
                <div className="px-4 md:px-6 py-4">
                    {error ? (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {error}
                        </div>
                    ) : null}

                    {!actorRole ? (
                        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 text-amber-700">
                                    <InfoIcon />
                                </span>
                                <div>
                                    Role kamu tidak terbaca sebagai <b>OM</b> atau <b>LH</b>, jadi tombol approval akan nonaktif.
                                    Kamu tetap bisa melihat status Ready/Not ready.
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                            <div className="flex items-start gap-2">
                                <span className="mt-0.5 text-gray-500">
                                    <InfoIcon />
                                </span>
                                <div>
                                    Kamu sebagai <b>{actorRole}</b>: klik chip <b>{actorRole}</b> untuk menyetujui sampel masuk LOO berikutnya.
                                    LOO hanya bisa dibuat bila ada minimal 1 sampel <b>Ready</b>.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Controls bar (match ClientsPage style) */}
                    <div className="flex flex-col md:flex-row gap-3 md:items-center">
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
                                    placeholder="Search client / lab code / sample type…"
                                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 justify-end">
                            <button
                                type="button"
                                className="btn-outline"
                                onClick={() => load()}
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
                                title={items.length === 0 ? "Tidak ada sampel untuk dipilih" : "Pilih semua sampel di list"}
                            >
                                Select all
                            </button>
                            <button
                                type="button"
                                className="btn-outline"
                                onClick={() => toggleAll(false)}
                                disabled={busy || items.length === 0}
                                title={items.length === 0 ? "Tidak ada sampel untuk dibersihkan" : "Bersihkan pilihan"}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {/* Summary strip */}
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            Selected: <span className="font-semibold text-gray-900">{selectedIds.length}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            Ready (selected): <span className="font-semibold text-gray-900">{readySelectedIds.length}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                            Ready (in list):{" "}
                            <span className="font-semibold text-gray-900">
                                {items.filter((s) => approvals[s.sample_id]?.ready).length}
                            </span>
                        </span>
                    </div>

                    {/* Empty state */}
                    {items.length === 0 ? (
                        <div className="mt-5 rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center">
                            <div className="mx-auto h-10 w-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500">
                                <InfoIcon />
                            </div>
                            <div className="mt-3 text-sm font-semibold text-gray-900">Belum ada kandidat sampel</div>
                            <div className="mt-1 text-xs text-gray-500 max-w-xl mx-auto">
                                Tidak ada sampel yang memenuhi syarat untuk masuk ruang tunggu LOO saat ini. Biasanya ini terjadi
                                jika belum ada sampel yang selesai diverifikasi, atau sampel sudah dipromosikan setelah LOO dibuat.
                            </div>
                            <div className="mt-4">
                                <button type="button" className="btn-outline" onClick={() => load()} disabled={busy}>
                                    Refresh
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4 space-y-3">
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
                                    <div
                                        key={sid}
                                        className={cx("rounded-2xl border p-4", rowBorder, rowBg)}
                                    >
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
                                                        Verified: {s.verified_at ? formatDateTimeLocal(s.verified_at) : "-"} ·
                                                        {" "}Received: {rx ? formatDateTimeLocal(rx) : "-"}
                                                    </div>

                                                    {/* Step 5: clearer chips + tooltips */}
                                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                chipBase,
                                                                st.OM ? chipOn : chipOff,
                                                                canToggleOM ? "cursor-pointer" : "cursor-not-allowed opacity-80"
                                                            )}
                                                            onClick={canToggleOM ? () => setApprovalFor(sid, !st.OM) : undefined}
                                                            disabled={!canToggleOM || busy}
                                                            title={
                                                                canToggleOM
                                                                    ? "Klik untuk setuju/tidak setuju (persetujuan OM)"
                                                                    : "Hanya OM yang bisa mengubah persetujuan OM"
                                                            }
                                                        >
                                                            OM: {st.OM ? "Approved" : "Not yet"}
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                chipBase,
                                                                st.LH ? chipOn : chipOff,
                                                                canToggleLH ? "cursor-pointer" : "cursor-not-allowed opacity-80"
                                                            )}
                                                            onClick={canToggleLH ? () => setApprovalFor(sid, !st.LH) : undefined}
                                                            disabled={!canToggleLH || busy}
                                                            title={
                                                                canToggleLH
                                                                    ? "Klik untuk setuju/tidak setuju (persetujuan LH)"
                                                                    : "Hanya LH yang bisa mengubah persetujuan LH"
                                                            }
                                                        >
                                                            LH: {st.LH ? "Approved" : "Not yet"}
                                                        </button>

                                                        <span
                                                            className={cx(
                                                                chipBase,
                                                                st.ready ? readyOn : readyOff
                                                            )}
                                                            title={
                                                                st.ready
                                                                    ? "Ready: OM dan LH sudah menyetujui sampel ini untuk masuk LOO"
                                                                    : "Not ready: masih butuh persetujuan OM atau LH"
                                                            }
                                                        >
                                                            {st.ready ? "Ready for LOO" : "Not ready"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </label>

                                            {/* Right: micro-hint */}
                                            <div className="text-[11px] text-gray-500 md:text-right md:max-w-sm">
                                                <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1">
                                                    <span className="text-gray-500">Tip:</span>
                                                    <span className="text-gray-700">
                                                        Approve = “boleh masuk LOO berikutnya”. Kedua persetujuan wajib.
                                                    </span>
                                                </div>
                                            </div>
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
                                                        Sampel ini belum <b>Ready</b>. Kamu boleh pilih parameter dulu, tapi LOO tetap tidak bisa dibuat
                                                        sampai OM & LH approve.
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
                                LOO hanya bisa dibuat jika ada minimal 1 sampel <b>Ready</b> (irisan OM ∩ LH).
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
                                title="Bersihkan hasil generate (tidak menghapus LOO di backend)"
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

                    {/* Disabled reason helper */}
                    {(!busy && (readySelectedIds.length === 0 || !anyReadyInList)) && (
                        <div className="mt-3 text-xs text-gray-600">
                            <span className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                <span className="text-gray-500">
                                    <InfoIcon />
                                </span>
                                <span>
                                    {items.length === 0
                                        ? "Belum ada kandidat sampel."
                                        : !anyReadyInList
                                            ? "Belum ada sampel Ready. Minta OM & LH menyetujui sampel yang sama."
                                            : "Pilih minimal 1 sampel yang statusnya Ready untuk generate LOO."}
                                </span>
                            </span>
                        </div>
                    )}

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
                                <span className="text-xs text-emerald-800">(Download tersedia dari viewer di preview)</span>
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
        </>
    );
}
