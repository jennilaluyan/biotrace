import { useMemo, useState } from "react";

type Props = {
    mode: "verify" | "validate";
    eligibleCount: number;
    selectedCount: number;
    running?: boolean;
    onToggleAll: () => void;
    onClear: () => void;
    onRun: (note?: string) => Promise<void> | void;
};

export function BulkVerifyValidateBar({
    mode,
    eligibleCount,
    selectedCount,
    running,
    onToggleAll,
    onClear,
    onRun,
}: Props) {
    const [note, setNote] = useState("");

    const title = useMemo(() => {
        return mode === "verify" ? "Bulk Verify (OM)" : "Bulk Validate (LH)";
    }, [mode]);

    const actionLabel = useMemo(() => {
        return mode === "verify" ? "Verify selected" : "Validate selected";
    }, [mode]);

    const disabled = running || selectedCount === 0;

    return (
        <div className="mb-3 rounded-xl border bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-[220px]">
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="text-xs text-slate-500">
                        Eligible: <b>{eligibleCount}</b> • Selected: <b>{selectedCount}</b>
                    </div>
                </div>

                <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                    <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Optional note (audit)..."
                        className="h-9 w-full max-w-[340px] rounded-lg border px-3 text-sm"
                    />

                    <button
                        type="button"
                        onClick={onToggleAll}
                        className="h-9 rounded-lg border px-3 text-sm hover:bg-slate-50"
                    >
                        Select all eligible
                    </button>

                    <button
                        type="button"
                        onClick={onClear}
                        className="h-9 rounded-lg border px-3 text-sm hover:bg-slate-50"
                    >
                        Clear
                    </button>

                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onRun(note.trim() || undefined)}
                        className={`h-9 rounded-lg px-3 text-sm font-semibold text-white ${disabled ? "bg-slate-400" : "bg-rose-600 hover:bg-rose-700"
                            }`}
                    >
                        {running ? "Running..." : actionLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
