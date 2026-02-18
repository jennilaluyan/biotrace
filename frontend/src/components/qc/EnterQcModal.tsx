import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FlaskConical, RefreshCw, X, Check } from "lucide-react";
import { createQcRun, listQcControls, type QcControl } from "../../services/qc";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    sampleId: number;
    onClose: () => void;
    /** dipanggil setelah submit sukses (biasanya untuk refresh qc summary di parent) */
    onSubmitted?: () => void | Promise<void>;
};

function asNumber(input: string) {
    const v = Number(String(input ?? "").trim());
    return Number.isFinite(v) ? v : null;
}

export function EnterQcModal({ open, sampleId, onClose, onSubmitted }: Props) {
    const [qcControls, setQcControls] = useState<QcControl[]>([]);
    const [qcControlsLoading, setQcControlsLoading] = useState(false);
    const [qcControlsError, setQcControlsError] = useState<string | null>(null);

    const [qcControlId, setQcControlId] = useState<number | "">("");
    const [qcValue, setQcValue] = useState<string>("");
    const [qcNote, setQcNote] = useState<string>("");

    const [qcSubmitting, setQcSubmitting] = useState(false);
    const [qcSubmitError, setQcSubmitError] = useState<string | null>(null);

    const isValidSampleId = useMemo(() => {
        return !!sampleId && Number.isFinite(sampleId) && !Number.isNaN(sampleId);
    }, [sampleId]);

    const resetForm = () => {
        setQcControlId("");
        setQcValue("");
        setQcNote("");
        setQcSubmitError(null);
    };

    const close = () => {
        if (qcSubmitting) return;
        resetForm();
        onClose();
    };

    const loadControls = async () => {
        if (!isValidSampleId) return;

        try {
            setQcControlsLoading(true);
            setQcControlsError(null);

            // listQcControls menerima optional sampleId
            const items = await listQcControls(sampleId);
            setQcControls(items);
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Gagal memuat daftar QC control.";
            setQcControlsError(msg);
            setQcControls([]);
        } finally {
            setQcControlsLoading(false);
        }
    };

    // init modal open
    useEffect(() => {
        if (!open) return;

        setQcSubmitError(null);

        // load sekali per open kalau controls belum ada
        if (qcControls.length === 0 && !qcControlsLoading) {
            loadControls();
        }

        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // kalau sampleId berubah, reset state
    useEffect(() => {
        setQcControls([]);
        setQcControlsError(null);
        resetForm();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId]);

    const canSubmit = useMemo(() => {
        if (!open) return false;
        if (!isValidSampleId) return false;
        if (qcSubmitting) return false;
        if (!qcControlId) return false;
        return asNumber(qcValue) != null;
    }, [open, isValidSampleId, qcSubmitting, qcControlId, qcValue]);

    const submitQc = async () => {
        if (!isValidSampleId) {
            setQcSubmitError("Sample tidak valid. Silakan refresh halaman.");
            return;
        }

        if (!qcControlId) {
            setQcSubmitError("Pilih QC control terlebih dulu.");
            return;
        }

        const v = asNumber(qcValue);
        if (v == null) {
            setQcSubmitError("Value harus berupa angka.");
            return;
        }

        try {
            setQcSubmitting(true);
            setQcSubmitError(null);

            await createQcRun(sampleId, {
                qc_control_id: Number(qcControlId),
                value: v,
                ...(qcNote?.trim() ? { note: qcNote.trim() } : {}),
            });

            await onSubmitted?.();
            close();
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                err?.message ??
                "Gagal submit QC.";
            setQcSubmitError(msg);
        } finally {
            setQcSubmitting(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            {/* backdrop */}
            <div
                className="absolute inset-0 bg-black/40"
                onClick={qcSubmitting ? undefined : close}
                aria-hidden="true"
            />

            {/* panel */}
            <div
                className="relative w-full max-w-xl rounded-2xl bg-white shadow-[0_12px_40px_rgba(0,0,0,0.18)] border border-gray-100 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* header */}
                <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 bg-gray-50">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white">
                                <FlaskConical size={18} />
                            </span>
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-gray-900">Input QC</div>
                                <div className="text-xs text-gray-600 mt-0.5">
                                    Pilih control, masukkan nilai, lalu simpan.
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        className={cx("lims-icon-button", qcSubmitting && "opacity-60 cursor-not-allowed")}
                        onClick={close}
                        aria-label="Tutup"
                        title="Tutup"
                        disabled={qcSubmitting}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* body */}
                <div className="p-5 space-y-4">
                    {!isValidSampleId ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 inline-flex gap-2">
                            <AlertTriangle size={18} className="mt-0.5" />
                            <div>Sample tidak valid. Silakan refresh halaman.</div>
                        </div>
                    ) : null}

                    {qcControlsError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {qcControlsError}
                        </div>
                    ) : null}

                    {qcSubmitError ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                            {qcSubmitError}
                        </div>
                    ) : null}

                    {/* Control */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">QC control</label>
                        <select
                            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50"
                            value={qcControlId}
                            onChange={(e) => {
                                const v = e.target.value;
                                setQcControlId(v ? Number(v) : "");
                            }}
                            disabled={!isValidSampleId || qcControlsLoading || qcSubmitting}
                        >
                            <option value="">
                                {qcControlsLoading ? "Memuat QC control..." : "Pilih QC control..."}
                            </option>
                            {qcControls.map((c) => (
                                <option key={c.qc_control_id} value={c.qc_control_id}>
                                    {c.name ?? c.code ?? `QC #${c.qc_control_id}`}
                                </option>
                            ))}
                        </select>

                        <div className="mt-2 flex items-center justify-between gap-3">
                            <div className="text-xs text-gray-500">
                                {qcControlsLoading
                                    ? "Memuat daftar control..."
                                    : qcControls.length > 0
                                        ? `${qcControls.length} control tersedia`
                                        : "Belum ada control."}
                            </div>

                            <button
                                type="button"
                                className={cx(
                                    "inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50",
                                    (qcControlsLoading || qcSubmitting || !isValidSampleId) && "opacity-60 cursor-not-allowed"
                                )}
                                disabled={!isValidSampleId || qcControlsLoading || qcSubmitting}
                                onClick={loadControls}
                                title="Muat ulang QC control"
                            >
                                <RefreshCw size={14} />
                                Reload
                            </button>
                        </div>
                    </div>

                    {/* Value */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Value (angka)</label>
                        <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50"
                            value={qcValue}
                            onChange={(e) => setQcValue(e.target.value)}
                            placeholder="contoh: 15.0"
                            disabled={!isValidSampleId || qcSubmitting}
                        />
                        <div className="mt-1 text-[11px] text-gray-500">
                            Gunakan titik untuk desimal (mis. 15.25).
                        </div>
                    </div>

                    {/* Note */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Catatan (opsional)</label>
                        <input
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50"
                            value={qcNote}
                            onChange={(e) => setQcNote(e.target.value)}
                            placeholder="contoh: rerun recommended"
                            disabled={!isValidSampleId || qcSubmitting}
                        />
                    </div>
                </div>

                {/* footer */}
                <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-end gap-2 bg-white">
                    <button
                        type="button"
                        onClick={close}
                        disabled={qcSubmitting}
                        className={cx("btn-outline", qcSubmitting && "opacity-60 cursor-not-allowed")}
                    >
                        Batal
                    </button>

                    <button
                        type="button"
                        onClick={submitQc}
                        disabled={!canSubmit}
                        className={cx(
                            "lims-btn-primary inline-flex items-center gap-2",
                            !canSubmit && "opacity-60 cursor-not-allowed"
                        )}
                        title={!canSubmit ? "Lengkapi QC control dan value" : "Simpan QC"}
                    >
                        <Check size={16} />
                        {qcSubmitting ? "Menyimpan..." : "Simpan QC"}
                    </button>
                </div>
            </div>
        </div>
    );
}
