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

export default function LooBatchGenerator({ roleLabel }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [items, setItems] = useState<CandidateSample[]>([]);
    const [q, setQ] = useState("");

    // selection
    const [selected, setSelected] = useState<Record<number, boolean>>({});
    const [paramSel, setParamSel] = useState<Record<number, Record<number, boolean>>>({});

    // result
    const [busy, setBusy] = useState(false);
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [resultNumber, setResultNumber] = useState<string | null>(null);

    // preview modal
    const [previewOpen, setPreviewOpen] = useState(false);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);
            setResultUrl(null);
            setResultNumber(null);
            setPreviewOpen(false);

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

    const buildParamMap = (): Record<number, number[]> => {
        const out: Record<number, number[]> = {};
        for (const sid of selectedIds) {
            const map = paramSel[sid] ?? {};
            const ids = Object.keys(map)
                .map((k) => Number(k))
                .filter((pid) => map[pid]);
            out[sid] = ids;
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

    const generate = async () => {
        if (busy) return;
        if (!selectedIds.length) {
            setError("Pilih minimal 1 sampel.");
            return;
        }

        // ensure each selected sample has at least 1 parameter selected
        const map = buildParamMap();
        for (const sid of selectedIds) {
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

            const res = await looService.generateForSamples(selectedIds, map);

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

    return (
        <>
            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <div className="text-sm font-bold text-gray-900">Generate Letter of Order (LOO)</div>
                        <div className="text-xs text-gray-500 mt-1">
                            Pilih sampel yang sudah <span className="font-semibold">verified</span> & punya{" "}
                            <span className="font-semibold">lab sample code</span>, lalu pilih parameter uji.
                        </div>
                    </div>
                    <div className="text-[11px] text-gray-500">
                        You are: <span className="font-semibold">{roleLabel}</span>
                    </div>
                </div>

                <div className="px-5 py-4">
                    {error ? (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                            {error}
                        </div>
                    ) : null}

                    <div className="flex items-center gap-2 flex-wrap">
                        <input
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search client / code / sample type..."
                            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        />
                        <button type="button" className="lims-btn" onClick={load} disabled={loading || busy}>
                            Refresh
                        </button>

                        <div className="ml-auto flex items-center gap-2">
                            <button type="button" className="lims-btn" onClick={() => toggleAll(true)} disabled={busy}>
                                Select all
                            </button>
                            <button type="button" className="lims-btn" onClick={() => toggleAll(false)} disabled={busy}>
                                Clear
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 text-xs text-gray-600">
                        Selected: <span className="font-semibold">{selectedIds.length}</span>
                    </div>

                    <div className="mt-3 space-y-3">
                        {items.length ? (
                            items.map((s) => {
                                const sid = s.sample_id;
                                const checked = !!selected[sid];

                                const rx =
                                    s.received_at ??
                                    s.physically_received_at ??
                                    s.admin_received_from_client_at ??
                                    null;

                                const params = s.requested_parameters ?? [];
                                const selMap = paramSel[sid] ?? {};

                                return (
                                    <div
                                        key={sid}
                                        className={cx(
                                            "rounded-2xl border p-4",
                                            checked ? "border-amber-200 bg-amber-50/20" : "border-gray-200 bg-white"
                                        )}
                                    >
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
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
                                                        Received: {rx ? formatDateTimeLocal(rx) : "-"}
                                                    </div>
                                                </div>
                                            </label>
                                        </div>

                                        {checked ? (
                                            <div className="mt-3">
                                                <div className="text-xs font-semibold text-gray-800 mb-2">
                                                    Parameters to test (select at least 1)
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
                                                                            : "bg-gray-50 text-gray-600 border-gray-200"
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
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-sm text-gray-600">No eligible samples found.</div>
                        )}
                    </div>

                    <div className="mt-4 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            className="lims-btn"
                            onClick={() => {
                                setResultUrl(null);
                                setResultNumber(null);
                                setPreviewOpen(false);
                            }}
                            disabled={busy}
                        >
                            Reset Result
                        </button>
                        <button type="button" className="lims-btn-primary" onClick={generate} disabled={busy}>
                            {busy ? "Generating..." : "Generate LOO PDF"}
                        </button>
                    </div>

                    {resultUrl ? (
                        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                            <div className="font-semibold">LOO generated</div>
                            <div className="mt-1">
                                Number: <span className="font-mono">{resultNumber ?? "-"}</span>
                            </div>

                            <div className="mt-3 flex items-center gap-2">
                                <button
                                    type="button"
                                    className="lims-btn"
                                    onClick={() => setPreviewOpen(true)}
                                >
                                    Open Preview
                                </button>
                                <span className="text-xs text-emerald-800">
                                    (Download bisa dari viewer di preview)
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
                title={resultNumber ? `LOO ${resultNumber}` : "LOO PDF Preview"}
            />
        </>
    );
}
