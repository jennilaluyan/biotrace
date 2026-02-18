import { useEffect, useMemo, useState } from "react";
import { BookOpen, X, Save, Plus, Pencil, Lock } from "lucide-react";
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

    useEffect(() => {
        if (!open) return;
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onEsc);
        return () => window.removeEventListener("keydown", onEsc);
    }, [open, onClose]);

    const title = useMemo(
        () => (mode === "create" ? "Buat Metode" : "Edit Metode"),
        [mode]
    );

    const subtitle = useMemo(() => {
        if (mode === "create") return "Tambahkan metode pengujian (mis. RT-qPCR, WGS).";
        return "Perubahan akan mempengaruhi referensi metode pada parameter/dokumen.";
    }, [mode]);

    const canSubmit = useMemo(() => {
        if (!open) return false;
        if (saving) return false;
        if (readOnly) return false;
        if (!name.trim()) return false;
        return true;
    }, [open, saving, readOnly, name]);

    const handleSubmit = async () => {
        if (readOnly) return;

        setErr(null);
        if (!name.trim()) {
            setErr("Nama metode wajib diisi.");
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
                "Gagal menyimpan metode.";

            const msg =
                typeof raw === "string" &&
                    (raw.toLowerCase().includes("duplicate") ||
                        raw.toLowerCase().includes("unique") ||
                        raw.toLowerCase().includes("already exists"))
                    ? "Nama atau code sudah dipakai. Gunakan nilai lain."
                    : raw;

            setErr(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const headerIcon = mode === "create" ? <Plus size={18} /> : <Pencil size={18} />;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={saving ? undefined : onClose} aria-hidden="true" />

            <div
                className="relative w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-3 bg-gray-50">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white">
                                {headerIcon}
                            </span>
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-gray-900">{title}</div>
                                <div className="text-xs text-gray-600 mt-0.5">{subtitle}</div>
                            </div>
                        </div>
                    </div>

                    <button
                        className={cx("lims-icon-button", saving && "opacity-60 cursor-not-allowed")}
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                        aria-label="Tutup"
                        title="Tutup"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {err ? (
                        <div className="text-sm text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-xl">
                            {err}
                        </div>
                    ) : null}

                    {readOnly ? (
                        <div className="text-xs text-gray-700 bg-gray-50 border border-gray-200 px-3 py-2 rounded-xl inline-flex items-start gap-2">
                            <Lock size={16} className="mt-0.5" />
                            <div>Mode read-only — hanya role tertentu yang boleh membuat/mengubah metode.</div>
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-gray-600 mb-1">
                                Code <span className="text-gray-400">(opsional)</span>
                            </label>
                            <input
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="mis. PCR-01"
                                disabled={saving || readOnly}
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-600 mb-1">
                                Nama <span className="text-red-600">*</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                    <BookOpen size={14} />
                                </span>
                                <input
                                    className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="mis. RT-qPCR"
                                    disabled={saving || readOnly}
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs text-gray-600 mb-1">
                                Deskripsi <span className="text-gray-400">(opsional)</span>
                            </label>
                            <textarea
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-[90px] focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Ringkasan singkat metode…"
                                disabled={saving || readOnly}
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs text-gray-600 mb-1">Status</label>
                            <select
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
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
                            <div className="mt-2 text-[11px] text-gray-500">Disimpan sebagai boolean: true/false.</div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-5 border-t border-gray-100 flex items-center justify-end gap-2 bg-white">
                    <button
                        className={cx("btn-outline", saving && "opacity-60 cursor-not-allowed")}
                        type="button"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Batal
                    </button>

                    {!readOnly ? (
                        <button
                            className={cx(
                                "lims-btn-primary inline-flex items-center gap-2",
                                (!canSubmit || saving) && "opacity-60 cursor-not-allowed"
                            )}
                            type="button"
                            onClick={handleSubmit}
                            disabled={!canSubmit || saving}
                        >
                            <Save size={16} />
                            {saving ? "Menyimpan..." : mode === "create" ? "Buat" : "Simpan perubahan"}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
};
