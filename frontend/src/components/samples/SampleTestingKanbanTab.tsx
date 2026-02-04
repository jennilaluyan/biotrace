// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\SampleTestingKanbanTab.tsx
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

    // ✅ parent can auto-open QC tab after finalize
    onQualityCoverUnlocked?: () => void;
};

function deriveGroupFromSample(sample: any): string {
    const rawType = String(sample?.sample_type ?? "").toLowerCase();
    const hasPcr = rawType.includes("pcr") || rawType.includes("sars") || rawType.includes("cov");
    if (hasPcr) return "pcr_sars_cov_2";
    return "default";
}

function normalizeCard(c: any): TestingBoardCard {
    const entered =
        c?.entered_at ??
        c?.enteredAt ??
        c?.moved_at ??
        c?.movedAt ??
        null;

    const exited =
        c?.exited_at ??
        c?.exitedAt ??
        null;

    return {
        ...(c as any),
        entered_at: entered,
        exited_at: exited,
    } as any;
}

type StageStamp = {
    column_id: number;
    entered_at: string | null;
    exited_at: string | null;
};

/**
 * ✅ FIX (timestamps persist across stages):
 * Previously the timeline key depended on `group`, so when backend returns
 * a different workflow_group (auto-resolve) or user switches group,
 * the UI would read a different localStorage key => old stage timestamps "disappear".
 *
 * New approach:
 * - timeline key is ONLY per sampleId (and versioned)
 * - on mount, we migrate any old per-group timeline keys into the new key
 */
function timelineKeyV2(sampleId: number) {
    return `biotrace.testing_board.timeline.v2:${sampleId}`;
}

function timelineKeyLegacy(sampleId: number, group: string) {
    return `biotrace.testing_board.timeline.v1:${group}:${sampleId}`;
}

function readTimelineRaw(key: string): Record<number, StageStamp> {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const out: Record<number, StageStamp> = {};
        for (const [k, v] of Object.entries(parsed)) {
            const colId = Number(k);
            if (!Number.isFinite(colId)) continue;
            const entered_at = (v as any)?.entered_at ?? null;
            const exited_at = (v as any)?.exited_at ?? null;
            out[colId] = { column_id: colId, entered_at, exited_at };
        }
        return out;
    } catch {
        return {};
    }
}

function readTimeline(sampleId: number): Record<number, StageStamp> {
    return readTimelineRaw(timelineKeyV2(sampleId));
}

function writeTimeline(sampleId: number, map: Record<number, StageStamp>) {
    try {
        localStorage.setItem(timelineKeyV2(sampleId), JSON.stringify(map ?? {}));
    } catch {
        // ignore
    }
}

function mergeTimeline(
    prev: Record<number, StageStamp>,
    patch: Partial<Record<number, Partial<StageStamp>>>
): Record<number, StageStamp> {
    const next: Record<number, StageStamp> = { ...(prev ?? {}) };
    for (const [k, v] of Object.entries(patch ?? {})) {
        const colId = Number(k);
        if (!Number.isFinite(colId)) continue;
        const cur = next[colId] ?? { column_id: colId, entered_at: null, exited_at: null };
        next[colId] = {
            column_id: colId,
            entered_at: (v as any)?.entered_at ?? cur.entered_at ?? null,
            exited_at: (v as any)?.exited_at ?? cur.exited_at ?? null,
        };
    }
    return next;
}

function migrateLegacyTimelines(sampleId: number, groups: string[]): Record<number, StageStamp> {
    // Merge any legacy keys (v1) into the new v2 key.
    // We keep the earliest entered_at and the latest exited_at if both exist.
    const merged: Record<number, StageStamp> = {};
    for (const g of groups) {
        const legacy = readTimelineRaw(timelineKeyLegacy(sampleId, g));
        for (const [k, v] of Object.entries(legacy)) {
            const colId = Number(k);
            if (!Number.isFinite(colId)) continue;

            const cur = merged[colId] ?? { column_id: colId, entered_at: null, exited_at: null };

            const entered = (v as any)?.entered_at ?? null;
            const exited = (v as any)?.exited_at ?? null;

            const pickEarliest = (a: string | null, b: string | null) => {
                if (!a) return b;
                if (!b) return a;
                return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
            };
            const pickLatest = (a: string | null, b: string | null) => {
                if (!a) return b;
                if (!b) return a;
                return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
            };

            merged[colId] = {
                column_id: colId,
                entered_at: pickEarliest(cur.entered_at, entered),
                exited_at: pickLatest(cur.exited_at, exited),
            };
        }
    }

    // cleanup legacy keys best-effort (optional)
    try {
        for (const g of groups) localStorage.removeItem(timelineKeyLegacy(sampleId, g));
    } catch {
        // ignore
    }

    return merged;
}

export const SampleTestingKanbanTab = ({ sampleId, sample, onQualityCoverUnlocked }: Props) => {
    const [group, setGroup] = useState<string>(() => deriveGroupFromSample(sample));
    const [loading, setLoading] = useState(false);
    const [busyMove, setBusyMove] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [columns, setColumns] = useState<TestingBoardColumn[]>([]);
    const [cards, setCards] = useState<TestingBoardCard[]>([]);
    const [mode, setMode] = useState<"backend" | "fallback">("fallback");

    const [timeline, setTimeline] = useState<Record<number, StageStamp>>({});
    const [lastColumnId, setLastColumnId] = useState<number | null>(null);

    useEffect(() => {
        const next = deriveGroupFromSample(sample);
        setGroup((prev) => {
            if (prev && prev !== "default") return prev;
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, sample?.sample_type]);

    useEffect(() => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        // ✅ Read v2 timeline first
        const v2 = readTimeline(sampleId);

        // ✅ Migrate any v1 timelines (from group switching / auto-resolve)
        // Include a small set of likely groups + current group.
        const groupsToCheck = Array.from(
            new Set<string>([
                "default",
                "pcr_sars_cov_2",
                "pcr",
                "wgs",
                "elisa",
                String(group || "default"),
            ])
        );

        const migrated = migrateLegacyTimelines(sampleId, groupsToCheck);

        const merged = mergeTimeline(v2, migrated as any);
        setTimeline(merged);

        // also persist immediately (so next reload is stable)
        writeTimeline(sampleId, merged);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId]);

    useEffect(() => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        writeTimeline(sampleId, timeline);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeline, sampleId]);

    const load = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setLoading(true);
            setError(null);

            const res = await fetchTestingBoard({ group });

            // ✅ If backend resolves group, don't lose timeline anymore (v2 is sample-based)
            if (group === "default" && res.group && res.group !== group) {
                setGroup(res.group);
                // continue load anyway? safer: return and allow effect to reload columns/cards for the right group
                return;
            }

            setMode(res.mode);

            const nextCols = [...(res.columns ?? [])].sort((a, b) => a.position - b.position);
            setColumns(nextCols);

            const computedLast = (res as any)?.last_column_id ?? (res as any)?.board?.last_column_id ?? null;
            setLastColumnId(computedLast ? Number(computedLast) : null);

            const incomingCardsRaw: TestingBoardCard[] = Array.isArray(res.cards) ? res.cards : [];
            const incomingCards = incomingCardsRaw.map((c: any) => normalizeCard(c));

            const incomingHasMine = incomingCards.some((c) => Number(c.sample_id) === Number(sampleId));

            setCards((prev) => {
                const prevArr = Array.isArray(prev) ? prev : [];
                const prevHasMine = prevArr.some((c) => Number(c.sample_id) === Number(sampleId));

                // if backend board temporarily doesn't include mine, keep previous
                if (!incomingHasMine && prevHasMine) return prevArr;

                const prevById = new Map<number, any>();
                for (const p of prevArr) prevById.set(Number((p as any)?.sample_id), p);

                return (incomingCards ?? []).map((c: any) => {
                    const pid = Number(c?.sample_id);
                    const old = prevById.get(pid);
                    const entered_at = c?.entered_at ?? old?.entered_at ?? null;
                    const exited_at = c?.exited_at ?? old?.exited_at ?? null;
                    return { ...old, ...c, entered_at, exited_at };
                });
            });

            // ✅ Merge stamps from backend current card into timeline
            const mine = incomingCards.find((c) => Number(c.sample_id) === Number(sampleId));
            if (mine?.column_id) {
                const colId = Number(mine.column_id);
                setTimeline((prev) =>
                    mergeTimeline(prev, {
                        [colId]: {
                            entered_at: mine.entered_at ?? prev?.[colId]?.entered_at ?? null,
                            exited_at: mine.exited_at ?? prev?.[colId]?.exited_at ?? null,
                        },
                    })
                );
            }
        } catch (e: any) {
            setError(getErrorMessage(e, "Failed to load testing board."));
            setColumns([]);
            setCards((prev) => (prev ?? []).map((c: any) => normalizeCard(c)));
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
        return hit ? normalizeCard(hit as any) : null;
    }, [cards, sampleId]);

    const currentColIndex = useMemo(() => {
        if (!myCard?.column_id) return -1;
        return sortedCols.findIndex((c) => Number(c.column_id) === Number(myCard.column_id));
    }, [myCard, sortedCols]);

    const nextCol = useMemo(() => {
        if (currentColIndex < 0) return null;
        return sortedCols[currentColIndex + 1] ?? null;
    }, [sortedCols, currentColIndex]);

    const alreadyStarted = !!myCard?.column_id;

    const headerTitle = sample?.lab_sample_code || (sampleId ? `Sample #${sampleId}` : "Sample");
    const headerSub = sample?.sample_type || (sample?.client?.name ? `Client: ${sample.client.name}` : "—");

    const isAtLastColumn = useMemo(() => {
        if (!alreadyStarted) return false;
        const cur = Number(myCard?.column_id ?? 0);
        const last = lastColumnId ? Number(lastColumnId) : Number(sortedCols[sortedCols.length - 1]?.column_id ?? 0);
        return cur > 0 && last > 0 && cur === last;
    }, [alreadyStarted, myCard, lastColumnId, sortedCols]);

    const lastStageStamp = useMemo(() => {
        if (!isAtLastColumn) return null;
        const colId = Number(myCard?.column_id ?? 0);
        return timeline?.[colId] ?? null;
    }, [isAtLastColumn, myCard, timeline]);

    const isLastStageEnded = useMemo(() => {
        if (!isAtLastColumn) return false;
        const colId = Number(myCard?.column_id ?? 0);
        const exited = lastStageStamp?.exited_at ?? null;
        const exited2 = (myCard as any)?.exited_at ?? null;
        return !!(exited || exited2);
    }, [isAtLastColumn, lastStageStamp, myCard]);

    const doMove = async (toColumnId: number) => {
        if (!toColumnId) return;

        setBusyMove(true);
        setError(null);

        const nowIso = new Date().toISOString();
        const fromColId = myCard?.column_id ? Number(myCard.column_id) : null;

        // optimistic timeline update
        setTimeline((prev) => {
            const patch: any = {};
            if (fromColId) patch[fromColId] = { exited_at: nowIso };
            patch[toColumnId] = {
                entered_at: prev?.[toColumnId]?.entered_at ?? nowIso,
                exited_at: null,
            };
            return mergeTimeline(prev, patch);
        });

        const prevCards = cards;

        // optimistic current card move
        setCards((prev) => {
            const arr = Array.isArray(prev) ? prev : [];
            const hasMine = arr.some((c) => Number(c.sample_id) === Number(sampleId));

            const updated = hasMine
                ? arr.map((c) =>
                    Number(c.sample_id) === Number(sampleId)
                        ? normalizeCard({ ...c, column_id: toColumnId, entered_at: nowIso, exited_at: null })
                        : normalizeCard(c)
                )
                : [
                    ...arr.map((c: any) => normalizeCard(c)),
                    normalizeCard({
                        sample_id: sampleId,
                        lab_sample_code: sample?.lab_sample_code ?? null,
                        sample_type: sample?.sample_type ?? null,
                        client_name: sample?.client?.name ?? null,
                        status_enum: sample?.status_enum ?? null,
                        current_status: sample?.current_status ?? null,
                        column_id: toColumnId,
                        entered_at: nowIso,
                        exited_at: null,
                    }),
                ];

            return updated;
        });

        try {
            const res = await moveTestingCard({
                sample_id: sampleId,
                from_column_id: fromColId ?? null,
                to_column_id: toColumnId,
                workflow_group: group,
                note: null,
            });

            const movedAt =
                (res as any)?.data?.data?.moved_at ??
                (res as any)?.data?.moved_at ??
                (res as any)?.data?.data?.entered_at ??
                (res as any)?.data?.entered_at ??
                null;

            const stamp = movedAt ? String(movedAt) : nowIso;

            // confirm timeline with backend stamp
            setTimeline((prev) => {
                const patch: any = {};
                if (fromColId) patch[fromColId] = { exited_at: stamp };
                patch[toColumnId] = { entered_at: prev?.[toColumnId]?.entered_at ?? stamp, exited_at: null };
                return mergeTimeline(prev, patch);
            });

            await load();
        } catch (e: any) {
            setCards(prevCards);
            setError(getErrorMessage(e, "Move failed (backend endpoint not ready?)."));
        } finally {
            setBusyMove(false);
        }
    };

    const doFinalizeLastStage = async () => {
        if (!alreadyStarted) return;
        const colId = Number(myCard?.column_id ?? 0);
        if (!colId) return;

        setBusyMove(true);
        setError(null);

        const nowIso = new Date().toISOString();

        // optimistic: set exited_at on last stage (no move)
        setTimeline((prev) =>
            mergeTimeline(prev, {
                [colId]: {
                    entered_at: prev?.[colId]?.entered_at ?? (myCard as any)?.entered_at ?? nowIso,
                    exited_at: nowIso,
                },
            })
        );

        const prevCards = cards;
        setCards((prev) =>
            (Array.isArray(prev) ? prev : []).map((c) =>
                Number(c.sample_id) === Number(sampleId)
                    ? normalizeCard({ ...c, exited_at: nowIso })
                    : normalizeCard(c)
            )
        );

        try {
            await moveTestingCard({
                sample_id: sampleId,
                from_column_id: colId,
                to_column_id: colId, // stay in same column
                workflow_group: group,
                note: null,
                finalize: true,
            });

            await load();
            onQualityCoverUnlocked?.();
        } catch (e: any) {
            setCards(prevCards);
            setError(getErrorMessage(e, "End failed."));
        } finally {
            setBusyMove(false);
        }
    };

    const moveButton = (() => {
        if (!alreadyStarted) {
            return (
                <button
                    type="button"
                    className={cx("lims-btn-primary px-4 py-2", (!firstCol || busyMove) && "opacity-60 cursor-not-allowed")}
                    disabled={!firstCol || busyMove}
                    onClick={() => firstCol && doMove(firstCol.column_id)}
                    title="Record timestamp and enter first stage"
                >
                    {busyMove ? "Saving..." : "Add"}
                </button>
            );
        }

        if (alreadyStarted && nextCol) {
            return (
                <button
                    type="button"
                    className={cx("lims-btn-primary px-4 py-2", busyMove && "opacity-60 cursor-not-allowed")}
                    disabled={busyMove}
                    onClick={() => doMove(nextCol.column_id)}
                    title="Move to next stage and record timestamp"
                >
                    {busyMove ? "Moving..." : "Move"}
                </button>
            );
        }

        if (isAtLastColumn && !isLastStageEnded) {
            return (
                <button
                    type="button"
                    className={cx("lims-btn-primary px-4 py-2", busyMove && "opacity-60 cursor-not-allowed")}
                    disabled={busyMove}
                    onClick={doFinalizeLastStage}
                    title="Record exited timestamp for last stage and unlock Quality Cover"
                >
                    {busyMove ? "Saving..." : "End"}
                </button>
            );
        }

        return (
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                Completed ✅
            </span>
        );
    })();

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <div className="text-sm font-extrabold text-gray-900 truncate">{headerTitle}</div>
                        <div className="text-xs text-gray-600 mt-1 truncate">{headerSub}</div>

                        <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                            <span>
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
                            </span>
                            {lastColumnId ? (
                                <span className="text-[10px] font-mono text-gray-400">last_column_id: {lastColumnId}</span>
                            ) : null}
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

                        {moveButton}
                    </div>
                </div>

                {error && (
                    <div className="px-4 pt-4">
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                            {error}
                        </div>
                    </div>
                )}

                <div className="px-4 py-4">
                    <div className="text-xs text-gray-500 mb-3">
                        Tracks sample stages with timestamps. Entered/Exited are shown inside each stage card.
                    </div>

                    <div className="overflow-x-auto">
                        <div className="min-w-[980px] grid grid-flow-col auto-cols-[320px] gap-4 pb-2">
                            {sortedCols.map((col) => {
                                const isHere = alreadyStarted && Number(myCard?.column_id) === Number(col.column_id);
                                const idx = sortedCols.findIndex((c) => Number(c.column_id) === Number(col.column_id));
                                const isDone = alreadyStarted && currentColIndex >= 0 && idx < currentColIndex;

                                const stamp = timeline?.[Number(col.column_id)] ?? null;

                                const shouldShowStageCard =
                                    isHere ||
                                    isDone ||
                                    !!stamp?.entered_at ||
                                    !!stamp?.exited_at;

                                // ✅ For completed stages, ALWAYS prefer timeline stamps (persisted)
                                const enteredAt =
                                    stamp?.entered_at ??
                                    (isHere ? (myCard as any)?.entered_at ?? null : null);

                                const exitedAt =
                                    stamp?.exited_at ??
                                    (isHere ? (myCard as any)?.exited_at ?? null : null);

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

                                        <div className="px-3 py-3 min-h-[210px]">
                                            {shouldShowStageCard ? (
                                                <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                                                    <div className="text-xs font-semibold text-gray-900">{headerTitle}</div>
                                                    <div className="text-[11px] text-gray-500 mt-1">{headerSub}</div>

                                                    <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-gray-700">
                                                        <div>
                                                            <span className="font-semibold">Entered:</span> {fmt(enteredAt)}
                                                        </div>
                                                        <div>
                                                            <span className="font-semibold">Exited:</span> {fmt(exitedAt)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                                                    {!alreadyStarted
                                                        ? col === firstCol
                                                            ? "Start by clicking “Add”."
                                                            : "—"
                                                        : "No record yet."}
                                                </div>
                                            )}

                                            {isHere && alreadyStarted && (
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
                                                        <div className="space-y-2">
                                                            {!isLastStageEnded ? (
                                                                <button
                                                                    type="button"
                                                                    className={cx(
                                                                        "w-full px-4 py-2 rounded-xl border border-primary bg-primary text-white text-sm font-semibold hover:opacity-90",
                                                                        busyMove && "opacity-60 cursor-not-allowed"
                                                                    )}
                                                                    disabled={busyMove}
                                                                    onClick={doFinalizeLastStage}
                                                                    title="Record exited timestamp for last stage and unlock Quality Cover"
                                                                >
                                                                    {busyMove ? "Saving..." : "End"}
                                                                </button>
                                                            ) : (
                                                                <div className="w-full px-4 py-2 rounded-xl border border-emerald-100 bg-emerald-50 text-sm font-semibold text-emerald-800">
                                                                    Completed ✅
                                                                </div>
                                                            )}
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

                    {sortedCols.length === 0 && !loading && (
                        <div className="text-sm text-gray-600">No columns available for this workflow group.</div>
                    )}
                </div>
            </div>
        </div>
    );
};
