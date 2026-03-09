import { apiGet, apiPatch, apiPost } from "./api";

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const API_VER =
    (import.meta.env.VITE_API_VER as string | undefined) ??
    (RAW_BASE === "/api" || RAW_BASE.endsWith("/api") ? "/v1" : "/api/v1");

type QueryParams = Record<string, string | number | boolean | null | undefined>;

function buildQueryString(params?: QueryParams) {
    const qs = new URLSearchParams();

    for (const [key, value] of Object.entries(params ?? {})) {
        if (value === undefined || value === null || value === "") continue;
        qs.set(key, String(value));
    }

    const query = qs.toString();
    return query ? `?${query}` : "";
}

function unwrapApi<T>(res: any): T {
    return (res?.data?.data ?? res?.data) as T;
}

function extractCollection<T>(value: any): T[] {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    if (Array.isArray(value?.items)) return value.items;
    return [];
}

export type Paginated<T> = {
    current_page: number;
    data: T[];
    first_page_url?: string;
    from?: number | null;
    last_page?: number;
    last_page_url?: string;
    links?: Array<{ url: string | null; label: string; active: boolean }>;
    next_page_url?: string | null;
    path?: string;
    per_page?: number;
    prev_page_url?: string | null;
    to?: number | null;
    total?: number;
};

export type ApiEnvelope<T> = {
    status: number;
    message?: string | null;
    data: T;
    timestamp?: string;
    context?: any;
    meta?: any;
};

export type Unit = {
    unit_id: number;
    name: string;
    symbol?: string | null;
    description?: string | null;
    is_active: boolean;
};

export type UnitLite = {
    unit_id: number;
    code?: string | null;
    name?: string | null;
    symbol?: string | null;
};

export type Method = {
    method_id: number;
    code?: string | null;
    name: string;
    description?: string | null;
    is_active: boolean;
};

export type MethodLite = {
    method_id: number;
    code?: string | null;
    name: string;
    description?: string | null;
    is_active?: boolean;
};

export type Parameter = {
    parameter_id: number;
    code?: string | null;
    name: string;
    unit?: string | null;
    unit_id?: number | null;
    method_ref?: string | null;
    status?: string | null;
    tag?: string | null;
};

export type ParameterLite = {
    parameter_id: number;
    code?: string | null;
    name?: string | null;
    unit?: string | null;
    unit_id?: number | null;
    method_ref?: string | null;
    status?: string | null;
    tag?: string | null;
};

export type StaffLite = {
    staff_id: number;
    name: string;
    email?: string | null;
    role_id?: number | null;
    is_active?: boolean;
};

export type TestResult = {
    result_id: number;
    sample_test_id: number;
    value_raw?: string | null;
    value_final?: string | null;
    unit_id?: number | null;
    flags?: any;
    version_no: number;
    created_by?: number | null;
    created_at?: string | null;
};

export type SampleTest = {
    sample_test_id: number;
    sample_id: number;
    parameter_id: number;
    method_id: number | null;
    assigned_to: number | null;
    status: string;
    started_at?: string | null;
    completed_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    parameter?: Parameter;
    method?: Method | null;
    assignee?: StaffLite | null;
    latest_result?: TestResult | null;
};

export type TestResultPayload = {
    value_raw?: string | number | null;
    value_final?: string | number | null;
    unit_id?: number | null;
    flags?: any;
    notes?: string | null;
};

export type SampleTestStatus =
    | "draft"
    | "in_progress"
    | "measured"
    | "verified"
    | "validated"
    | "failed"
    | string;

export type BulkSampleTestItem = {
    parameter_id: number;
    method_id?: number | null;
    assigned_to?: number | null;
};

export type BulkCreateTestItem = BulkSampleTestItem;

export type BulkCreateResponse = {
    sample_id: number;
    created_count: number;
    skipped_count: number;
    skipped_parameter_ids?: number[];
    sample_ids?: number[];
};

export type BulkRunResult = {
    okIds: number[];
    failed: Array<{ id: number; error: unknown }>;
};

export async function listParameters(params?: {
    page?: number;
    per_page?: number;
    q?: string;
}) {
    return apiGet<ApiEnvelope<Paginated<ParameterLite>>>(
        `${API_VER}/parameters${buildQueryString(params)}`
    );
}

export async function listMethods(params?: {
    page?: number;
    per_page?: number;
    q?: string;
}) {
    return apiGet<ApiEnvelope<Paginated<MethodLite>>>(
        `${API_VER}/methods${buildQueryString(params)}`
    );
}

export async function listUnits(params?: { page?: number; per_page?: number }) {
    return apiGet<ApiEnvelope<Paginated<UnitLite> | UnitLite[]>>(
        `${API_VER}/units${buildQueryString(params)}`
    );
}

export async function listSampleTestsBySample(
    sampleId: number,
    params?: { page?: number; per_page?: number; status?: string; assigned_to?: number }
) {
    return apiGet<ApiEnvelope<Paginated<SampleTest>>>(
        `${API_VER}/samples/${sampleId}/sample-tests${buildQueryString(params)}`
    );
}

export async function bulkCreateSampleTests(
    sampleId: number,
    tests: BulkSampleTestItem[],
    sampleIds?: number[]
) {
    const body: { tests: BulkSampleTestItem[]; sample_ids?: number[] } = { tests };

    if (Array.isArray(sampleIds) && sampleIds.length > 0) {
        body.sample_ids = sampleIds;
    }

    return apiPost<ApiEnvelope<BulkCreateResponse>>(
        `${API_VER}/samples/${sampleId}/sample-tests/bulk`,
        body
    );
}

export async function fetchUnits(perPage = 200): Promise<UnitLite[]> {
    const res = await listUnits({ per_page: perPage });
    return extractCollection<UnitLite>(unwrapApi(res));
}

export async function createSampleTestResult(
    sampleTestId: number,
    payload: TestResultPayload
) {
    return apiPost<ApiEnvelope<TestResult>>(
        `${API_VER}/sample-tests/${sampleTestId}/results`,
        payload
    );
}

export async function updateSampleTestResult(
    resultId: number,
    payload: TestResultPayload
) {
    return apiPatch<ApiEnvelope<TestResult>>(
        `${API_VER}/test-results/${resultId}`,
        payload
    );
}

export async function updateSampleTestStatus(
    sampleTestId: number,
    status: SampleTestStatus
) {
    return apiPost<ApiEnvelope<any>>(
        `${API_VER}/sample-tests/${sampleTestId}/status`,
        { status }
    );
}

export async function fetchReagentCalculationBySample(sampleId: number) {
    return apiGet<ApiEnvelope<any>>(`${API_VER}/samples/${sampleId}/reagent-calculation`);
}

export function unwrapCalc(res: any) {
    const data = unwrapApi<any>(res);
    if (!data) return null;
    return data?.calc ?? data;
}

export async function verifySampleTest(id: number, note?: string | null) {
    const payload = note ? { note } : {};
    return apiPost<ApiEnvelope<any>>(`${API_VER}/sample-tests/${id}/verify`, payload);
}

export async function validateSampleTest(id: number, note?: string | null) {
    const payload = note ? { note } : {};
    return apiPost<ApiEnvelope<any>>(`${API_VER}/sample-tests/${id}/validate`, payload);
}

async function listBySample(
    sampleId: number,
    params?: { status?: string; assigned_to?: number; per_page?: number; page?: number }
) {
    const res = await listSampleTestsBySample(sampleId, params);
    return unwrapApi<Paginated<SampleTest>>(res);
}

async function bulkCreate(
    sampleId: number,
    payload: {
        tests: BulkSampleTestItem[];
        sample_ids?: number[];
    }
) {
    const res = await bulkCreateSampleTests(sampleId, payload.tests, payload.sample_ids);
    return unwrapApi<BulkCreateResponse>(res);
}

async function updateStatus(sampleTestId: number, status: SampleTestStatus) {
    const res = await updateSampleTestStatus(sampleTestId, status);
    return unwrapApi<any>(res);
}

async function createResult(sampleTestId: number, payload: TestResultPayload) {
    const res = await createSampleTestResult(sampleTestId, payload);
    return unwrapApi<TestResult>(res);
}

async function updateResult(resultId: number, payload: TestResultPayload) {
    const res = await updateSampleTestResult(resultId, payload);
    return unwrapApi<TestResult>(res);
}

export const sampleTestService = {
    listUnits,
    listBySample,
    bulkCreate,
    updateStatus,
    createResult,
    updateResult,
};

export async function runBulkLimited(
    ids: number[],
    runner: (id: number) => Promise<any>,
    concurrency = 2
): Promise<BulkRunResult> {
    const queue = [...ids];
    const okIds: number[] = [];
    const failed: Array<{ id: number; error: unknown }> = [];

    const workerCount = Math.max(1, Math.min(concurrency, ids.length || 1));

    const workers = Array.from({ length: workerCount }, async () => {
        while (queue.length > 0) {
            const id = queue.shift();
            if (id == null) continue;

            try {
                await runner(id);
                okIds.push(id);
            } catch (error) {
                failed.push({ id, error });
            }
        }
    });

    await Promise.all(workers);

    return { okIds, failed };
}

export async function bulkVerifySampleTests(
    ids: number[],
    note?: string | null,
    concurrency = 2
) {
    return runBulkLimited(ids, (id) => verifySampleTest(id, note), concurrency);
}

export async function bulkValidateSampleTests(
    ids: number[],
    note?: string | null,
    concurrency = 2
) {
    return runBulkLimited(ids, (id) => validateSampleTest(id, note), concurrency);
}

export async function runSerial<T>(
    items: T[],
    worker: (item: T) => Promise<any>
) {
    const results: any[] = [];

    for (const item of items) {
        results.push(await worker(item));
    }

    return results;
}