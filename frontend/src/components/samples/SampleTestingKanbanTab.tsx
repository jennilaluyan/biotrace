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

type StageStamp = {
    column_id: number;
    entered_at: string | null;
    exited_at: string | null;
};

function deriveGroupFromBackend(sample: any): string {
    const group =
        sample?.workflow_group ??
        sample?.workflowGroup ??
        sample?.workflow_group_name ??
        null;

    const normalized = String(group ?? "").trim().toLowerCase();
    if (!normalized) return "default";

    if (normalized === "pcr_sars_cov_2") return "pcr";
    if (normalized === "wgs_sars_cov_2") return "sequencing";
    if (normalized === "antigen") return "rapid";
    if (normalized === "group_19_22" || normalized === "group_23_32") {
        return "microbiology";
    }

    return normalized;
}

function normalizeCard(card: any): TestingBoardCard {
    const entered = card?.entered_at ?? card?.enteredAt ?? card?.moved_at ?? card?.movedAt ?? null;
    const exited = card?.exited_at ?? card?.exitedAt ?? null;

    return {
        ...(card as any),
        entered_at: entered,
        exited_at: exited,
    } as TestingBoardCard;
}

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

        for (const [key, value] of Object.entries(parsed)) {
            const columnId = Number(key);
            if (!Number.isFinite(columnId)) continue;

            out[columnId] = {
                column_id: columnId,
                entered_at: (value as any)?.entered_at ?? null,
                exited_at: (value as any)?.exited_at ?? null,
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
    } catch { }
}

function mergeTimeline(
    prev: Record<number, StageStamp>,
    patch: Record<number, Partial<StageStamp>>
) {
    const next: Record<number, StageStamp> = { ...(prev ?? {}) };

    for (const [key, value] of Object.entries(patch ?? {})) {
        const columnId = Number(key);
        if (!Number.isFinite(columnId)) continue;

        const current = next[columnId] ?? {
            column_id: columnId,
            entered_at: null,
            exited_at: null,
        };

        next[columnId] = {
            column_id: columnId,
            entered_at: (value as any)?.entered_at ?? current.entered_at ?? null,
            exited_at: (value as any)?.exited_at ?? current.exited_at ?? null,
        };
    }

    return next;
}

function buildTimelineFromBackend(res: any): Record<number, StageStamp> {
    const candidates =
        (res?.events ??
            res?.timeline ??
            res?.history ??
            res?.card_events ??
            res?.cardEvents ??
            []) as any[];

    if (!Array.isArray(candidates) || candidates.length === 0) return {};

    const out: Record<number, StageStamp> = {};

    const upsert = (columnId: number, patch: Partial<StageStamp>) => {
        const current = out[columnId] ?? {
            column_id: columnId,
            entered_at: null,
            exited_at: null,
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

        out[columnId] = {
            column_id: columnId,
            entered_at: pickEarliest(current.entered_at, patch.entered_at ?? null),
            exited_at: pickLatest(current.exited_at, patch.exited_at ?? null),
        };
    };

    for (const event of candidates) {
        const fromId = Number(event?.from_column_id ?? event?.fromColumnId ?? 0) || null;
        const toId = Number(event?.to_column_id ?? event?.toColumnId ?? 0) || null;

        const movedAt =
            event?.moved_at ?? event?.movedAt ?? event?.created_at ?? event?.createdAt ?? null;

        const enteredAt = event?.entered_at ?? event?.enteredAt ?? movedAt ?? null;
        const exitedAt = event?.exited_at ?? event?.exitedAt ?? null;

        if (toId) {
            upsert(toId, { entered_at: enteredAt });
        }

        if (fromId) {
            upsert(fromId, { exited_at: movedAt ?? exitedAt ?? null });
        }
    }

    return out;
}

export const SampleTestingKanbanTab = ({
    sampleId,
    sample,
    onQualityCoverUnlocked,
}: Props) => {
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

    const [renameOpen, setRenameOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<TestingBoardColumn | null>(null);
    const [renameSaving, setRenameSaving] = useState(false);
    const [renameError, setRenameError] = useState<string | null>(null);

    const [addOpen, setAddOpen] = useState(false);
    const [addSide, setAddSide] = useState<"left" | "right">("right");
    const [addRelative, setAddRelative] = useState<TestingBoardColumn | null>(null);
    const [addSaving, setAddSaving] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);

    const [delOpen, setDelOpen] = useState(false);
    const [delTarget, setDelTarget] = useState<TestingBoardColumn | null>(null);
    const [delSaving, setDelSaving] = useState(false);
    const [delError, setDelError] = useState<string | null>(null);

    const batchItems = useMemo(
        () => (Array.isArray(sample?.batch_items) ? sample.batch_items : []),
        [sample?.batch_items]
    );

    const batchActiveTotal = useMemo(() => {
        if (batchItems.length > 0) {
            return batchItems.filter((item: any) => !item?.batch_excluded_at).length;
        }

        const total = Number(sample?.batch_summary?.batch_active_total ?? sample?.request_batch_total ?? 1);
        return Number.isFinite(total) && total > 0 ? total : 1;
    }, [batchItems, sample?.batch_summary?.batch_active_total, sample?.request_batch_total]);

    const canApplyToBatch =
        !!sample?.request_batch_id && batchActiveTotal > 1;

    const [applyToBatch, setApplyToBatch] = useState(canApplyToBatch);

    useEffect(() => {
        const nextGroup = deriveGroupFromBackend(sample);
        setGroup(nextGroup);
    }, [sampleId, sample?.workflow_group, sample?.workflowGroup, sample?.workflow_group_name]);

    useEffect(() => {
        setApplyToBatch(canApplyToBatch);
    }, [canApplyToBatch]);

    useEffect(() => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        setTimeline(readTimeline(sampleId));
    }, [sampleId]);

    useEffect(() => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        writeTimeline(sampleId, timeline);
    }, [sampleId, timeline]);

    const fmt = useCallback(
        (value?: string | null) => {
            if (!value) return t("samples.kanbanTab.timestamp.none");
            return formatDateTimeLocal(value);
        },
        [i18n.resolvedLanguage, i18n.language, t]
    );

    const load = useCallback(async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;

        try {
            setLoading(true);
            setError(null);

            const res = await fetchTestingBoard({ group, sample_id: sampleId });

            const rawMode = String((res as any)?.mode ?? "");
            setMode(rawMode === "backend" ? "synced" : "local");

            const nextColumns = [...(res.columns ?? [])].sort((a, b) => a.position - b.position);
            setColumns(nextColumns);

            const computedLast =
                (res as any)?.last_column_id ??
                (res as any)?.board?.last_column_id ??
                null;

            setLastColumnId(computedLast ? Number(computedLast) : null);

            const incomingCards = Array.isArray(res.cards)
                ? res.cards.map((card: any) => normalizeCard(card))
                : [];

            setCards(incomingCards);

            const fromBackend = buildTimelineFromBackend(res);
            const fromLocal = readTimeline(sampleId);

            setTimeline((prev) => {
                const base = { ...fromLocal, ...(prev ?? {}) };
                return mergeTimeline(base, fromBackend);
            });

            const mine = incomingCards.find((card) => Number(card.sample_id) === Number(sampleId));
            if (mine?.column_id) {
                const columnId = Number(mine.column_id);

                setTimeline((prev) =>
                    mergeTimeline(prev, {
                        [columnId]: {
                            entered_at: mine.entered_at ?? prev?.[columnId]?.entered_at ?? null,
                            exited_at: mine.exited_at ?? prev?.[columnId]?.exited_at ?? null,
                        },
                    })
                );
            }
        } catch (err: any) {
            setError(getErrorMessage(err, t("samples.kanbanTab.errors.loadFailed")));
            setColumns([]);
            setCards([]);
        } finally {
            setLoading(false);
        }
    }, [group, sampleId, t]);

    useEffect(() => {
        void load();
    }, [load]);

    const sortedColumns = useMemo(
        () => [...columns].sort((a, b) => a.position - b.position),
        [columns]
    );

    const firstColumn = sortedColumns[0] ?? null;

    const myCard = useMemo(() => {
        const found = cards.find((card) => Number(card.sample_id) === Number(sampleId));
        return found ? normalizeCard(found) : null;
    }, [cards, sampleId]);

    const currentColumnIndex = useMemo(() => {
        if (!myCard?.column_id) return -1;
        return sortedColumns.findIndex(
            (column) => Number(column.column_id) === Number(myCard.column_id)
        );
    }, [myCard, sortedColumns]);

    const nextColumn = useMemo(() => {
        if (currentColumnIndex < 0) return null;
        return sortedColumns[currentColumnIndex + 1] ?? null;
    }, [currentColumnIndex, sortedColumns]);

    const alreadyStarted = !!myCard?.column_id;
    const headerCode = sample?.lab_sample_code || "—";
    const headerType = sample?.sample_type || "—";

    const isAtLastColumn = useMemo(() => {
        if (!alreadyStarted) return false;

        const current = Number(myCard?.column_id ?? 0);
        const last =
            lastColumnId
                ? Number(lastColumnId)
                : Number(sortedColumns[sortedColumns.length - 1]?.column_id ?? 0);

        return current > 0 && last > 0 && current === last;
    }, [alreadyStarted, lastColumnId, myCard, sortedColumns]);

    const isLastStageEnded = useMemo(() => {
        if (!isAtLastColumn) return false;

        const columnId = Number(myCard?.column_id ?? 0);
        const timelineExited = timeline?.[columnId]?.exited_at ?? null;
        const cardExited = (myCard as any)?.exited_at ?? null;

        return !!(timelineExited || cardExited);
    }, [isAtLastColumn, myCard, timeline]);

    const isSampleDone = useMemo(() => {
        const hardDoneFlags = [
            (sample as any)?.testing_completed_at,
            (sample as any)?.testing_done_at,
            (sample as any)?.tests_completed_at,
        ].filter(Boolean);

        if (hardDoneFlags.length > 0) return true;
        return isAtLastColumn && isLastStageEnded;
    }, [isAtLastColumn, isLastStageEnded, sample]);

    const applyOptimisticMove = useCallback(
        (toColumnId: number, stamp: string) => {
            const fromColumnId = myCard?.column_id ? Number(myCard.column_id) : null;

            setTimeline((prev) => {
                const patch: Record<number, Partial<StageStamp>> = {};

                if (fromColumnId) {
                    patch[fromColumnId] = { exited_at: stamp };
                }

                patch[toColumnId] = {
                    entered_at: prev?.[toColumnId]?.entered_at ?? stamp,
                    exited_at: null,
                };

                return mergeTimeline(prev, patch);
            });

            setCards((prev) => {
                const current = Array.isArray(prev) ? prev : [];
                const hasMine = current.some(
                    (card) => Number(card.sample_id) === Number(sampleId)
                );

                if (hasMine) {
                    return current.map((card) =>
                        Number(card.sample_id) === Number(sampleId)
                            ? normalizeCard({
                                ...card,
                                column_id: toColumnId,
                                entered_at: stamp,
                                exited_at: null,
                            })
                            : normalizeCard(card)
                    );
                }

                return [
                    ...current.map((card) => normalizeCard(card)),
                    normalizeCard({
                        sample_id: sampleId,
                        lab_sample_code: sample?.lab_sample_code ?? null,
                        sample_type: sample?.sample_type ?? null,
                        column_id: toColumnId,
                        entered_at: stamp,
                        exited_at: null,
                    }),
                ];
            });
        },
        [myCard, sample?.lab_sample_code, sample?.sample_type, sampleId]
    );

    const applyOptimisticFinalize = useCallback(
        (columnId: number, stamp: string) => {
            setTimeline((prev) =>
                mergeTimeline(prev, {
                    [columnId]: {
                        entered_at:
                            prev?.[columnId]?.entered_at ??
                            (myCard as any)?.entered_at ??
                            stamp,
                        exited_at: stamp,
                    },
                })
            );

            setCards((prev) =>
                (Array.isArray(prev) ? prev : []).map((card) =>
                    Number(card.sample_id) === Number(sampleId)
                        ? normalizeCard({ ...card, exited_at: stamp })
                        : normalizeCard(card)
                )
            );
        },
        [myCard, sampleId]
    );

    const doMove = async (toColumnId: number) => {
        if (!toColumnId) return;

        setBusyMove(true);
        setError(null);

        const nowIso = new Date().toISOString();
        applyOptimisticMove(toColumnId, nowIso);

        try {
            const res = await moveTestingCard({
                sample_id: sampleId,
                to_column_id: toColumnId,
                workflow_group: group,
                apply_to_batch: applyToBatch,
            });

            const movedAt =
                (res as any)?.data?.data?.moved_at ??
                (res as any)?.data?.moved_at ??
                (res as any)?.data?.data?.entered_at ??
                (res as any)?.data?.entered_at ??
                nowIso;

            applyOptimisticMove(toColumnId, String(movedAt));
            await load();
        } catch (err: any) {
            setError(getErrorMessage(err, t("samples.kanbanTab.errors.moveFailed")));
            await load();
        } finally {
            setBusyMove(false);
        }
    };

    const doFinalizeLastStage = async () => {
        if (!alreadyStarted) return;

        const columnId = Number(myCard?.column_id ?? 0);
        if (!columnId) return;

        setBusyMove(true);
        setError(null);

        const nowIso = new Date().toISOString();
        applyOptimisticFinalize(columnId, nowIso);

        try {
            await moveTestingCard({
                sample_id: sampleId,
                to_column_id: columnId,
                workflow_group: group,
                finalize: true,
                apply_to_batch: applyToBatch,
            });

            await load();
            onQualityCoverUnlocked?.();
        } catch (err: any) {
            setError(getErrorMessage(err, t("samples.kanbanTab.errors.finishFailed")));
            await load();
        } finally {
            setBusyMove(false);
        }
    };

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
        if (!addRelative || !canEditColumns) return;

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
        } catch (err: any) {
            setAddError(getErrorMessage(err, t("samples.kanbanTab.errors.addColumnFailed")));
        } finally {
            setAddSaving(false);
        }
    }

    function openRename(column: TestingBoardColumn) {
        if (!canEditColumns) return;
        setRenameError(null);
        setRenameTarget(column);
        setRenameOpen(true);
    }

    async function submitRename(nextName: string) {
        if (!renameTarget || !canEditColumns) return;

        setRenameSaving(true);
        setRenameError(null);

        try {
            await renameTestingColumn(renameTarget.column_id, nextName);
            setRenameOpen(false);
            setRenameTarget(null);
            await load();
        } catch (err: any) {
            setRenameError(getErrorMessage(err, t("samples.kanbanTab.errors.renameColumnFailed")));
        } finally {
            setRenameSaving(false);
        }
    }

    function openDelete(column: TestingBoardColumn) {
        if (!canEditColumns) return;
        setDelError(null);
        setDelTarget(column);
        setDelOpen(true);
    }

    async function submitDelete() {
        if (!delTarget || !canEditColumns) return;

        setDelSaving(true);
        setDelError(null);

        try {
            await deleteTestingColumn(delTarget.column_id);
            setDelOpen(false);
            setDelTarget(null);
            await load();
        } catch (err: any) {
            setDelError(getErrorMessage(err, t("samples.kanbanTab.errors.deleteColumnFailed")));
        } finally {
            setDelSaving(false);
        }
    }

    const primaryAction = (() => {
        if (isSampleDone) {
            return (
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
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
                        (!firstColumn || busyMove) && "cursor-not-allowed opacity-60"
                    )}
                    disabled={!firstColumn || busyMove}
                    onClick={() => firstColumn && void doMove(firstColumn.column_id)}
                >
                    <Play size={16} />
                    {t("samples.kanbanTab.actions.start")}
                </button>
            );
        }

        if (alreadyStarted && nextColumn) {
            return (
                <button
                    type="button"
                    className={cx(
                        "lims-btn-primary inline-flex items-center gap-2",
                        busyMove && "cursor-not-allowed opacity-60"
                    )}
                    disabled={busyMove}
                    onClick={() => void doMove(nextColumn.column_id)}
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
                    className={cx(
                        "lims-btn-primary inline-flex items-center gap-2",
                        busyMove && "cursor-not-allowed opacity-60"
                    )}
                    disabled={busyMove}
                    onClick={() => void doFinalizeLastStage()}
                >
                    <Square size={16} />
                    {t("samples.kanbanTab.actions.finish")}
                </button>
            );
        }

        return (
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 size={16} />
                {t("samples.kanbanTab.actions.done")}
            </span>
        );
    })();

    const badgeModeClass =
        mode === "synced"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-800";

    const showBusy =
        loading || busyMove || busyCols || renameSaving || addSaving || delSaving;

    return (
        <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-sm font-extrabold text-gray-900 md:text-base">
                                {t("samples.kanbanTab.title")}
                            </h2>

                            {isSampleDone ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700">
                                    <Lock size={14} />
                                    {t("samples.kanbanTab.badges.locked")}
                                </span>
                            ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700">
                                <span className="font-semibold">
                                    {t("samples.kanbanTab.header.labCode")}:
                                </span>
                                <span className="ml-1 font-mono">{headerCode}</span>
                            </span>

                            <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700">
                                <span className="font-semibold">
                                    {t("samples.kanbanTab.header.sampleType")}:
                                </span>
                                <span className="ml-1">{headerType}</span>
                            </span>

                            {canApplyToBatch ? (
                                <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700">
                                    {batchActiveTotal}{" "}
                                    {t("samples.kanbanTab.batch.samples", {
                                        defaultValue: "samples in batch",
                                    })}
                                </span>
                            ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                            <span
                                className={cx(
                                    "inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold",
                                    badgeModeClass
                                )}
                                title={
                                    mode === "synced"
                                        ? t("samples.kanbanTab.tooltips.synced")
                                        : t("samples.kanbanTab.tooltips.local")
                                }
                            >
                                {mode === "synced"
                                    ? t("samples.kanbanTab.badges.synced")
                                    : t("samples.kanbanTab.badges.local")}
                            </span>

                            <span
                                className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700"
                                title={t("samples.kanbanTab.tooltips.group")}
                            >
                                {group || "default"}
                            </span>

                            {alreadyStarted && sortedColumns.length > 0 ? (
                                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-700">
                                    {t("samples.kanbanTab.progress", {
                                        current: Math.max(1, currentColumnIndex + 1),
                                        total: sortedColumns.length,
                                    })}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className={cx(
                                "lims-icon-button",
                                showBusy && "cursor-not-allowed opacity-60"
                            )}
                            onClick={() => void load()}
                            disabled={showBusy}
                            aria-label={t("refresh")}
                            title={t("refresh")}
                        >
                            <RefreshCw size={16} />
                        </button>

                        {primaryAction}
                    </div>
                </div>

                {canApplyToBatch ? (
                    <div className="border-b border-sky-100 bg-sky-50 px-4 py-3">
                        <label className="flex items-start gap-3">
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={applyToBatch}
                                onChange={(e) => setApplyToBatch(e.target.checked)}
                                disabled={busyMove || loading}
                            />
                            <div>
                                <div className="text-sm font-semibold text-sky-900">
                                    {t("samples.kanbanTab.batch.applyTitle", {
                                        defaultValue: "Apply move to institutional batch",
                                    })}
                                </div>
                                <div className="mt-1 text-xs text-sky-700">
                                    {t("samples.kanbanTab.batch.applySubtitle", {
                                        defaultValue:
                                            "When enabled, moving this card will also move all active samples in the same institutional batch.",
                                    })}{" "}
                                    ({batchActiveTotal})
                                </div>
                            </div>
                        </label>
                    </div>
                ) : null}

                {error ? (
                    <div className="px-4 pt-4">
                        <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    </div>
                ) : null}

                <div className="px-4 py-4">
                    {loading && sortedColumns.length === 0 ? (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            {[0, 1, 2].map((key) => (
                                <div
                                    key={key}
                                    className="animate-pulse overflow-hidden rounded-2xl border border-gray-200 bg-white"
                                >
                                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                                        <div className="h-4 w-1/2 rounded bg-gray-200" />
                                        <div className="mt-2 h-3 w-1/3 rounded bg-gray-200" />
                                    </div>
                                    <div className="px-4 py-4">
                                        <div className="h-20 rounded-xl bg-gray-100" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <div className="grid min-w-[980px] auto-cols-[320px] grid-flow-col gap-4 pb-2">
                                    {sortedColumns.map((column) => {
                                        const isHere =
                                            alreadyStarted &&
                                            Number(myCard?.column_id) === Number(column.column_id);

                                        const index = sortedColumns.findIndex(
                                            (item) =>
                                                Number(item.column_id) === Number(column.column_id)
                                        );

                                        const isDone =
                                            alreadyStarted &&
                                            currentColumnIndex >= 0 &&
                                            index < currentColumnIndex;

                                        const stamp =
                                            timeline?.[Number(column.column_id)] ?? null;

                                        const enteredAt =
                                            stamp?.entered_at ??
                                            (isHere ? (myCard as any)?.entered_at ?? null : null);

                                        const exitedAt =
                                            stamp?.exited_at ??
                                            (isHere ? (myCard as any)?.exited_at ?? null : null);

                                        const hasAnyStamp = !!enteredAt || !!exitedAt;

                                        const statusKey = isHere
                                            ? "current"
                                            : isDone
                                                ? "done"
                                                : "pending";

                                        const statusText = t(
                                            `samples.kanbanTab.column.status.${statusKey}`
                                        );

                                        return (
                                            <div
                                                key={column.column_id}
                                                className={cx(
                                                    "group overflow-hidden rounded-2xl border bg-white",
                                                    isHere
                                                        ? "border-primary ring-2 ring-primary-soft"
                                                        : "border-gray-200"
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-extrabold text-gray-900">
                                                            {column.name}
                                                        </div>
                                                        <div className="mt-0.5 text-xs text-gray-500">
                                                            <span
                                                                className={cx(
                                                                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                                                                    statusKey === "current"
                                                                        ? "border-blue-200 bg-blue-50 text-blue-700"
                                                                        : statusKey === "done"
                                                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                                            : "border-gray-200 bg-white text-gray-700"
                                                                )}
                                                            >
                                                                {statusText}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div
                                                        className={cx(
                                                            "flex items-center gap-1",
                                                            canEditColumns
                                                                ? "opacity-100"
                                                                : "opacity-50",
                                                            "md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                                                        )}
                                                    >
                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                "lims-icon-button",
                                                                !canEditColumns &&
                                                                "cursor-not-allowed"
                                                            )}
                                                            disabled={!canEditColumns}
                                                            title={
                                                                isSampleDone
                                                                    ? t(
                                                                        "samples.kanbanTab.columnActions.locked"
                                                                    )
                                                                    : t(
                                                                        "samples.kanbanTab.columnActions.addBefore"
                                                                    )
                                                            }
                                                            aria-label={t(
                                                                "samples.kanbanTab.columnActions.addBefore"
                                                            )}
                                                            onClick={() => openAdd("left", column)}
                                                        >
                                                            <Plus size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                "lims-icon-button",
                                                                !canEditColumns &&
                                                                "cursor-not-allowed"
                                                            )}
                                                            disabled={!canEditColumns}
                                                            title={
                                                                isSampleDone
                                                                    ? t(
                                                                        "samples.kanbanTab.columnActions.locked"
                                                                    )
                                                                    : t(
                                                                        "samples.kanbanTab.columnActions.rename"
                                                                    )
                                                            }
                                                            aria-label={t(
                                                                "samples.kanbanTab.columnActions.rename"
                                                            )}
                                                            onClick={() => openRename(column)}
                                                        >
                                                            <Pencil size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                "lims-icon-button",
                                                                !canEditColumns &&
                                                                "cursor-not-allowed"
                                                            )}
                                                            disabled={!canEditColumns}
                                                            title={
                                                                isSampleDone
                                                                    ? t(
                                                                        "samples.kanbanTab.columnActions.locked"
                                                                    )
                                                                    : t(
                                                                        "samples.kanbanTab.columnActions.delete"
                                                                    )
                                                            }
                                                            aria-label={t(
                                                                "samples.kanbanTab.columnActions.delete"
                                                            )}
                                                            onClick={() => openDelete(column)}
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className={cx(
                                                                "lims-icon-button",
                                                                !canEditColumns &&
                                                                "cursor-not-allowed"
                                                            )}
                                                            disabled={!canEditColumns}
                                                            title={
                                                                isSampleDone
                                                                    ? t(
                                                                        "samples.kanbanTab.columnActions.locked"
                                                                    )
                                                                    : t(
                                                                        "samples.kanbanTab.columnActions.addAfter"
                                                                    )
                                                            }
                                                            aria-label={t(
                                                                "samples.kanbanTab.columnActions.addAfter"
                                                            )}
                                                            onClick={() => openAdd("right", column)}
                                                        >
                                                            <Plus size={16} className="rotate-180" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="min-h-[210px] px-3 py-3">
                                                    {hasAnyStamp || isHere ? (
                                                        <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm">
                                                            <div className="text-xs font-semibold text-gray-900">
                                                                {headerCode}
                                                            </div>
                                                            <div className="mt-1 text-[11px] text-gray-500">
                                                                {headerType}
                                                            </div>

                                                            <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-gray-700">
                                                                <div>
                                                                    <span className="font-semibold">
                                                                        {t(
                                                                            "samples.kanbanTab.column.entered"
                                                                        )}
                                                                        :
                                                                    </span>{" "}
                                                                    {fmt(enteredAt)}
                                                                </div>
                                                                <div>
                                                                    <span className="font-semibold">
                                                                        {t(
                                                                            "samples.kanbanTab.column.exited"
                                                                        )}
                                                                        :
                                                                    </span>{" "}
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

                            {sortedColumns.length === 0 && !loading ? (
                                <div className="text-sm text-gray-600">
                                    {t("samples.kanbanTab.empty.noColumns")}
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>

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

            <RenameKanbanColumnModal
                open={renameOpen}
                currentName={renameTarget?.name ?? ""}
                title={
                    renameTarget
                        ? t("samples.kanbanTab.renameModal.titleNamed", {
                            name: renameTarget.name,
                        })
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