// frontend/src/services/sampleTests.ts
import { apiGet, apiPost, apiPatch } from "./api";

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const API_VER =
    (import.meta.env.VITE_API_VER as string | undefined) ??
    (RAW_BASE === "/api" || RAW_BASE.endsWith("/api") ? "/v1" : "/api/v1");

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

export type TestResultPayload = {
    value_raw?: string | number | null;
    value_final?: string | number | null;
    unit_id?: number | null;
    flags?: any;
    notes?: string | null;
};

export type UnitLite = {
    unit_id: number;
    code?: string | null;
    name?: string | null;
    symbol?: string | null;
};

export type SampleTestStatus = "draft" | "in_progress" | "measured" | "verified" | "validated" | string;

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

export type ApiEnvelope<T> = {
    status: number;
    message?: string | null;
    data: T;
    timestamp?: string;
    context?: any;
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

export type MethodLite = {
    method_id: number;
    code?: string | null;
    name: string;
    description?: string | null;
    is_active?: boolean;
};

export type BulkCreateTestItem = {
    parameter_id: number;
    method_id: number;
    assigned_to?: number | null;
};

export type BulkCreateResponse = {
    sample_id: number;
    created_count: number;
    skipped_count: number;
    skipped_parameter_ids?: number[];
};

export async function listParameters(params?: {
    page?: number;
    per_page?: number;
    q?: string;
}) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    return apiGet<ApiEnvelope<Paginated<ParameterLite>>>(
        `${API_VER}/parameters${suffix}`
    );
}

export async function listMethods(params?: {
    page?: number;
    per_page?: number;
    q?: string;
}) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.q) qs.set("q", params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    return apiGet<ApiEnvelope<Paginated<MethodLite>>>(
        `${API_VER}/methods${suffix}`
    );
}

export async function listUnits(params?: { page?: number; per_page?: number }) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    return apiGet(`${API_VER}/units${suffix}`);
}

export async function listSampleTestsBySample(
    sampleId: number,
    params?: { page?: number; per_page?: number; status?: string }
) {
    const qs = new URLSearchParams();
    if (params?.page) qs.set("page", String(params.page));
    if (params?.per_page) qs.set("per_page", String(params.per_page));
    if (params?.status) qs.set("status", params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";

    return apiGet(`${API_VER}/samples/${sampleId}/sample-tests${suffix}`);
}

export async function bulkCreateSampleTests(
    sampleId: number,
    tests: BulkCreateTestItem[]
) {
    return apiPost<ApiEnvelope<BulkCreateResponse>>(
        `${API_VER}/samples/${sampleId}/sample-tests/bulk`,
        { tests }
    );
}

// ✅ Load units for dropdown
export async function fetchUnits(perPage = 200): Promise<UnitLite[]> {
    const res = await apiGet<any>(`/v1/units?per_page=${perPage}`);
    // adapt ke response kamu: bisa res.data.data atau res.data.items
    return res?.data?.data ?? res?.data?.items ?? res?.data ?? [];
}

// ✅ create result
export async function createSampleTestResult(sampleTestId: number, payload: any) {
    // kalau baseURL kamu sudah "/api", pakai "/v1/..."
    return apiPost(`/v1/sample-tests/${sampleTestId}/results`, payload);
}

// ✅ update result
export async function updateSampleTestResult(resultId: number, payload: any) {
    return apiPatch(`/v1/test-results/${resultId}`, payload);
}

// ✅ update status
export async function updateSampleTestStatus(sampleTestId: number, status: "in_progress" | "measured" | "failed") {
    return apiPost(`/v1/sample-tests/${sampleTestId}/status`, { status });
}

export async function fetchReagentCalculationBySample(sampleId: number) {
    return apiGet(`/v1/samples/${sampleId}/reagent-calculation`);
}

export function unwrapCalc(res: any) {
    const data = res?.data?.data;
    if (!data) return null;
    return data?.calc ?? data;
}