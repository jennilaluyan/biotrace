import { useEffect, useMemo, useState } from "react";
import { getErrorMessage } from "../../utils/errors";
import {
    fetchTestingBoard,
    moveTestingCard,
    renameTestingColumn,
    addTestingColumn,
    reorderTestingColumns,
    type TestingBoardCard,
    type TestingBoardColumn,
} from "../../services/testingBoard";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function formatDt(x?: string | null) {
    if (!x) return "-";
    const d = new Date(x);
    if (Number.isNaN(d.getTime())) return x;
    return d.toLocaleString();
}

function CardItem({
    card,
    onDragStart,
}: {
    card: TestingBoardCard;
    onDragStart: (card: TestingBoardCard) => void;
}) {
    const title =
        card.lab_sample_code ||
        (card.sample_id ? `Sample #${card.sample_id}` : "Sample");

    return (
        <div
            draggable
            onDragStart={() => onDragStart(card)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-3 shadow-sm hover:shadow transition cursor-grab active:cursor-grabbing"
            title="Drag to move"
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-sm font-extrabold text-gray-900 truncate">
                        {title}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 truncate">
                        {card.sample_type ?? "—"}
                    </div>
                </div>
                <span className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold border border-gray-200 bg-gray-50 text-gray-700">
                    {String(card.status_enum ?? card.current_status ?? "testing")}
                </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-gray-600">
                <div className="rounded-lg bg-gray-50 border border-gray-100 px-2 py-1">
                    <div className="text-[10px] text-gray-400">Entered</div>
                    <div className="font-medium">{formatDt(card.entered_at)}</div>
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-100 px-2 py-1">
                    <div className="text-[10px] text-gray-400">Exited</div>
                    <div className="font-medium">{formatDt(card.exited_at)}</div>
                </div>
            </div>
        </div>
    );
}

function ColumnEditorModal({
    open,
    onClose,
    columns,
    group,
    onRename,
    onAdd,
    onReorder,
    busy,
}: {
    open: boolean;
    onClose: () => void;
    columns: TestingBoardColumn[];
    group: string;
    onRename: (id: number, name: string) => Promise<void>;
    onAdd: (name: string) => Promise<void>;
    onReorder: (ids: number[]) => Promise<void>;
    busy?: boolean;
}) {
    const [local, setLocal] = useState<TestingBoardColumn[]>([]);
    const [newName, setNewName] = useState("");
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setLocal([...columns].sort((a, b) => a.position - b.position));
        setNewName("");
        setErr(null);
    }, [open, columns]);

    if (!open) return null;

    const moveUp = (idx: number) => {
        if (idx <= 0) return;
        setLocal((prev) => {
            const arr = [...prev];
            const tmp = arr[idx - 1];
            arr[idx - 1] = arr[idx];
            arr[idx] = tmp;
            return arr;
        });
    };

    const moveDown = (idx: number) => {
        setLocal((prev) => {
            if (idx >= prev.length - 1) return prev;
            const arr = [...prev];
            const tmp = arr[idx + 1];
            arr[idx + 1] = arr[idx];
            arr[idx] = tmp;
            return arr;
        });
    };

    const saveOrder = async () => {
        try {
            setErr(null);
            await onReorder(local.map((c) => c.column_id));
        } catch (e: any) {
            setErr(getErrorMessage(e, "Failed to reorder columns."));
        }
    };

    const add = async () => {
        const name = newName.trim();
        if (!name) return;
        try {
            setErr(null);
            await onAdd(name);
            setNewName("");
        } catch (e: any) {
            setErr(getErrorMessage(e, "Failed to add column."));
        }
    };

    const rename = async (id: number, name: string) => {
        const n = name.trim();
        if (!n) return;
        try {
            setErr(null);
            await onRename(id, n);
        } catch (e: any) {
            setErr(getErrorMessage(e, "Failed to rename column."));
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />
            <div className="relative w-[92vw] max-w-[720px] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between">
                    <div>
                        <div className="text-lg font-semibold text-gray-900">Edit Columns</div>
                        <div className="text-xs text-gray-500 mt-1">
                            Group: <span className="font-mono">{group}</span>
                        </div>
                    </div>
                    <button className="text-gray-500 hover:text-gray-700" onClick={onClose}>
                        ✕
                    </button>
                </div>

                <div className="px-6 py-5">
                    {err && (
                        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                            {err}
                        </div>
                    )}

                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-600">
                            Current columns (reorder with arrows, then save order)
                        </div>
                        <div className="divide-y">
                            {local.map((c, idx) => (
                                <div key={c.column_id} className="px-4 py-3 flex items-center gap-3">
                                    <div className="flex flex-col gap-1">
                                        <button
                                            className="h-7 w-7 rounded-lg border hover:bg-gray-50 disabled:opacity-40"
                                            disabled={busy || idx === 0}
                                            onClick={() => moveUp(idx)}
                                            title="Move up"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            className="h-7 w-7 rounded-lg border hover:bg-gray-50 disabled:opacity-40"
                                            disabled={busy || idx === local.length - 1}
                                            onClick={() => moveDown(idx)}
                                            title="Move down"
                                        >
                                            ↓
                                        </button>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] text-gray-400">Column #{c.column_id}</div>
                                        <input
                                            defaultValue={c.name}
                                            onBlur={(e) => rename(c.column_id, e.target.value)}
                                            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                            disabled={busy}
                                        />
                                        <div className="mt-1 text-[11px] text-gray-400">
                                            Position: {idx + 1}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 flex-wrap">
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="New column name..."
                            className="flex-1 min-w-60 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            disabled={busy}
                        />
                        <button
                            type="button"
                            onClick={add}
                            disabled={busy || !newName.trim()}
                            className="lims-btn-primary px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Add column
                        </button>
                        <button
                            type="button"
                            onClick={saveOrder}
                            disabled={busy}
                            className="px-4 py-2 rounded-full border text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Save order
                        </button>
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                        Rename happens on blur (klik keluar input). Reorder disimpan saat klik “Save order”.
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button
                        className="px-5 py-2 rounded-full border text-sm hover:bg-gray-50"
                        onClick={onClose}
                        disabled={busy}
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function AnalystTestingBoardPage() {
    const [group, setGroup] = useState("default");
    const [loading, setLoading] = useState(false);
    const [busyMove, setBusyMove] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [columns, setColumns] = useState<TestingBoardColumn[]>([]);
    const [cards, setCards] = useState<TestingBoardCard[]>([]);
    const [mode, setMode] = useState<"backend" | "fallback">("fallback");
    const [editorOpen, setEditorOpen] = useState(false);

    const [dragging, setDragging] = useState<TestingBoardCard | null>(null);
    const [overColId, setOverColId] = useState<number | null>(null);

    const load = async () => {
        try {
            setLoading(true);
            setError(null);

            const res = await fetchTestingBoard({ group });
            setMode(res.mode);
            setColumns([...res.columns].sort((a, b) => a.position - b.position));
            setCards(res.cards);
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
    }, [group]);

    // ✅ Step 10.5: filter “In Testing”
    const inTestingCards = useMemo(() => {
        return (cards ?? []).filter((c) => {
            const se = String(c.status_enum ?? "").toLowerCase();
            // if backend already filters, this still safe
            return !se || se === "testing" || se === "in_testing";
        });
    }, [cards]);

    const cardsByColumn = useMemo(() => {
        const map = new Map<number, TestingBoardCard[]>();
        for (const col of columns) map.set(col.column_id, []);
        for (const card of inTestingCards) {
            const cid = Number(card.column_id ?? columns[0]?.column_id ?? 0);
            if (!map.has(cid)) map.set(cid, []);
            map.get(cid)!.push(card);
        }
        // stable-ish: latest updated first if exists
        for (const [k, arr] of map.entries()) {
            arr.sort((a, b) => {
                const ax = String(a.entered_at ?? a.updated_at ?? "");
                const bx = String(b.entered_at ?? b.updated_at ?? "");
                return bx.localeCompare(ax);
            });
            map.set(k, arr);
        }
        return map;
    }, [columns, inTestingCards]);

    const onDropToColumn = async (toColumnId: number) => {
        if (!dragging) return;

        const sampleId = dragging.sample_id;
        const fromColumnId = dragging.column_id ?? null;

        if (fromColumnId === toColumnId) {
            setDragging(null);
            setOverColId(null);
            return;
        }

        // optimistic move
        setBusyMove(true);
        setError(null);

        const prevCards = cards;
        const next = (cards ?? []).map((c) =>
            c.sample_id === sampleId ? { ...c, column_id: toColumnId } : c
        );
        setCards(next);

        try {
            // call backend if available (even in fallback mode it's OK; might 404)
            await moveTestingCard({
                sample_id: sampleId,
                from_column_id: fromColumnId,
                to_column_id: toColumnId,
                note: null,
            });

            // refresh to get timestamps/events from backend
            await load();
        } catch (e: any) {
            // revert if failed
            setCards(prevCards);
            setError(getErrorMessage(e, "Move failed (backend endpoint not ready?)."));
        } finally {
            setBusyMove(false);
            setDragging(null);
            setOverColId(null);
        }
    };

    const onRename = async (id: number, name: string) => {
        await renameTestingColumn(id, name);
        await load();
    };

    const onAdd = async (name: string) => {
        await addTestingColumn({ group, name });
        await load();
    };

    const onReorder = async (ids: number[]) => {
        await reorderTestingColumns({ group, column_ids_in_order: ids });
        await load();
    };

    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div className="flex flex-col">
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">
                        Analyst Testing Board
                    </h1>
                    <p className="text-sm text-gray-600">
                        Kanban view for samples <span className="font-semibold">In Testing</span>.
                        Drag cards between columns; changes will persist when backend endpoints are available.
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <select
                        className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
                        value={group}
                        onChange={(e) => setGroup(e.target.value)}
                        disabled={loading}
                        title="Workflow group (PCR/WGS/etc)"
                    >
                        <option value="default">default</option>
                        <option value="pcr">pcr</option>
                        <option value="wgs">wgs</option>
                        <option value="elisa">elisa</option>
                    </select>

                    <button
                        type="button"
                        className="lims-btn"
                        onClick={load}
                        disabled={loading || busyMove}
                    >
                        {loading ? "Loading..." : "Refresh"}
                    </button>

                    <button
                        type="button"
                        className={cx(
                            "px-4 py-2 rounded-full border text-sm hover:bg-gray-50",
                            (loading || busyMove) && "opacity-60 cursor-not-allowed"
                        )}
                        onClick={() => setEditorOpen(true)}
                        disabled={loading || busyMove}
                        title="Rename / add / reorder columns"
                    >
                        Edit columns
                    </button>
                </div>
            </div>

            {/* Info banner */}
            <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="text-sm text-gray-700">
                        Mode:{" "}
                        <span
                            className={cx(
                                "inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold border",
                                mode === "backend"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-amber-200 bg-amber-50 text-amber-800"
                            )}
                        >
                            {mode === "backend" ? "backend board" : "fallback (samples)"}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                            {mode === "fallback"
                                ? "Backend testing board endpoints not detected; showing samples status_enum=testing and placing them in first column."
                                : "Using backend board columns + card positions."}
                        </div>
                    </div>

                    {busyMove && (
                        <div className="text-xs font-semibold text-gray-600">
                            Moving card...
                        </div>
                    )}
                </div>

                {error && (
                    <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                        {error}
                    </div>
                )}
            </div>

            {/* Board */}
            <div className="mt-4 overflow-x-auto">
                <div className="min-w-[980px] grid grid-flow-col auto-cols-[320px] gap-4 pb-2">
                    {columns.map((col) => {
                        const list = cardsByColumn.get(col.column_id) ?? [];
                        const isOver = overColId === col.column_id;

                        return (
                            <div
                                key={col.column_id}
                                className={cx(
                                    "rounded-2xl border border-gray-200 bg-white overflow-hidden",
                                    isOver && "ring-2 ring-primary-soft"
                                )}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setOverColId(col.column_id);
                                }}
                                onDragLeave={() => setOverColId((prev) => (prev === col.column_id ? null : prev))}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    onDropToColumn(col.column_id);
                                }}
                            >
                                <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                    <div className="min-w-0">
                                        <div className="text-sm font-extrabold text-gray-900 truncate">
                                            {col.name}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                            {list.length} card(s)
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-400">
                                        #{col.column_id}
                                    </span>
                                </div>

                                <div className="px-3 py-3 space-y-3 min-h-[260px] bg-white">
                                    {list.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                                            Drop here to move.
                                        </div>
                                    ) : (
                                        list.map((card) => (
                                            <CardItem
                                                key={card.sample_id}
                                                card={card}
                                                onDragStart={(c) => setDragging(c)}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <ColumnEditorModal
                open={editorOpen}
                onClose={() => setEditorOpen(false)}
                columns={columns}
                group={group}
                onRename={onRename}
                onAdd={onAdd}
                onReorder={onReorder}
                busy={loading || busyMove}
            />
        </div>
    );
}
