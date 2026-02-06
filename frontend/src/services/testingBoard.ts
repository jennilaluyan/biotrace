import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from "./api";
import type { Sample, PaginatedResponse } from "./samples";

export type TestingWorkflowMode = "backend" | "fallback";

export type TestingBoardColumn = {
    column_id: number;
    board_id?: number;
    name: string;
    position: number;
    created_at?: string | null;
    updated_at?: string | null;
};

export type TestingBoardCard = {
    card_id?: number;
    sample_id: number;

    lab_sample_code?: string | null;
    sample_type?: string | null;
    client_name?: string | null;
    status_enum?: string | null;
    current_status?: string | null;

    column_id?: number | null;
    entered_at?: string | null;
    exited_at?: string | null;

    // legacy / extra fields from backend are allowed, but keep typed core above
    [k: string]: any;
};

export type TestingCardEventType =
    | "entered_column"
    | "exited_column"
    | "moved"
    | "finalized"
    | string;

export type TestingBoardEvent = {
    id?: number;
    sample_id: number;

    from_column_id?: number | null;
    to_column_id?: number | null;

    type?: TestingCardEventType;

    // timestamps (backend naming may vary)
    created_at?: string | null;
    moved_at?: string | null;
    entered_at?: string | null;
    exited_at?: string | null;

    note?: string | null;

    [k: string]: any;
};

export type TestingBoardPayload = {
    board_id: number;
    workflow_group: string;
    name?: string;
    last_column_id?: number | null;
    columns: TestingBoardColumn[];
    cards: TestingBoardCard[];

    // ✅ “resmi” ada (backend boleh kirim / tidak kirim)
    events?: TestingBoardEvent[];
};

export type FetchTestingBoardResponse = {
    mode: TestingWorkflowMode;
    group: string;
    board: TestingBoardPayload;
    columns: TestingBoardColumn[];
    cards: TestingBoardCard[];
    events: TestingBoardEvent[];
    last_column_id: number | null;
};

const BOARD_BASE = "/v1/testing-board";

function safeArr<T>(x: any): T[] {
    return Array.isArray(x) ? (x as T[]) : [];
}

/**
 * Unwrap nested {data: ...} shapes (up to a few levels).
 * Supports: axios response, API wrappers, Laravel resources.
 */
function unwrapDataDeep<T>(res: any): T {
    let x = res?.data ?? res;
    for (let i = 0; i < 5; i++) {
        if (x && typeof x === "object" && "data" in x && (x as any).data != null) {
            x = (x as any).data;
            continue;
        }
        break;
    }
    return x as T;
}

function asNumber(x: any, fallback = 0) {
    const n = Number(x);
    return Number.isFinite(n) ? n : fallback;
}

function normalizeColumns(raw: any): TestingBoardColumn[] {
    const arr = safeArr<any>(raw);
    return arr
        .map((c) => ({
            column_id: asNumber(c?.column_id ?? c?.id, 0),
            board_id: c?.board_id != null ? asNumber(c.board_id, undefined as any) : undefined,
            name: String(c?.name ?? "Untitled"),
            position: asNumber(c?.position ?? c?.sort_order ?? 0, 0),
            created_at: c?.created_at ?? null,
            updated_at: c?.updated_at ?? null,
        }))
        .filter((c) => c.column_id > 0);
}

function normalizeCards(raw: any): TestingBoardCard[] {
    const arr = safeArr<any>(raw);
    return arr
        .map((c) => {
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
                ...(c ?? {}),
                card_id: c?.card_id ?? c?.id ?? undefined,
                sample_id: asNumber(c?.sample_id ?? c?.sampleId, 0),

                lab_sample_code: c?.lab_sample_code ?? c?.labSampleCode ?? null,
                sample_type: c?.sample_type ?? c?.sampleType ?? null,
                client_name: c?.client_name ?? c?.clientName ?? null,
                status_enum: c?.status_enum ?? c?.statusEnum ?? null,
                current_status: c?.current_status ?? c?.currentStatus ?? null,

                column_id: c?.column_id == null ? null : asNumber(c.column_id, 0),
                entered_at: entered,
                exited_at: exited,
            } as TestingBoardCard;
        })
        .filter((c) => c.sample_id > 0);
}

function normalizeEvents(raw: any): TestingBoardEvent[] {
    const arr = safeArr<any>(raw);
    return arr
        .map((e) => ({
            ...(e ?? {}),
            id: e?.id,
            sample_id: asNumber(e?.sample_id ?? e?.sampleId, 0),
            from_column_id: e?.from_column_id ?? e?.fromColumnId ?? null,
            to_column_id: e?.to_column_id ?? e?.toColumnId ?? null,
            type: e?.type ?? e?.event_type ?? e?.eventType ?? "moved",
            created_at: e?.created_at ?? null,
            moved_at: e?.moved_at ?? null,
            entered_at: e?.entered_at ?? null,
            exited_at: e?.exited_at ?? null,
            note: e?.note ?? null,
        }))
        .filter((e) => e.sample_id > 0);
}

export async function fetchTestingBoard(opts?: { group?: string }): Promise<FetchTestingBoardResponse> {
    const raw = (opts?.group ?? "").trim();
    const group = raw || "default";

    try {
        // backend endpoint: /v1/testing-board/{group}
        const res = await apiGet<any>(`${BOARD_BASE}/${encodeURIComponent(group)}`);
        const payload = unwrapDataDeep<any>(res);

        if (payload?.message && !payload?.columns) {
            throw new Error(String(payload.message));
        }

        const columns = normalizeColumns(payload?.columns);
        const cards = normalizeCards(payload?.cards);
        const events = normalizeEvents(payload?.events);

        if (columns.length > 0) {
            const lastColumnId =
                payload?.last_column_id ??
                payload?.board?.last_column_id ??
                null;

            const workflowGroup = String(payload?.workflow_group ?? payload?.group ?? group);

            const board: TestingBoardPayload = {
                ...(payload ?? {}),
                board_id: asNumber(payload?.board_id ?? payload?.id ?? 0, 0),
                workflow_group: workflowGroup,
                last_column_id: lastColumnId == null ? null : asNumber(lastColumnId, null as any),
                columns,
                cards,
                events,
            };

            return {
                mode: "backend",
                group: workflowGroup,
                board,
                columns,
                cards,
                events,
                last_column_id: board.last_column_id ?? null,
            };
        }

        throw new Error("Board payload missing columns.");
    } catch {
        // fallback: samples in testing
        const fallback = await apiGet<any>(`/v1/samples?status_enum=testing&per_page=200&page=1`);
        const pager =
            fallback?.data && fallback?.meta
                ? (fallback as PaginatedResponse<Sample>)
                : (fallback?.data ?? fallback);

        const samples: Sample[] = safeArr<Sample>(pager?.data ?? pager);

        const columns: TestingBoardColumn[] = [
            { column_id: 1, name: "In Testing", position: 1 },
            { column_id: 2, name: "Measuring", position: 2 },
            { column_id: 3, name: "Ready for Review", position: 3 },
        ];

        const cards: TestingBoardCard[] = samples.map((s) => ({
            sample_id: s.sample_id,
            lab_sample_code: s.lab_sample_code ?? null,
            sample_type: s.sample_type ?? null,
            status_enum: (s.status_enum ?? "testing") as any,
            current_status: s.current_status ?? null,
            column_id: 1,
            entered_at: null,
            exited_at: null,
        }));

        const board: TestingBoardPayload = {
            board_id: 0,
            workflow_group: group,
            last_column_id: 3,
            columns,
            cards,
            events: [],
        };

        return {
            mode: "fallback",
            group,
            board,
            columns,
            cards,
            events: [],
            last_column_id: 3,
        };
    }
}

export async function moveTestingCard(payload: {
    sample_id: number;
    from_column_id: number | null;
    to_column_id: number;
    workflow_group?: string | null;
    note?: string | null;

    // ✅ NEW
    finalize?: boolean;
}) {
    return apiPost(`${BOARD_BASE}/move`, payload);
}

export async function renameTestingColumn(columnId: number, name: string) {
    return apiPatch(`${BOARD_BASE}/columns/${columnId}`, { name });
}

export async function addTestingColumn(payload: {
    group: string;
    name: string;

    // legacy
    position?: number;

    // ✅ new
    relative_to_column_id?: number;
    side?: "left" | "right";
}) {
    const { group, ...body } = payload;

    // include workflow_group in body too (safe with either controller style)
    return apiPost(`${BOARD_BASE}/${encodeURIComponent(group)}/columns`, {
        workflow_group: group,
        ...body,
    });
}

export async function deleteTestingColumn(columnId: number) {
    return apiDelete(`${BOARD_BASE}/columns/${columnId}`);
}

export async function reorderTestingColumns(payload: { group: string; column_ids: number[] }) {
    const { group, ...body } = payload;
    return apiPut(`${BOARD_BASE}/${encodeURIComponent(group)}/columns/reorder`, body);
}
