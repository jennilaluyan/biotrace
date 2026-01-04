// frontend/src/services/sampleTests.ts
import { apiGet, apiPost, apiPatch } from "./api";

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

export type Unit = {
    unit_id: number;
    name: string;
    symbol?: string | null;
    description?: string | null;
    is_active: boolean;
};

export type Method = {
    method_id: number;
    code?: string | null;
    name: string;
    description?: string | null;
    is_active: boolean;
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

// ---- API response shape (based on ApiResponse::success)
type ApiSuccess<T> = {
    timestamp?: string;
    status: number;
    message?: string | null;
    data: T;
    context?: any;
    meta?: any;
};

function unwrap<T>(res: any): T {
    return (res?.data?.data ?? res?.data) as T;
}

async function listUnits(params?: { q?: string; per_page?: number; page?: number }) {
    const res = await apiGet("/units", { params });
    return unwrap<Paginated<Unit>>(res);
}

async function listBySample(
    sampleId: number,
    params?: { status?: string; assigned_to?: number; per_page?: number; page?: number }
) {
    const res = await apiGet(`/samples/${sampleId}/sample-tests`, { params });
    return unwrap<Paginated<SampleTest>>(res);
}

async function bulkCreate(
    sampleId: number,
    payload: {
        tests: Array<{ parameter_id: number; method_id?: number | null; assigned_to?: number | null }>;
    }
) {
    const res = await apiPost(`/samples/${sampleId}/sample-tests/bulk`, payload);
    return unwrap<any>(res);
}

async function updateStatus(sampleTestId: number, status: string) {
    const res = await apiPost(`/sample-tests/${sampleTestId}/status`, { status });
    return unwrap<any>(res);
}

async function createResult(
    sampleTestId: number,
    payload: { value_raw?: string | null; value_final?: string | null; unit_id?: number | null; flags?: any }
) {
    const res = await apiPost(`/sample-tests/${sampleTestId}/results`, payload);
    return unwrap<TestResult>(res);
}

async function updateResult(
    resultId: number,
    payload: { value_raw?: string | null; value_final?: string | null; unit_id?: number | null; flags?: any }
) {
    const res = await apiPatch(`/test-results/${resultId}`, payload);
    return unwrap<TestResult>(res);
}

export const sampleTestService = {
    listUnits,
    listBySample,
    bulkCreate,
    updateStatus,
    createResult,
    updateResult,
};
