import { apiGet, apiPost, apiPatch } from "./api";
import type { Sample, PaginatedResponse } from "./samples";

export type TestingBoardColumn = {
    column_id: number;
    board_id?: number;
    name: string;
    position: number;
    created_at?: string | null;
    updated_at?: string | null;
};

export type TestingBoardCard = {
    // Minimal: sample-based card
    card_id?: number;
    sample_id: number;
    lab_sample_code?: string | null;
    sample_type?: string | null;
    client_name?: string | null;
    status_enum?: string | null;
    current_status?: string | null;

    // Stage info (from backend 10.3)
    column_id?: number | null;
    entered_at?: string | null;
    exited_at?: string | null;

    // raw payload passthrough
    [k: string]: any;
};

export type TestingBoardPayload = {
    board_id: number;
    workflow_group: string;
    columns: TestingBoardColumn[];
    cards: TestingBoardCard[];
};

const BOARD_BASE = "/v1/testing-board";

function safeArr<T>(x: any): T[] {
    return Array.isArray(x) ? (x as T[]) : [];
}

function unwrapData<T>(res: any): T {
    if (res && typeof res === "object" && "data" in res) return res.data as T;
    return res as T;
}

/**
 * Tries to load board from backend:
 * GET /v1/testing-board?group=PCR
 *
 * If backend not ready or 404:
 * - fallback: build simple "board" using /v1/samples?status_enum=testing
 */
export async function fetchTestingBoard(opts?: { group?: string }) {
    const group = (opts?.group ?? "").trim();
    const effectiveGroup = group || "pcr_sars_cov_2";
    try {
        const res = await apiGet<any>(`${BOARD_BASE}/${encodeURIComponent(group)}`);
        const payload = unwrapData<any>(res);

        const columns = safeArr<TestingBoardColumn>(payload?.columns);
        const cards = safeArr<TestingBoardCard>(payload?.cards);

        if (columns.length > 0) {
            return {
                mode: "backend" as const,
                group,
                board: payload as TestingBoardPayload,
                columns,
                cards,
            };
        }

        // If payload shape is weird: still fallback
        throw new Error("Board payload missing columns.");
    } catch {
        // fallback: samples in testing
        const fallback = await apiGet<any>(`/v1/samples?status_enum=testing&per_page=200&page=1`);
        const pager = (fallback?.data && fallback?.meta) ? (fallback as PaginatedResponse<Sample>) : (fallback?.data ?? fallback);
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
            column_id: 1, // default col
        }));

        const board: TestingBoardPayload = {
            board_id: 0,
            workflow_group: group,
            columns,
            cards,
        };

        return { mode: "fallback" as const, group, board, columns, cards };
    }
}

/**
 * Move card between columns:
 * POST /v1/testing-board/move
 * body: { sample_id, from_column_id, to_column_id, note? }
 */
export async function moveTestingCard(payload: {
    sample_id: number;
    from_column_id: number | null;
    to_column_id: number;
    note?: string | null;
}) {
    return apiPost(`${BOARD_BASE}/move`, payload);
}

/**
 * Column management (rename/add/reorder) — Step 10.4
 * Endpoints are guesses; FE is ready.
 */
export async function renameTestingColumn(columnId: number, name: string) {
    return apiPatch(`${BOARD_BASE}/columns/${columnId}`, { name });
}

export async function addTestingColumn(payload: { group: string; name: string; position?: number }) {
    const { group, ...body } = payload;
    return apiPost(`${BOARD_BASE}/${encodeURIComponent(group)}/columns`, body);
}

export async function reorderTestingColumns(payload: { group: string; column_ids: number[] }) {
    const { group, ...body } = payload;
    return apiPost(`${BOARD_BASE}/${encodeURIComponent(group)}/columns/reorder`, body);
}