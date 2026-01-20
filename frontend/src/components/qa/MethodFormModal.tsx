import { useEffect, useMemo, useState } from "react";
import type { MethodPayload, MethodRow } from "../../services/methods";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    open: boolean;
    mode: "create" | "edit";
    initial?: MethodRow | null;
    onClose: () => void;
    onSubmit: (payload: MethodPayload) => Promise<void>;
    readOnly?: boolean;
};

const ACTIVE_OPTIONS = [
    { label: "Active", value: "1" },
    { label: "Inactive", value: "0" },
] as const;

export const MethodFormModal = ({
    open,
    mode,
    initial,
    onClose,
    onSubmit,
    readOnly = false,
}: Props) => {
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isActive, setIsActive] = useState<"1" | "0">("1");

    useEffect(() => {
        if (!open) return;

        setErr(null);
        setCode(initial?.code ?? "");
        setName(initial?.name ?? "");
        setDescription(initial?.description ?? "");
        setIsActive(initial?.is_active === false ? "0" : "1");
    }, [open, initial]);

    const title = useMemo(
        () => (mode === "create" ? "Create Method" : "Edit Method"),
        [mode]
    );

    const handleSubmit = async () => {
        if (readOnly) return;

        setErr(null);
        if (!name.trim()) {
            setErr("Name is required.");
            return;
        }

        const payload: MethodPayload = {
            name: name.trim(),
            code: code.trim() || null,
            description: description.trim() || null,
            is_active: isActive === "1",
        };

        try {
            setSaving(true);
            await onSubmit(payload);
            onClose();
        } catch (e: any) {
            const raw =
                e?.response?.data?.message ??
                e?.data?.message ??
                e?.message ??
                "Failed to save method.";

            // try make it friendlier for duplicate indexes
            const msg =
                typeof raw === "string" &&
                    (raw.toLowerCase().includes("duplicate") ||
                        raw.toLowerCase().includes("unique") ||
                        raw.toLowerCase().includes("already exists"))
                    ? "Name or code already exists. Please use another value."
                    : raw;

            setErr(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div className="lims-modal-backdrop p-4">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-100">
                <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3">
                    <div>
                        <div className="text-lg font-bold text-gray-900">{title}</div>
                        <div className="text-xs text-gray-500 mt-1">Fields follow backend schema.</div>
                    </div>

                    <button
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Close
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {err && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                            {err}
                        </div>
                    )}

                    {readOnly && (
                        <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl">
                            Read-only mode — only Analyst / Operational Manager can create/update methods.
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <div className="text-xs text-gray-500 mb-1">Code</div>
                            <input
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="e.g. PCR-01"
                                disabled={saving || readOnly}
                            />
                        </div>

                        <div>
                            <div className="text-xs text-gray-500 mb-1">
                                Name <span className="text-red-600">*</span>
                            </div>
                            <input
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. RT-qPCR"
                                disabled={saving || readOnly}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <div className="text-xs text-gray-500 mb-1">Description</div>
                            <textarea
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-[90px] focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Optional description…"
                                disabled={saving || readOnly}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <div className="text-xs text-gray-500 mb-1">Status</div>
                            <select
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                value={isActive}
                                onChange={(e) => setIsActive(e.target.value as any)}
                                disabled={saving || readOnly}
                            >
                                {ACTIVE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                            <div className="mt-2 text-[11px] text-gray-500">is_active = true/false.</div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>

                    {!readOnly && (
                        <button
                            className={cx("lims-btn-primary", saving ? "opacity-60 cursor-not-allowed" : "")}
                            type="button"
                            onClick={handleSubmit}
                            disabled={saving}
                        >
                            {saving ? "Saving..." : mode === "create" ? "Create" : "Save changes"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
