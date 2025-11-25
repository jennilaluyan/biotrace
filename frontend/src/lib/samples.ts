// src/lib/samples.ts
import { apiGet, apiPost } from "./api";

// Harus sesuai dengan CHECK constraint di migration
export type SampleStatus =
    | "received"
    | "in_progress"
    | "testing_completed"
    | "verified"
    | "validated"
    | "reported";

export type ContactHistory = "ada" | "tidak" | "tidak_tahu" | null;

// Data sample seperti yang disimpan di DB
export interface Sample {
    sample_id: number;
    client_id: number;

    received_at: string; // timestampTz → dikirim sebagai ISO string
    sample_type: string;

    examination_purpose: string | null;
    contact_history: ContactHistory;

    priority: number;
    current_status: SampleStatus;

    additional_notes: string | null;

    created_by: number;
}

// Payload untuk membuat sample baru
export interface CreateSamplePayload {
    client_id: number;

    received_at: string; // contoh: new Date().toISOString()
    sample_type: string;

    examination_purpose?: string | null;
    contact_history?: ContactHistory;

    priority?: number; // kalau tidak diisi, backend pakai default 0
    current_status: SampleStatus; // wajib, karena tidak ada default di DB

    additional_notes?: string | null;

    created_by: number;
}

// Service untuk operasi ke /v1/samples
export const sampleService = {
    // GET /v1/samples
    getAll(): Promise<Sample[]> {
        return apiGet<Sample[]>("/v1/samples");
    },

    // GET /v1/samples/:id
    getById(id: number): Promise<Sample> {
        return apiGet<Sample>(`/v1/samples/${id}`);
    },

    // POST /v1/samples
    create(payload: CreateSamplePayload): Promise<Sample> {
        return apiPost<Sample>("/v1/samples", payload);
    }
};
