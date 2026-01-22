import { useEffect, useMemo, useState } from "react";
import {
    createSampleTestResult,
    fetchUnits,
    updateSampleTestResult,
} from "../../services/sampleTests";

type Props = {
    open: boolean;
    onClose: () => void;
    sampleTestId: number;

    headerLine?: string;

    existingResult?: {
        result_id: number;
        value_raw?: any;
        value_final?: any;
        unit_id?: number | null;
        flags?: any;
    } | null;

    onSaved: () => void;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function cleanUndefined(obj: Record<string, any>) {
    const out: Record<string, any> = {};
    Object.keys(obj).forEach((k) => {
        const v = obj[k];
        if (v === undefined || v === null || v === "") return;
        out[k] = v;
    });
    return out;
}

function firstValidationError(errors: any): string | null {
    if (!errors || typeof errors !== "object") return null;
    const vals = Object.values(errors).flat() as any[];
    const first = vals?.[0];
    return first ? String(first) : null;
}

export const ResultEntryModal = ({
    open,
    onClose,
    sampleTestId,
    headerLine,
    existingResult,
    onSaved,
}: Props) => {
    const isEdit = !!existingResult?.result_id;

    const [units, setUnits] = useState<any[]>([]);
    const [loadingUnits, setLoadingUnits] = useState(false);

    const [valueRaw, setValueRaw] = useState<string>("");
    const [valueFinal, setValueFinal] = useState<string>("");
    const [unitId, setUnitId] = useState<number | "">("");

    const [qcStatus, setQcStatus] = useState<
        "" | "ok" | "review" | "recheck" | "invalid"
    >("");
    const [qcNote, setQcNote] = useState<string>("");
    const [abnormal, setAbnormal] = useState<boolean>(false);
    const [notes, setNotes] = useState<string>("");

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;

        setError(null);

        setValueRaw(existingResult?.value_raw ?? "");
        setValueFinal(existingResult?.value_final ?? "");
        setUnitId((existingResult?.unit_id ?? "") as any);

        const f = existingResult?.flags;
        const obj = f && typeof f === "object" && !Array.isArray(f) ? f : {};

        const mappedQc = obj.qc_status ?? obj.qcStatus ?? obj.qc ?? "";
        const mappedNote = obj.qc_note ?? obj.qcNote ?? obj.reason ?? "";
        const mappedAbnormal = Boolean(
            obj.abnormal ?? obj.is_abnormal ?? obj.isAbnormal ?? false
        );
        const mappedNotes = obj.notes ?? obj.note ?? "";

        setQcStatus(
            mappedQc === "ok" ||
                mappedQc === "review" ||
                mappedQc === "recheck" ||
                mappedQc === "invalid"
                ? mappedQc
                : ""
        );
        setQcNote(String(mappedNote ?? ""));
        setAbnormal(mappedAbnormal);
        setNotes(String(mappedNotes ?? ""));
    }, [open, existingResult]);

    useEffect(() => {
        if (!open) return;
        (async () => {
            try {
                setLoadingUnits(true);
                const items = await fetchUnits(500);
                setUnits(items);
            } catch {
                setUnits([]);
            } finally {
                setLoadingUnits(false);
            }
        })();
    }, [open]);

    const canSubmit = useMemo(() => {
        return String(valueRaw).trim() !== "" || String(valueFinal).trim() !== "";
    }, [valueRaw, valueFinal]);

    const onSubmit = async () => {
        if (!canSubmit) {
            setError("Please fill at least one value (Raw or Final).");
            return;
        }

        const friendlyFlags = cleanUndefined({
            qc_status: qcStatus || undefined,
            qc_note: qcNote?.trim() || undefined,
            abnormal: abnormal ? true : undefined,
            notes: notes?.trim() || undefined,
        });

        let baseFlags: any = {};
        const f = existingResult?.flags;
        if (f && typeof f === "object" && !Array.isArray(f)) baseFlags = { ...f };

        const flagsObj = { ...baseFlags, ...friendlyFlags };

        // helper: backend kamu minta STRING (lihat error 422)
        const toStrOrNull = (v: string) => {
            const t = String(v ?? "").trim();
            return t ? t : null;
        };

        const payload = {
            value_raw: toStrOrNull(valueRaw),
            value_final: toStrOrNull(valueFinal),
            unit_id: unitId === "" ? null : Number(unitId),
            flags: flagsObj ?? {}, // object (bukan JSON string)
        };

        try {
            setSaving(true);
            setError(null);

            if (isEdit) {
                await updateSampleTestResult(existingResult!.result_id, payload);
            } else {
                await createSampleTestResult(sampleTestId, payload);
            }

            onSaved();
            onClose();
        } catch (err: any) {
            /**
             * ✅ FIX: api.ts kamu throw {status, data}
             * jadi jangan baca err.response...
             */
            const data = err?.data ?? err?.response?.data ?? null;

            const apiMsg =
                data?.message ??
                data?.error ??
                null;

            const fieldErr = firstValidationError(data?.errors);

            setError(apiMsg || fieldErr || "Failed to save result.");
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            <div className="relative w-[92vw] max-w-3xl bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="text-base font-bold text-gray-900">
                            {isEdit ? "Edit Result" : "Enter Result"}
                        </div>

                        <div className="text-xs text-gray-500 mt-1 truncate">
                            {headerLine ? headerLine : `Sample Test ID: ${sampleTestId}`}
                        </div>

                        <div className="text-xs text-gray-400 mt-1">
                            Fill Raw/Final value, then optionally add QC & notes.
                        </div>
                    </div>

                    <button
                        className="text-sm text-gray-600 hover:text-gray-900 shrink-0"
                        onClick={onClose}
                        type="button"
                    >
                        Close
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                            {error}
                        </div>
                    )}

                    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-semibold text-gray-900">Result Values</div>
                            <div className="text-xs text-gray-500">
                                Required: at least Raw or Final
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <div className="text-xs text-gray-600 mb-1">Raw Value</div>
                                <input
                                    type="number"
                                    step="any"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                    value={valueRaw}
                                    onChange={(e) => setValueRaw(e.target.value)}
                                    placeholder="e.g. 12.3"
                                />
                                <div className="text-[11px] text-gray-500 mt-1">
                                    Direct instrument output (optional).
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-gray-600 mb-1">Final Value</div>
                                <input
                                    type="number"
                                    step="any"
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                    value={valueFinal}
                                    onChange={(e) => setValueFinal(e.target.value)}
                                    placeholder="e.g. 12.0"
                                />
                                <div className="text-[11px] text-gray-500 mt-1">
                                    Verified value to report (optional).
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-gray-600 mb-1">Unit</div>
                                <select
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                    value={unitId}
                                    onChange={(e) => setUnitId(e.target.value as any)}
                                    disabled={loadingUnits}
                                >
                                    <option value="">No unit</option>
                                    {units.map((u: any) => (
                                        <option key={u.unit_id} value={u.unit_id}>
                                            {(u.symbol ?? u.code ?? "") +
                                                (u.name ? ` — ${u.name}` : "")}
                                        </option>
                                    ))}
                                </select>
                                <div className="text-[11px] text-gray-500 mt-1">
                                    Choose if your result requires a unit.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-white p-4">
                        <div className="text-sm font-semibold text-gray-900 mb-3">
                            Quality & Notes (Optional)
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <div className="text-xs text-gray-600 mb-1">QC Status</div>
                                <select
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                    value={qcStatus}
                                    onChange={(e) => setQcStatus(e.target.value as any)}
                                >
                                    <option value="">Not set</option>
                                    <option value="ok">OK</option>
                                    <option value="review">Needs Review</option>
                                    <option value="recheck">Recheck</option>
                                    <option value="invalid">Invalid</option>
                                </select>
                                <div className="text-[11px] text-gray-500 mt-1">
                                    Helps QA/approval understand result quality quickly.
                                </div>
                            </div>

                            <div>
                                <div className="text-xs text-gray-600 mb-1">QC Note</div>
                                <input
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                                    value={qcNote}
                                    onChange={(e) => setQcNote(e.target.value)}
                                    placeholder="e.g. low signal, rerun recommended"
                                />
                                <div className="text-[11px] text-gray-500 mt-1">
                                    Short reason or remark (optional).
                                </div>
                            </div>

                            <div className="md:col-span-2 flex items-center gap-2 mt-1">
                                <input
                                    id="abnormal"
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={abnormal}
                                    onChange={(e) => setAbnormal(e.target.checked)}
                                />
                                <label htmlFor="abnormal" className="text-sm text-gray-700">
                                    Mark as abnormal/out-of-range
                                </label>
                            </div>

                            <div className="md:col-span-2">
                                <div className="text-xs text-gray-600 mb-1">Notes</div>
                                <textarea
                                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white min-h-[90px]"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Write anything that will help reviewer or lab head…"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button className="lims-btn" type="button" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>

                    <button
                        className={cx(
                            "lims-btn-primary px-4 py-2 text-sm rounded-xl",
                            !canSubmit && "opacity-60 cursor-not-allowed"
                        )}
                        type="button"
                        onClick={onSubmit}
                        disabled={saving || !canSubmit}
                    >
                        {saving ? "Saving..." : isEdit ? "Update Result" : "Save Result"}
                    </button>
                </div>
            </div>
        </div>
    );
};
