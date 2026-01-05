import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../services/api";

type Props = {
    sampleId: number;
    /**
     * Naikkan angka ini dari parent kalau mau memaksa panel refresh
     * (mis. setelah submit result / add tests / update status).
     */
    refreshKey?: number;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function safeArray(x: any): any[] {
    return Array.isArray(x) ? x : [];
}

function safeNum(x: any): number {
    const n = typeof x === "string" ? Number(x) : x;
    return Number.isFinite(n) ? n : 0;
}

/**
 * Payload reagent calculation di backend berupa JSON/array yang bisa berubah2.
 * Panel ini dibuat "tahan banting" (defensive) supaya tidak crash
 * walau bentuk payload beda sedikit.
 */
function extractCalcView(calc: any) {
    const payload = calc?.payload ?? {};
    const effective = payload?.effective?.data ?? payload?.effective ?? null;
    const baseline = payload?.baseline?.data ?? payload?.baseline ?? null;
    const data = effective ?? baseline ?? payload?.data ?? payload;

    const state =
        payload?.state ??
        payload?.status ??
        data?.state ??
        data?.status ??
        (payload?.missing_rules || data?.missing_rules ? "missing_rules" : "computed");

    const missing =
        payload?.missing_rules ??
        data?.missing_rules ??
        payload?.missingRules ??
        data?.missingRules ??
        payload?.missing ??
        data?.missing ??
        [];

    const items =
        data?.items ??
        payload?.items ??
        payload?.effective?.items ??
        payload?.baseline?.items ??
        [];

    const totalsObj = data?.totals ?? payload?.totals ?? null;

    const itemsArr = safeArray(items);
    const totalVolume = itemsArr.reduce(
        (sum, it) => sum + safeNum(it?.volume ?? it?.qty ?? it?.amount),
        0
    );

    return {
        payload,
        data,
        state: String(state ?? "unknown"),
        missing: safeArray(missing),
        items: itemsArr,
        totalsObj,
        totalVolume,
    };
}

export function ReagentCalculationPanel({ sampleId, refreshKey }: Props) {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [calc, setCalc] = useState<any>(null);

    const load = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        try {
            setLoading(true);
            setErr(null);

            // Backend: /api/v1/samples/{id}/reagent-calculation
            // FE convention (baseURL=/api): pakai /v1/...
            const res = await apiGet<any>(`/v1/samples/${sampleId}/reagent-calculation`);

            // ApiResponse::success => res.data.data berisi object (kadang res.data.data.calc)
            const data = res?.data?.data;
            setCalc(data?.calc ?? data ?? null);
        } catch (e: any) {
            const msg =
                e?.response?.data?.message ??
                e?.response?.data?.error ??
                e?.message ??
                "Failed to load reagent calculation.";
            setErr(msg);
            setCalc(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, refreshKey]);

    const view = useMemo(() => {
        if (!calc) return null;
        return extractCalcView(calc);
    }, [calc]);

    return (
        <div className="mt-5 bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h3 className="lims-detail-section-title">Reagent Calculation</h3>
                    <div className="text-xs text-gray-500 mt-1">
                        Read-only. Refresh after result/status changes.
                    </div>
                </div>

                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className={cx(
                        "rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700",
                        loading ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                    )}
                >
                    {loading ? "Loading..." : "Refresh"}
                </button>
            </div>

            {err && !loading && (
                <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                    {err}
                </div>
            )}

            {!err && loading && (
                <div className="mt-4 text-sm text-gray-600">Fetching reagent calculation...</div>
            )}

            {!err && !loading && !calc && (
                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                    No calculation yet.
                </div>
            )}

            {!err && !loading && calc && view && (
                <>
                    {/* status chips */}
                    <div className="mt-4 flex flex-wrap gap-2 items-center">
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-700">
                            Version: <span className="ml-1">{calc?.version_no ?? "-"}</span>
                        </span>
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-700">
                            Locked: <span className="ml-1">{calc?.locked ? "Yes" : "No"}</span>
                        </span>

                        {view.state === "missing_rules" ? (
                            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border border-amber-200 bg-amber-50 text-amber-800">
                                Status: Missing rules
                            </span>
                        ) : (
                            <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-800">
                                Status: Computed
                            </span>
                        )}
                    </div>

                    {/* missing rules box */}
                    {view.state === "missing_rules" && (
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                            <div className="text-sm font-semibold text-amber-900">Missing rules detected</div>
                            <div className="text-xs text-amber-800 mt-1">
                                Configure reagent rules for the method/parameter combinations.
                            </div>

                            {view.missing.length > 0 && (
                                <ul className="mt-3 list-disc pl-5 text-xs text-amber-800 space-y-1">
                                    {view.missing.map((m, idx) => (
                                        <li key={idx}>{typeof m === "string" ? m : JSON.stringify(m)}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* summary */}
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <div className="text-xs text-gray-500">Total items</div>
                            <div className="text-lg font-extrabold text-gray-900">{view.items.length}</div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <div className="text-xs text-gray-500">Total volume (sum)</div>
                            <div className="text-lg font-extrabold text-gray-900">
                                {view.totalVolume.toFixed(2)}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                            <div className="text-xs text-gray-500">Engine totals</div>
                            <div className="text-[11px] text-gray-600 mt-1 line-clamp-3">
                                {view.totalsObj ? JSON.stringify(view.totalsObj) : "—"}
                            </div>
                        </div>
                    </div>

                    {/* items table */}
                    <div className="mt-4 overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-gray-50 border border-gray-100">
                                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                                    <th className="px-4 py-3 text-left">Reagent</th>
                                    <th className="px-4 py-3 text-left">Code</th>
                                    <th className="px-4 py-3 text-left">Required</th>
                                    <th className="px-4 py-3 text-left">Unit</th>
                                    <th className="px-4 py-3 text-left">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="border border-gray-100 border-t-0">
                                {view.items.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-3 text-sm text-gray-600">
                                            No reagent items to display.
                                        </td>
                                    </tr>
                                ) : (
                                    view.items.map((it: any, idx: number) => {
                                        const name = it?.reagent_name ?? it?.name ?? "-";
                                        const code = it?.reagent_code ?? it?.code ?? "-";
                                        const qty = it?.volume ?? it?.qty ?? it?.amount ?? 0;
                                        const unit = it?.unit ?? it?.unit_name ?? it?.unit_code ?? "-";
                                        const notes = it?.notes ?? it?.remark ?? "";
                                        return (
                                            <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50/60">
                                                <td className="px-4 py-3 font-semibold text-gray-900">{name}</td>
                                                <td className="px-4 py-3 text-gray-700">{code}</td>
                                                <td className="px-4 py-3 text-gray-700">{String(qty)}</td>
                                                <td className="px-4 py-3 text-gray-700">{unit}</td>
                                                <td className="px-4 py-3 text-gray-600">{notes}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
