import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../../utils/errors";
import {
    fetchTestingBoard,
    moveTestingCard,
    type TestingBoardCard,
    type TestingBoardColumn,
} from "../../services/testingBoard";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function fmt(x?: string | null) {
    if (!x) return "-";
    const d = new Date(x);
    if (Number.isNaN(d.getTime())) return String(x);
    return d.toLocaleString();
}

type Props = {
    sampleId: number;
    sample?: any;
    roleId?: number | null;
};

function deriveGroupFromSample(sample: any): string {
    const rawType = String(sample?.sample_type ?? "").toLowerCase();
    const hasPcr = rawType.includes("pcr") || rawType.includes("sars") || rawType.includes("cov");
    if (hasPcr) return "pcr_sars_cov_2";
    return "default";
}

export const SampleTestingKanbanTab = ({ sampleId, sample }: Props) => {
    const [group, setGroup] = useState<string>(() => deriveGroupFromSample(sample));
    const [loading, setLoading] = useState(false);
    const [busyMove, setBusyMove] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [columns, setColumns] = useState<TestingBoardColumn[]>([]);
    const [cards, setCards] = useState<TestingBoardCard[]>([]);
    const [mode, setMode] = useState<"backend" | "fallback">("fallback");

    // ✅ penting: kalau sample detail baru ke-load (sample berubah), group harus ikut ter-update
    useEffect(() => {
        const next = deriveGroupFromSample(sample);
        setGroup((prev) => {
            // jangan ganggu kalau user sudah memilih group manual selain default
            if (prev && prev !== "default") return prev;
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, sample?.sample_type]);

    const load = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setLoading(true);
            setError(null);

            const res = await fetchTestingBoard({ group });

            // ✅ Safety: if backend returns a normalized workflow_group,
            // keep FE selection aligned *only when user is still on "default"*.
            if (group === "default" && res.group && res.group !== group) {
                setGroup(res.group);
                return; // reload via effect
            }

            setMode(res.mode);

            const nextCols = [...(res.columns ?? [])].sort((a, b) => a.position - b.position);
            setColumns(nextCols);

            const incomingCards: TestingBoardCard[] = Array.isArray(res.cards) ? res.cards : [];
            const incomingHasMine = incomingCards.some(
                (c) => Number(c.sample_id) === Number(sampleId)
            );

            // ✅ KEY FIX:
            // Kalau response board TIDAK membawa card sample ini,
            // jangan overwrite state cards yang sudah ada (biar UI tidak flicker balik "Not started").
            setCards((prev) => {
                const prevHasMine = (prev ?? []).some((c) => Number(c.sample_id) === Number(sampleId));
                if (!incomingHasMine && prevHasMine) return prev;
                return incomingCards;
            });
        } catch (e: any) {
            setError(getErrorMessage(e, "Failed to load testing board."));
            setColumns([]);
            // jangan wipe cards kalau lagi ada card lokal -> biar UI stabil
            setCards((prev) => prev);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [group, sampleId]);

    const sortedCols = useMemo(() => [...columns].sort((a, b) => a.position - b.position), [columns]);
    const firstCol = sortedCols[0];

    const myCard = useMemo(() => {
        const hit = (cards ?? []).find((c) => Number(c.sample_id) === Number(sampleId));
        return hit ?? null;
    }, [cards, sampleId]);

    const currentColIndex = useMemo(() => {
        if (!myCard?.column_id) return -1;
        const idx = sortedCols.findIndex((c) => Number(c.column_id) === Number(myCard.column_id));
        return idx;
    }, [myCard, sortedCols]);

    const nextCol = useMemo(() => {
        if (currentColIndex < 0) return null;
        return sortedCols[currentColIndex + 1] ?? null;
    }, [sortedCols, currentColIndex]);

    const alreadyStarted = !!myCard?.column_id;

    const doMove = async (toColumnId: number) => {
        if (!toColumnId) return;
        setBusyMove(true);
        setError(null);

        // optimistic UI
        const prevCards = cards;
        const next = (cards ?? []).some((c) => Number(c.sample_id) === Number(sampleId))
            ? (cards ?? []).map((c) =>
                Number(c.sample_id) === Number(sampleId) ? { ...c, column_id: toColumnId } : c
            )
            : [
                ...(cards ?? []),
                {
                    sample_id: sampleId,
                    lab_sample_code: sample?.lab_sample_code ?? null,
                    sample_type: sample?.sample_type ?? null,
                    client_name: sample?.client?.name ?? null,
                    status_enum: sample?.status_enum ?? null,
                    current_status: sample?.current_status ?? null,
                    column_id: toColumnId,
                } as any,
            ];
        setCards(next);

        try {
            const res = await moveTestingCard({
                sample_id: sampleId,
                from_column_id: myCard?.column_id ?? null,
                to_column_id: toColumnId,
                workflow_group: group, // ✅ ensure backend validates against the same board UI is using
                note: null,
            });

            // ✅ extra stability: if backend returns moved_at, keep it (best effort)
            const movedAt = (res as any)?.data?.data?.moved_at ?? (res as any)?.data?.moved_at ?? null;
            if (movedAt) {
                setCards((prev) =>
                    (prev ?? []).map((c) =>
                        Number(c.sample_id) === Number(sampleId)
                            ? { ...c, entered_at: (c as any)?.entered_at ?? movedAt }
                            : c
                    )
                );
            }

            // reload board (but won't wipe local card anymore if response doesn't include it)
            await load();
        } catch (e: any) {
            setCards(prevCards);
            setError(getErrorMessage(e, "Move failed (backend endpoint not ready?)."));
        } finally {
            setBusyMove(false);
        }
    };

    const headerTitle = sample?.lab_sample_code || (sampleId ? `Sample #${sampleId}` : "Sample");
    const headerSub =
        sample?.sample_type || (sample?.client?.name ? `Client: ${sample.client.name}` : "—");

    return (
        <div className="space-y-4">
            {/* Header / Controls */}
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Testing Kanban</div>
                    <div className="text-xs text-gray-500 mt-1">
                        Tracks sample stages with timestamps. “Add” = enter first stage, “Move” = next stage.
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <select
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        value={group}
                        onChange={(e) => setGroup(e.target.value)}
                        disabled={loading || busyMove}
                        title="Workflow group"
                    >
                        <option value="default">default</option>
                        <option value="pcr_sars_cov_2">pcr_sars_cov_2</option>
                        <option value="pcr">pcr</option>
                        <option value="wgs">wgs</option>
                        <option value="elisa">elisa</option>
                    </select>
                    <button type="button" className="lims-btn" onClick={load} disabled={loading || busyMove}>
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                </div>
            </div>

            {/* Sample card */}
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">{headerTitle}</div>
                        <div className="text-xs text-gray-600 mt-1 truncate">{headerSub}</div>
                        <div className="mt-2 text-[11px] text-gray-500">
                            Mode:{" "}
                            <span
                                className={cx(
                                    "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold border",
                                    mode === "backend"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-amber-200 bg-amber-50 text-amber-800"
                                )}
                            >
                                {mode === "backend" ? "backend board" : "fallback"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {!alreadyStarted && (
                            <button
                                type="button"
                                className={cx(
                                    "lims-btn-primary px-4 py-2",
                                    (!firstCol || busyMove) && "opacity-60 cursor-not-allowed"
                                )}
                                disabled={!firstCol || busyMove}
                                onClick={() => firstCol && doMove(firstCol.column_id)}
                                title="Record timestamp and enter first stage"
                            >
                                {busyMove ? "Saving..." : "Add to first column"}
                            </button>
                        )}

                        {alreadyStarted && nextCol && (
                            <button
                                type="button"
                                className={cx(
                                    "lims-btn-primary px-4 py-2",
                                    busyMove && "opacity-60 cursor-not-allowed"
                                )}
                                disabled={busyMove}
                                onClick={() => doMove(nextCol.column_id)}
                                title="Move to next stage and record timestamp"
                            >
                                {busyMove ? "Moving..." : `Move → ${nextCol.name}`}
                            </button>
                        )}

                        {alreadyStarted && !nextCol && (
                            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                                Final stage reached
                            </span>
                        )}
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-gray-600">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-[10px] text-gray-400">Current column</div>
                        <div className="font-semibold">
                            {alreadyStarted
                                ? sortedCols.find((c) => c.column_id === myCard?.column_id)?.name ??
                                `#${myCard?.column_id}`
                                : "Not started"}
                        </div>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-[10px] text-gray-400">Entered at</div>
                        <div className="font-semibold">{fmt((myCard as any)?.entered_at)}</div>
                    </div>
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-[10px] text-gray-400">Exited at</div>
                        <div className="font-semibold">{fmt((myCard as any)?.exited_at)}</div>
                    </div>
                </div>

                {error && (
                    <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                        {error}
                    </div>
                )}
            </div>

            {/* Board columns */}
            <div className="overflow-x-auto">
                <div className="min-w-[980px] grid grid-flow-col auto-cols-[320px] gap-4 pb-2">
                    {sortedCols.map((col) => {
                        const isHere = alreadyStarted && Number(myCard?.column_id) === Number(col.column_id);
                        const isDone =
                            alreadyStarted &&
                            currentColIndex >= 0 &&
                            sortedCols.findIndex((c) => c.column_id === col.column_id) < currentColIndex;

                        return (
                            <div
                                key={col.column_id}
                                className={cx(
                                    "rounded-2xl border bg-white overflow-hidden",
                                    isHere ? "border-primary ring-2 ring-primary-soft" : "border-gray-200"
                                )}
                            >
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <div className="text-sm font-extrabold text-gray-900 truncate">{col.name}</div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {isHere ? "Current" : isDone ? "Completed" : "Pending"}
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-400">#{col.column_id}</span>
                                </div>

                                <div className="px-3 py-3 min-h-[180px]">
                                    {isHere ? (
                                        <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                                            <div className="text-xs font-semibold text-gray-900">{headerTitle}</div>
                                            <div className="text-[11px] text-gray-500 mt-1">{headerSub}</div>
                                            <div className="mt-2 text-[11px] text-gray-600">
                                                <span className="font-semibold">Entered:</span> {fmt((myCard as any)?.entered_at)}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                                            {alreadyStarted
                                                ? "No card here."
                                                : col === firstCol
                                                    ? "Start by clicking “Add to first column”."
                                                    : "—"}
                                        </div>
                                    )}

                                    {alreadyStarted && isHere && (
                                        <div className="mt-3">
                                            {nextCol ? (
                                                <button
                                                    type="button"
                                                    className={cx(
                                                        "w-full px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-gray-50",
                                                        busyMove && "opacity-60 cursor-not-allowed"
                                                    )}
                                                    disabled={busyMove}
                                                    onClick={() => doMove(nextCol.column_id)}
                                                    title="Move to next stage"
                                                >
                                                    {busyMove ? "Moving..." : `Move → ${nextCol.name}`}
                                                </button>
                                            ) : (
                                                <div className="w-full px-4 py-2 rounded-xl border border-emerald-100 bg-emerald-50 text-sm font-semibold text-emerald-800">
                                                    Completed ✅
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
