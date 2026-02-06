// L:\Campus\Final Countdown\biotrace\frontend\src\components\samples\SampleTestingKanbanTab.tsx
import { useEffect, useMemo, useState } from "react";
import { RefreshCw, ChevronRight, Play, Square, Plus, Pencil, Trash2 } from "lucide-react";
import { getErrorMessage } from "../../utils/errors";
import {
    fetchTestingBoard,
    moveTestingCard,
    addTestingColumn,
    renameTestingColumn,
    deleteTestingColumn,
    type TestingBoardCard,
    type TestingBoardColumn,
} from "../../services/testingBoard";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function fmt(x?: string | null) {
    if (!x) return "—";
    const d = new Date(x);
    if (Number.isNaN(d.getTime())) return String(x);
    return d.toLocaleString();
}

type Props = {
    sampleId: number;
    sample?: any;
    onQualityCoverUnlocked?: () => void;
};

function deriveGroupFromBackend(sample: any): string {
    const g =
        sample?.workflow_group ??
        sample?.workflowGroup ??
        sample?.workflow_group_name ??
        null;

    const s = String(g ?? "").trim().toLowerCase();
    return s || "default";
}

function normalizeCard(c: any): TestingBoardCard {
    const entered = c?.entered_at ?? c?.enteredAt ?? c?.moved_at ?? c?.movedAt ?? null;
    const exited = c?.exited_at ?? c?.exitedAt ?? null;

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

function timelineKeyV2(sampleId: number) {
    return `biotrace.testing_board.timeline.v2:${sampleId}`;
}

function readTimeline(sampleId: number): Record<number, StageStamp> {
    try {
        const raw = localStorage.getItem(timelineKeyV2(sampleId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const out: Record<number, StageStamp> = {};
        for (const [k, v] of Object.entries(parsed)) {
            const colId = Number(k);
            if (!Number.isFinite(colId)) continue;
            out[colId] = {
                column_id: colId,
                entered_at: (v as any)?.entered_at ?? null,
                exited_at: (v as any)?.exited_at ?? null,
            };
        }
        return out;
    } catch {
        return {};
    }
}

function writeTimeline(sampleId: number, map: Record<number, StageStamp>) {
    try {
        localStorage.setItem(timelineKeyV2(sampleId), JSON.stringify(map ?? {}));
    } catch {
        // ignore
    }
}

function mergeTimeline(prev: Record<number, StageStamp>, patch: Record<number, Partial<StageStamp>>) {
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

function buildTimelineFromBackend(res: any): Record<number, StageStamp> {
    const candidates =
        (res?.events ?? res?.timeline ?? res?.history ?? res?.card_events ?? res?.cardEvents ?? []) as any[];

    if (!Array.isArray(candidates) || candidates.length === 0) return {};

    const out: Record<number, StageStamp> = {};

    const upsert = (colId: number, patch: Partial<StageStamp>) => {
        const cur = out[colId] ?? { column_id: colId, entered_at: null, exited_at: null };
        const next: StageStamp = {
            column_id: colId,
            entered_at: patch.entered_at ?? cur.entered_at ?? null,
            exited_at: patch.exited_at ?? cur.exited_at ?? null,
        };

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

        next.entered_at = pickEarliest(cur.entered_at, next.entered_at);
        next.exited_at = pickLatest(cur.exited_at, next.exited_at);

        out[colId] = next;
    };

    for (const e of candidates) {
        const fromId = Number(e?.from_column_id ?? e?.fromColumnId ?? 0) || null;
        const toId = Number(e?.to_column_id ?? e?.toColumnId ?? 0) || null;

        const movedAt = e?.moved_at ?? e?.movedAt ?? e?.created_at ?? e?.createdAt ?? null;

        const enteredAt = e?.entered_at ?? e?.enteredAt ?? movedAt ?? null;
        const exitedAt = e?.exited_at ?? e?.exitedAt ?? null;

        if (toId) upsert(toId, { entered_at: enteredAt });
        if (fromId) upsert(fromId, { exited_at: movedAt ?? exitedAt ?? null });
    }

    return out;
}

export const SampleTestingKanbanTab = ({ sampleId, sample, onQualityCoverUnlocked }: Props) => {
    const [group, setGroup] = useState<string>(() => deriveGroupFromBackend(sample));

    const [loading, setLoading] = useState(false);
    const [busyMove, setBusyMove] = useState(false);
    const [busyCols, setBusyCols] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [columns, setColumns] = useState<TestingBoardColumn[]>([]);
    const [cards, setCards] = useState<TestingBoardCard[]>([]);

    const [mode, setMode] = useState<"synced" | "local">("local");

    const [timeline, setTimeline] = useState<Record<number, StageStamp>>({});
    const [lastColumnId, setLastColumnId] = useState<number | null>(null);

    // ✅ workflow group should come from backend sample.workflow_group
    useEffect(() => {
        const next = deriveGroupFromBackend(sample);
        setGroup(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, sample?.workflow_group, sample?.workflowGroup]);

    useEffect(() => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        setTimeline(readTimeline(sampleId));
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

            const rawMode = String((res as any)?.mode ?? "");
            setMode(rawMode === "backend" ? "synced" : "local");

            const nextCols = [...(res.columns ?? [])].sort((a, b) => a.position - b.position);
            setColumns(nextCols);

            const computedLast = (res as any)?.last_column_id ?? (res as any)?.board?.last_column_id ?? null;
            setLastColumnId(computedLast ? Number(computedLast) : null);

            const incomingCardsRaw: TestingBoardCard[] = Array.isArray(res.cards) ? res.cards : [];
            const incomingCards = incomingCardsRaw.map((c: any) => normalizeCard(c));
            setCards(incomingCards);

            const fromBackend = buildTimelineFromBackend(res);
            const fromLocal = readTimeline(sampleId);

            setTimeline((prev) => {
                const base = { ...fromLocal, ...(prev ?? {}) };
                return mergeTimeline(base, fromBackend);
            });

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
            setCards([]);
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

    const headerTitle = sample?.lab_sample_code || "—";
    const headerSub = sample?.sample_type || "—";

    const isAtLastColumn = useMemo(() => {
        if (!alreadyStarted) return false;
        const cur = Number(myCard?.column_id ?? 0);
        const last = lastColumnId
            ? Number(lastColumnId)
            : Number(sortedCols[sortedCols.length - 1]?.column_id ?? 0);
        return cur > 0 && last > 0 && cur === last;
    }, [alreadyStarted, myCard, lastColumnId, sortedCols]);

    const isLastStageEnded = useMemo(() => {
        if (!isAtLastColumn) return false;
        const colId = Number(myCard?.column_id ?? 0);
        const exited = timeline?.[colId]?.exited_at ?? null;
        const exited2 = (myCard as any)?.exited_at ?? null;
        return !!(exited || exited2);
    }, [isAtLastColumn, myCard, timeline]);

    const doMove = async (toColumnId: number) => {
        if (!toColumnId) return;

        setBusyMove(true);
        setError(null);

        const nowIso = new Date().toISOString();
        const fromColId = myCard?.column_id ? Number(myCard.column_id) : null;

        setTimeline((prev) => {
            const patch: any = {};
            if (fromColId) patch[fromColId] = { exited_at: nowIso };
            patch[toColumnId] = { entered_at: prev?.[toColumnId]?.entered_at ?? nowIso, exited_at: null };
            return mergeTimeline(prev, patch);
        });

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

            setTimeline((prev) => {
                const patch: any = {};
                if (fromColId) patch[fromColId] = { exited_at: stamp };
                patch[toColumnId] = { entered_at: prev?.[toColumnId]?.entered_at ?? stamp, exited_at: null };
                return mergeTimeline(prev, patch);
            });

            await load();
        } catch (e: any) {
            setError(getErrorMessage(e, "Move failed."));
            await load();
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

        setTimeline((prev) =>
            mergeTimeline(prev, {
                [colId]: {
                    entered_at: prev?.[colId]?.entered_at ?? (myCard as any)?.entered_at ?? nowIso,
                    exited_at: nowIso,
                },
            })
        );

        setCards((prev) =>
            (Array.isArray(prev) ? prev : []).map((c) =>
                Number(c.sample_id) === Number(sampleId) ? normalizeCard({ ...c, exited_at: nowIso }) : normalizeCard(c)
            )
        );

        try {
            await moveTestingCard({
                sample_id: sampleId,
                from_column_id: colId,
                to_column_id: colId,
                workflow_group: group,
                note: null,
                finalize: true,
            });

            await load();
            onQualityCoverUnlocked?.();
        } catch (e: any) {
            setError(getErrorMessage(e, "End failed."));
            await load();
        } finally {
            setBusyMove(false);
        }
    };

    // --------------------
    // ✅ Column CRUD (synced only)
    // --------------------
    const canEditColumns = mode === "synced" && !loading && !busyMove && !busyCols;

    async function onAddColumn(side: "left" | "right", relativeTo: TestingBoardColumn) {
        if (!canEditColumns) return;

        const name = window.prompt(`New column name (${side} of "${relativeTo.name}"):`)?.trim();
        if (!name) return;

        setBusyCols(true);
        setError(null);
        try {
            await addTestingColumn({
                group,
                name,
                relative_to_column_id: relativeTo.column_id,
                side,
            });
            await load();
        } catch (e: any) {
            setError(getErrorMessage(e, "Failed to add column."));
        } finally {
            setBusyCols(false);
        }
    }

    async function onRenameColumn(col: TestingBoardColumn) {
        if (!canEditColumns) return;

        const next = window.prompt(`Rename column "${col.name}" to:`, col.name)?.trim();
        if (!next || next === col.name) return;

        setBusyCols(true);
        setError(null);
        try {
            await renameTestingColumn(col.column_id, next);
            await load();
        } catch (e: any) {
            setError(getErrorMessage(e, "Failed to rename column."));
        } finally {
            setBusyCols(false);
        }
    }

    async function onDeleteColumn(col: TestingBoardColumn) {
        if (!canEditColumns) return;

        const ok = window.confirm(
            `Delete column "${col.name}"?\n\nNote: this should be empty (no cards) to be safe.`
        );
        if (!ok) return;

        setBusyCols(true);
        setError(null);
        try {
            await deleteTestingColumn(col.column_id);
            await load();
        } catch (e: any) {
            setError(getErrorMessage(e, "Failed to delete column."));
        } finally {
            setBusyCols(false);
        }
    }

    const actionButton = (() => {
        if (!alreadyStarted) {
            return (
                <button
                    type="button"
                    className={cx("lims-icon-button", (!firstCol || busyMove) && "opacity-50 cursor-not-allowed")}
                    disabled={!firstCol || busyMove}
                    onClick={() => firstCol && doMove(firstCol.column_id)}
                    aria-label="Start"
                    title="Start"
                >
                    <Play size={16} />
                </button>
            );
        }

        if (alreadyStarted && nextCol) {
            return (
                <button
                    type="button"
                    className={cx("lims-icon-button", busyMove && "opacity-50 cursor-not-allowed")}
                    disabled={busyMove}
                    onClick={() => doMove(nextCol.column_id)}
                    aria-label="Next"
                    title="Next"
                >
                    <ChevronRight size={16} />
                </button>
            );
        }

        if (isAtLastColumn && !isLastStageEnded) {
            return (
                <button
                    type="button"
                    className={cx("lims-icon-button", busyMove && "opacity-50 cursor-not-allowed")}
                    disabled={busyMove}
                    onClick={doFinalizeLastStage}
                    aria-label="End"
                    title="End"
                >
                    <Square size={16} />
                </button>
            );
        }

        return (
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700">
                done
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
                            <span
                                className={cx(
                                    "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold border",
                                    mode === "synced"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-amber-200 bg-amber-50 text-amber-800"
                                )}
                                title={mode === "synced" ? "Board data comes from server" : "Board uses local fallback"}
                            >
                                {mode === "synced" ? "synced" : "local"}
                            </span>

                            <span
                                className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold border border-gray-200 bg-gray-50 text-gray-700"
                                title="Workflow group (from backend)"
                            >
                                {group || "default"}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            className="lims-icon-button"
                            onClick={load}
                            disabled={loading || busyMove || busyCols}
                            aria-label="Refresh"
                            title="Refresh"
                        >
                            <RefreshCw size={16} />
                        </button>

                        {actionButton}
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
                    <div className="overflow-x-auto">
                        <div className="min-w-[980px] grid grid-flow-col auto-cols-[320px] gap-4 pb-2">
                            {sortedCols.map((col) => {
                                const isHere = alreadyStarted && Number(myCard?.column_id) === Number(col.column_id);
                                const idx = sortedCols.findIndex((c) => Number(c.column_id) === Number(col.column_id));
                                const isDone = alreadyStarted && currentColIndex >= 0 && idx < currentColIndex;

                                const stamp = timeline?.[Number(col.column_id)] ?? null;
                                const enteredAt = stamp?.entered_at ?? (isHere ? (myCard as any)?.entered_at ?? null : null);
                                const exitedAt = stamp?.exited_at ?? (isHere ? (myCard as any)?.exited_at ?? null : null);

                                const hasAnyStamp = !!enteredAt || !!exitedAt;

                                return (
                                    <div
                                        key={col.column_id}
                                        className={cx(
                                            "rounded-2xl border bg-white overflow-hidden",
                                            isHere ? "border-primary ring-2 ring-primary-soft" : "border-gray-200"
                                        )}
                                    >
                                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-sm font-extrabold text-gray-900 truncate">{col.name}</div>
                                                <div className="text-xs text-gray-500 mt-0.5">
                                                    {isHere ? "current" : isDone ? "done" : "pending"}
                                                </div>
                                            </div>

                                            {/* ✅ Column actions */}
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    className={cx(
                                                        "lims-icon-button",
                                                        !canEditColumns && "opacity-40 cursor-not-allowed"
                                                    )}
                                                    disabled={!canEditColumns}
                                                    title="Add column left"
                                                    onClick={() => onAddColumn("left", col)}
                                                >
                                                    <Plus size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    className={cx(
                                                        "lims-icon-button",
                                                        !canEditColumns && "opacity-40 cursor-not-allowed"
                                                    )}
                                                    disabled={!canEditColumns}
                                                    title="Rename column"
                                                    onClick={() => onRenameColumn(col)}
                                                >
                                                    <Pencil size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    className={cx(
                                                        "lims-icon-button",
                                                        !canEditColumns && "opacity-40 cursor-not-allowed"
                                                    )}
                                                    disabled={!canEditColumns}
                                                    title="Delete column"
                                                    onClick={() => onDeleteColumn(col)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>

                                                <button
                                                    type="button"
                                                    className={cx(
                                                        "lims-icon-button",
                                                        !canEditColumns && "opacity-40 cursor-not-allowed"
                                                    )}
                                                    disabled={!canEditColumns}
                                                    title="Add column right"
                                                    onClick={() => onAddColumn("right", col)}
                                                >
                                                    <Plus size={16} className="rotate-180" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="px-3 py-3 min-h-[210px]">
                                            {hasAnyStamp || isHere ? (
                                                <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                                                    <div className="text-xs font-semibold text-gray-900">{headerTitle}</div>
                                                    <div className="text-[11px] text-gray-500 mt-1">{headerSub}</div>

                                                    <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-gray-700">
                                                        <div>
                                                            <span className="font-semibold">entered:</span> {fmt(enteredAt)}
                                                        </div>
                                                        <div>
                                                            <span className="font-semibold">exited:</span> {fmt(exitedAt)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                                                    —
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {sortedCols.length === 0 && !loading && (
                        <div className="text-sm text-gray-600">No columns.</div>
                    )}
                </div>
            </div>
        </div>
    );
};
