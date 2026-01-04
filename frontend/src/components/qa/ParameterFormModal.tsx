// frontend/src/components/qa/ParameterFormModal.tsx
import { useEffect, useMemo, useState } from "react";
import type { ParameterPayload, ParameterRow } from "../../services/parameters";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "create" | "edit";
    initial?: ParameterRow | null;
    onClose: () => void;
    onSubmit: (payload: ParameterPayload) => Promise<void>;
};

export const ParameterFormModal = ({ open, mode, initial, onClose, onSubmit }: Props) => {
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [unit, setUnit] = useState("");
    const [unitId, setUnitId] = useState<string>("");
    const [methodRef, setMethodRef] = useState("");
    const [status, setStatus] = useState("");
    const [tag, setTag] = useState("");

    useEffect(() => {
        if (!open) return;
        setErr(null);

        setCode(initial?.code ?? "");
        setName(initial?.name ?? "");
        setUnit(initial?.unit ?? "");
        setUnitId(initial?.unit_id ? String(initial.unit_id) : "");
        setMethodRef(initial?.method_ref ?? "");
        setStatus(initial?.status ?? "");
        setTag(initial?.tag ?? "");
    }, [open, initial]);

    const title = useMemo(() => (mode === "create" ? "Create Parameter" : "Edit Parameter"), [mode]);

    const handleSubmit = async () => {
        setErr(null);

        if (!name.trim()) {
            setErr("Name is required.");
            return;
        }

        const payload: ParameterPayload = {
            name: name.trim(),
            code: code.trim() || null,
            unit: unit.trim() || null,
            unit_id: unitId ? Number(unitId) : null,
            method_ref: methodRef.trim() || null,
            status: status.trim() || null,
            tag: tag.trim() || null,
        };

        try {
            setSaving(true);
            await onSubmit(payload);
            onClose();
        } catch (e: any) {
            const msg =
                e?.response?.data?.message ??
                e?.data?.message ??
                e?.message ??
                "Failed to save parameter.";
            setErr(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-80 bg-black/30 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-100">
                <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div>
                        <div className="text-lg font-bold text-gray-900">{title}</div>
                        <div className="text-xs text-gray-500 mt-1">Fields follow backend schema.</div>
                    </div>
                    <button className="lims-btn" type="button" onClick={onClose} disabled={saving}>
                        Close
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {err && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                            {err}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Code</div>
                            <input
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="e.g. BM-010"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-gray-500 mb-1">
                                Name <span className="text-red-600">*</span>
                            </div>
                            <input
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Parameter name"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-gray-500 mb-1">Unit (string)</div>
                            <input
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={unit}
                                onChange={(e) => setUnit(e.target.value)}
                                placeholder="e.g. Ct"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-gray-500 mb-1">Unit ID (optional)</div>
                            <input
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={unitId}
                                onChange={(e) => setUnitId(e.target.value)}
                                placeholder="e.g. 1"
                                inputMode="numeric"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-gray-500 mb-1">Method Ref</div>
                            <input
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={methodRef}
                                onChange={(e) => setMethodRef(e.target.value)}
                                placeholder="e.g. WHO/CDC"
                            />
                        </div>

                        <div>
                            <div className="text-xs text-gray-500 mb-1">Status</div>
                            <input
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                placeholder="e.g. Active"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <div className="text-xs text-gray-500 mb-1">Tag</div>
                            <input
                                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                                value={tag}
                                onChange={(e) => setTag(e.target.value)}
                                placeholder="e.g. Routine"
                            />
                        </div>
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button className="lims-btn" type="button" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        className={cx("lims-btn-primary", saving ? "opacity-60 cursor-not-allowed" : "")}
                        type="button"
                        onClick={handleSubmit}
                        disabled={saving}
                    >
                        {saving ? "Saving..." : mode === "create" ? "Create" : "Save changes"}
                    </button>
                </div>
            </div>
        </div>
    );
};
