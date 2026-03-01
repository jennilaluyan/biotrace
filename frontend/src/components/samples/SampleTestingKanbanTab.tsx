import { useCallback, useEffect, useMemo, useState } from "react";
import {
    CheckCircle2,
    ChevronRight,
    Lock,
    Pencil,
    Play,
    Plus,
    RefreshCw,
    Square,
    Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";
import {
    fetchTestingBoard,
    moveTestingCard,
    addTestingColumn,
    renameTestingColumn,
    deleteTestingColumn,
    type TestingBoardCard,
    type TestingBoardColumn,
} from "../../services/testingBoard";

import { RenameKanbanColumnModal } from "./RenameKanbanColumnModal";
import { AddKanbanColumnModal } from "./AddKanbanColumnModal";
import { DeleteKanbanColumnModal } from "./DeleteKanbanColumnModal";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    sampleId: number;
    sample?: any;
    onQualityCoverUnlocked?: () => void;
};

function deriveGroupFromBackend(sample: any): string {
    const g = sample?.workflow_group ?? sample?.workflowGroup ?? sample?.workflow_group_name ?? null;
    const s = String(g ?? "").trim().toLowerCase();
    if (!s) return "default";

    // legacy -> new
    if (s === "pcr_sars_cov_2") return "pcr";
    if (s === "wgs_sars_cov_2") return "sequencing";
    if (s === "antigen") return "rapid";
    if (s === "group_19_22" || s === "group_23_32") return "microbiology";

    // already new (or unknown)
    return s;
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
    const { t, i18n } = useTranslation();

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

    // Rename Modal State
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<TestingBoardColumn | null>(null);
    const [renameSaving, setRenameSaving] = useState(false);
    const [renameError, setRenameError] = useState<string | null>(null);

    // Add Modal State
    const [addOpen, setAddOpen] = useState(false);
    const [addSide, setAddSide] = useState<"left" | "right">("right");
    const [addRelative, setAddRelative] = useState<TestingBoardColumn | null>(null);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    // Delete Modal State
    const [delOpen, setDelOpen] = useState(false);
    const [delTarget, setDelTarget] = useState<TestingBoardColumn | null>(null);
    const [delSaving, setDelSaving] = useState(false);
    const [delError, setDelError] = useState<string | null>(null);

    // workflow group should come from backend sample.workflow_group
    useEffect(() => {
        const next = deriveGroupFromBackend(sample);
        setGroup(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sampleId, sample?.workflow_group, sample?.workflowGroup, sample?.workflow_group_name]);

    useEffect(() => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        setTimeline(readTimeline(sampleId));
    }, [sampleId]);

    useEffect(() => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        writeTimeline(sampleId, timeline);
    }, [timeline, sampleId]);

    const fmt = useCallback(
        (x?: string | null) => {
            if (!x) return t("samples.kanbanTab.timestamp.none");
            return formatDateTimeLocal(x);
        },
        // ensure re-render when language changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [i18n.resolvedLanguage, i18n.language]
    );

    const load = useCallback(async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setLoading(true);
            setError(null);

            const res = await fetchTestingBoard({ group, sample_id: sampleId });

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
            setError(getErrorMessage(e, t("samples.kanbanTab.errors.loadFailed")));
            setColumns([]);
            setCards([]);
        } finally {
            setLoading(false);
        }
    }, [group, sampleId, t]);

    useEffect(() => {
        load();
    }, [load]);

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

    const headerCode = sample?.lab_sample_code || "—";
    const headerType = sample?.sample_type || "—";

    const isAtLastColumn = useMemo(() => {
        if (!alreadyStarted) return false;
        const cur = Number(myCard?.column_id ?? 0);
        const last = lastColumnId ? Number(lastColumnId) : Number(sortedCols[sortedCols.length - 1]?.column_id ?? 0);
        return cur > 0 && last > 0 && cur === last;
    }, [alreadyStarted, myCard, lastColumnId, sortedCols]);

    const isLastStageEnded = useMemo(() => {
        if (!isAtLastColumn) return false;
        const colId = Number(myCard?.column_id ?? 0);
        const exited = timeline?.[colId]?.exited_at ?? null;
        const exited2 = (myCard as any)?.exited_at ?? null;
        return !!(exited || exited2);
    }, [isAtLastColumn, myCard, timeline]);

    // DONE detector: prefer backend done flags, fallback to kanban computed
    const isSampleDone = useMemo(() => {
        const hardDoneFlags = [
            (sample as any)?.testing_completed_at,
            (sample as any)?.testing_done_at,
            (sample as any)?.tests_completed_at,
        ].filter(Boolean);

        if (hardDoneFlags.length > 0) return true;
        return isAtLastColumn && isLastStageEnded;
    }, [sample, isAtLastColumn, isLastStageEnded]);

    const doMove = async (toColumnId: number) => {
        if (!toColumnId) return;

        setBusyMove(true);
        setError(null);

        const nowIso = new Date().toISOString();
        const fromColId = myCard?.column_id ? Number(myCard.column_id) : null;

        // optimistic timeline
        setTimeline((prev) => {
            const patch: any = {};
            if (fromColId) patch[fromColId] = { exited_at: nowIso };
            patch[toColumnId] = { entered_at: prev?.[toColumnId]?.entered_at ?? nowIso, exited_at: null };
            return mergeTimeline(prev, patch);
        });

        // optimistic card
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
            setError(getErrorMessage(e, t("samples.kanbanTab.errors.moveFailed")));
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
            setError(getErrorMessage(e, t("samples.kanbanTab.errors.finishFailed")));
            await load();
        } finally {
            setBusyMove(false);
        }
    };

    // Column CRUD (synced only) + LOCK when sample DONE
    const canEditColumns =
        mode === "synced" &&
        !isSampleDone &&
        !loading &&
        !busyMove &&
        !busyCols &&
        !renameSaving &&
        !addSaving &&
        !delSaving;

    function openAdd(side: "left" | "right", relativeTo: TestingBoardColumn) {
        if (!canEditColumns) return;
        setAddError(null);
        setAddSide(side);
        setAddRelative(relativeTo);
        setAddOpen(true);
    }

    async function submitAdd(name: string) {
        if (!addRelative) return;
        if (!canEditColumns) return;

        setAddSaving(true);
        setAddError(null);
        try {
            await addTestingColumn({
                group,
                name,
                relative_to_column_id: addRelative.column_id,
                side: addSide,
            } as any);
            setAddOpen(false);
            setAddRelative(null);
            await load();
        } catch (e: any) {
            setAddError(getErrorMessage(e, t("samples.kanbanTab.errors.addColumnFailed")));
        } finally {
            setAddSaving(false);
        }
    }

    function openRename(col: TestingBoardColumn) {
        if (!canEditColumns) return;
        setRenameError(null);
        setRenameTarget(col);
        setRenameOpen(true);
    }

    async function submitRename(nextName: string) {
        if (!renameTarget) return;
        if (!canEditColumns) return;

        setRenameSaving(true);
        setRenameError(null);
        try {
            await renameTestingColumn(renameTarget.column_id, nextName);
            setRenameOpen(false);
            setRenameTarget(null);
            await load();
        } catch (e: any) {
            setRenameError(getErrorMessage(e, t("samples.kanbanTab.errors.renameColumnFailed")));
        } finally {
            setRenameSaving(false);
        }
    }

    function openDelete(col: TestingBoardColumn) {
        if (!canEditColumns) return;
        setDelError(null);
        setDelTarget(col);
        setDelOpen(true);
    }

    async function submitDelete() {
        if (!delTarget) return;
        if (!canEditColumns) return;

        setDelSaving(true);
        setDelError(null);
        try {
            await deleteTestingColumn(delTarget.column_id);
            setDelOpen(false);
            setDelTarget(null);
            await load();
        } catch (e: any) {
            setDelError(getErrorMessage(e, t("samples.kanbanTab.errors.deleteColumnFailed")));
        } finally {
            setDelSaving(false);
        }
    }

    const primaryAction = (() => {
        if (isSampleDone) {
            return (
                <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700">
                    <CheckCircle2 size={16} />
                    {t("samples.kanbanTab.actions.done")}
                </span>
            );
        }

        if (!alreadyStarted) {
            return (
                <button
                    type="button"
                    className={cx(
                        "lims-btn-primary inline-flex items-center gap-2",
                        (!firstCol || busyMove) && "opacity-60 cursor-not-allowed"
                    )}
                    disabled={!firstCol || busyMove}
                    onClick={() => firstCol && doMove(firstCol.column_id)}
                >
                    <Play size={16} />
                    {t("samples.kanbanTab.actions.start")}
                </button>
            );
        }

        if (alreadyStarted && nextCol) {
            return (
                <button
                    type="button"
                    className={cx("lims-btn-primary inline-flex items-center gap-2", busyMove && "opacity-60 cursor-not-allowed")}
                    disabled={busyMove}
                    onClick={() => doMove(nextCol.column_id)}
                >
                    <ChevronRight size={16} />
                    {t("samples.kanbanTab.actions.next")}
                </button>
            );
        }

        if (isAtLastColumn && !isLastStageEnded) {
            return (
                <button
                    type="button"
                    className={cx("lims-btn-primary inline-flex items-center gap-2", busyMove && "opacity-60 cursor-not-allowed")}
                    disabled={busyMove}
                    onClick={doFinalizeLastStage}
                >
                    <Square size={16} />
                    {t("samples.kanbanTab.actions.finish")}
                </button>
            );
        }

        return (
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={16} />
                {t("samples.kanbanTab.actions.done")}
            </span>
        );
    })();

    const badgeModeClass =
        mode === "synced"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-800";

    const showBusy = loading || busyMove || busyCols || renameSaving || addSaving || delSaving;

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-4 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-sm md:text-base font-extrabold text-gray-900">
                                {t("samples.kanbanTab.title")}
                            </h2>

                            {isSampleDone && (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold border border-gray-200 bg-gray-50 text-gray-700">
                                    <Lock size={14} />
                                    {t("samples.kanbanTab.badges.locked")}
                                </span>
                            )}
                        </div>

                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold border border-gray-200 bg-gray-50 text-gray-700">
                                <span className="font-semibold">{t("samples.kanbanTab.header.labCode")}:</span>
                                <span className="ml-1 font-mono">{headerCode}</span>
                            </span>

                            <span className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold border border-gray-200 bg-gray-50 text-gray-700">
                                <span className="font-semibold">{t("samples.kanbanTab.header.sampleType")}:</span>
                                <span className="ml-1">{headerType}</span>
                            </span>
                        </div>

                        <div className="mt-2 text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                            <span
                                className={cx("inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold border", badgeModeClass)}
                                title={mode === "synced" ? t("samples.kanbanTab.tooltips.synced") : t("samples.kanbanTab.tooltips.local")}
                            >
                                {mode === "synced" ? t("samples.kanbanTab.badges.synced") : t("samples.kanbanTab.badges.local")}
                            </span>

                            <span
                                className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold border border-gray-200 bg-gray-50 text-gray-700"
                                title={t("samples.kanbanTab.tooltips.group")}
                            >
                                {group || "default"}
                            </span>

                            {alreadyStarted && sortedCols.length > 0 && (
                                <span className="inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold border border-gray-200 bg-gray-50 text-gray-700">
                                    {t("samples.kanbanTab.progress", {
                                        current: Math.max(1, currentColIndex + 1),
                                        total: sortedCols.length,
                                    })}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            className={cx("lims-icon-button", showBusy && "opacity-60 cursor-not-allowed")}
                            onClick={load}
                            disabled={showBusy}
                            aria-label={t("refresh")}
                            title={t("refresh")}
                        >
                            <RefreshCw size={16} />
                        </button>

                        {primaryAction}
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
                    {loading && sortedCols.length === 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[0, 1, 2].map((k) => (
                                <div key={k} className="rounded-2xl border border-gray-200 bg-white overflow-hidden animate-pulse">
                                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                        <div className="h-4 w-1/2 bg-gray-200 rounded" />
                                        <div className="h-3 w-1/3 bg-gray-200 rounded mt-2" />
                                    </div>
                                    <div className="px-4 py-4">
                                        <div className="h-20 bg-gray-100 rounded-xl" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
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

                                        const statusKey = isHere ? "current" : isDone ? "done" : "pending";
                                        const statusText = t(`samples.kanbanTab.column.status.${statusKey}`);

                                        return (
                                            <div
                                                key={col.column_id}
                                                className={cx(
                                                    "group rounded-2xl border bg-white overflow-hidden",
                                                    isHere ? "border-primary ring-2 ring-primary-soft" : "border-gray-200"
                                                )}
                                            >
                                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-extrabold text-gray-900 truncate">{col.name}</div>
                                                        <div className="text-xs text-gray-500 mt-0.5">
                                                            <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                                                                statusKey === "current"
                                                                    ? "border-blue-200 bg-blue-50 text-blue-700"
                                                                    : statusKey === "done"
                                                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                                        : "border-gray-200 bg-white text-gray-700"
                                                            )}>
                                                                {statusText}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Column actions (synced only) */}
                                                    <div
                                                        className={cx(
                                                            "flex items-center gap-1",
                                                            canEditColumns ? "opacity-100" : "opacity-50",
                                                            // reduce visual noise: show on hover for desktop
                                                            "md:opacity-0 md:group-hover:opacity-100 md:transition-opacity"
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            className={cx("lims-icon-button", !canEditColumns && "cursor-not-allowed")}
                                                            disabled={!canEditColumns}
                                                            title={
                                                                isSampleDone
                                                                    ? t("samples.kanbanTab.columnActions.locked")
                                                                    : t("samples.kanbanTab.columnActions.addBefore")
                                                            }
                                                            aria-label={t("samples.kanbanTab.columnActions.addBefore")}
                                                            onClick={() => openAdd("left", col)}
                                                        >
                                                            <Plus size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx("lims-icon-button", !canEditColumns && "cursor-not-allowed")}
                                                            disabled={!canEditColumns}
                                                            title={
                                                                isSampleDone
                                                                    ? t("samples.kanbanTab.columnActions.locked")
                                                                    : t("samples.kanbanTab.columnActions.rename")
                                                            }
                                                            aria-label={t("samples.kanbanTab.columnActions.rename")}
                                                            onClick={() => openRename(col)}
                                                        >
                                                            <Pencil size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx("lims-icon-button", !canEditColumns && "cursor-not-allowed")}
                                                            disabled={!canEditColumns}
                                                            title={
                                                                isSampleDone
                                                                    ? t("samples.kanbanTab.columnActions.locked")
                                                                    : t("samples.kanbanTab.columnActions.delete")
                                                            }
                                                            aria-label={t("samples.kanbanTab.columnActions.delete")}
                                                            onClick={() => openDelete(col)}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx("lims-icon-button", !canEditColumns && "cursor-not-allowed")}
                                                            disabled={!canEditColumns}
                                                            title={
                                                                isSampleDone
                                                                    ? t("samples.kanbanTab.columnActions.locked")
                                                                    : t("samples.kanbanTab.columnActions.addAfter")
                                                            }
                                                            aria-label={t("samples.kanbanTab.columnActions.addAfter")}
                                                            onClick={() => openAdd("right", col)}
                                                        >
                                                            <Plus size={16} className="rotate-180" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="px-3 py-3 min-h-[210px]">
                                                    {hasAnyStamp || isHere ? (
                                                        <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                                                            <div className="text-xs font-semibold text-gray-900">{headerCode}</div>
                                                            <div className="text-[11px] text-gray-500 mt-1">{headerType}</div>

                                                            <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-gray-700">
                                                                <div>
                                                                    <span className="font-semibold">{t("samples.kanbanTab.column.entered")}:</span>{" "}
                                                                    {fmt(enteredAt)}
                                                                </div>
                                                                <div>
                                                                    <span className="font-semibold">{t("samples.kanbanTab.column.exited")}:</span>{" "}
                                                                    {fmt(exitedAt)}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                                                            {t("samples.kanbanTab.column.empty")}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {sortedCols.length === 0 && !loading && (
                                <div className="text-sm text-gray-600">{t("samples.kanbanTab.empty.noColumns")}</div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Add modal */}
            <AddKanbanColumnModal
                open={addOpen}
                side={addSide}
                relativeToName={addRelative?.name ?? ""}
                loading={addSaving}
                error={addError}
                onClose={() => {
                    if (addSaving) return;
                    setAddOpen(false);
                    setAddRelative(null);
                    setAddError(null);
                }}
                onSubmit={submitAdd}
            />

            {/* Rename modal */}
            <RenameKanbanColumnModal
                open={renameOpen}
                currentName={renameTarget?.name ?? ""}
                title={
                    renameTarget
                        ? t("samples.kanbanTab.renameModal.titleNamed", { name: renameTarget.name })
                        : t("samples.kanbanTab.renameModal.title")
                }
                loading={renameSaving}
                error={renameError}
                onClose={() => {
                    if (renameSaving) return;
                    setRenameOpen(false);
                    setRenameTarget(null);
                    setRenameError(null);
                }}
                onSubmit={submitRename}
            />

            {/* Delete modal */}
            <DeleteKanbanColumnModal
                open={delOpen}
                columnName={delTarget?.name ?? ""}
                loading={delSaving}
                error={delError}
                onClose={() => {
                    if (delSaving) return;
                    setDelOpen(false);
                    setDelTarget(null);
                    setDelError(null);
                }}
                onConfirm={submitDelete}
            />
        </div>
    );
};
