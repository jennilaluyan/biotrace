// L:\Campus\Final Countdown\biotrace\frontend\src\pages\docs\DocumentTemplatesPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Pencil, RefreshCw, Search, Upload, X } from "lucide-react";

import { apiGet, apiPatch, apiPostRaw } from "../../services/api";
import { formatDateTimeLocal } from "../../utils/date";
import { getErrorMessage } from "../../utils/errors";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

/**
 * FE supports 2 shapes:
 * 1) Old-ish: { current_version: { version, created_at }, updated_at }
 * 2) Current backend (DocumentTemplateController@index):
 *    - current_version_no
 *    - version_uploaded_at
 *    - version_current_id
 */
type DocTemplateRow = {
    doc_code: string;
    title?: string | null;

    kind?: string | null;
    is_active?: boolean | number | null;

    record_no_prefix?: string | null;
    form_code_prefix?: string | null;
    revision_no?: number | null;

    // shape A
    current_version_id?: number | null;
    current_version?: { version?: number | null; created_at?: string | null } | null;

    // shape B (current backend)
    doc_id?: number | null;
    version_current_id?: number | null;
    current_version_no?: number | null;
    version_uploaded_at?: string | null;

    updated_at?: string | null;
    created_at?: string | null;
};

type UploadModalState = {
    open: boolean;
    doc?: DocTemplateRow | null;
};

type EditModalState = {
    open: boolean;
    doc?: DocTemplateRow | null;
};

type ActiveFilter = "all" | "active" | "inactive";

const PAGE_SIZE = 12;

function toBool(v: unknown, fallback = false) {
    if (v === null || v === undefined) return fallback;
    return Boolean(v);
}

function formatRevisionNo(n: unknown) {
    const rev = Number(n ?? 0) || 0;
    return `Rev${String(rev).padStart(2, "0")}`;
}

function pickCurrentVersionNo(r: DocTemplateRow): number | null {
    const v = (r.current_version?.version ?? r.current_version_no) as any;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function pickUpdatedAt(r: DocTemplateRow): string | null {
    return r.updated_at ?? r.version_uploaded_at ?? r.current_version?.created_at ?? r.created_at ?? null;
}

export function DocumentTemplatesPage() {
    // =============================
    // State
    // =============================
    const [rows, setRows] = useState<DocTemplateRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    // filters
    const [searchTerm, setSearchTerm] = useState("");
    const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");

    // pagination
    const [page, setPage] = useState(1);

    // modals
    const [uploadModal, setUploadModal] = useState<UploadModalState>({ open: false, doc: null });
    const [editModal, setEditModal] = useState<EditModalState>({ open: false, doc: null });

    // edit fields
    const [editTitle, setEditTitle] = useState("");
    const [editRecordPrefix, setEditRecordPrefix] = useState("");
    const [editFormPrefix, setEditFormPrefix] = useState("");
    const [editRevisionNo, setEditRevisionNo] = useState<number>(0);
    const [editIsActive, setEditIsActive] = useState<boolean>(true);

    // upload fields
    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);

    // =============================
    // Data loading
    // =============================
    const load = async () => {
        setLoading(true);
        setErr(null);

        try {
            // Convention: api.ts expects "/v1/*" (baseURL already points to API root)
            const res = await apiGet<{ data?: DocTemplateRow[] }>("/v1/document-templates");
            setRows(Array.isArray(res?.data) ? (res.data as DocTemplateRow[]) : []);
            setPage(1);
        } catch (e) {
            setErr(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [searchTerm, activeFilter]);

    // =============================
    // Derived
    // =============================
    const filtered = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();

        return (rows ?? []).filter((r) => {
            const active = toBool(r.is_active, true);
            if (activeFilter === "active" && !active) return false;
            if (activeFilter === "inactive" && active) return false;

            if (!q) return true;

            const a = String(r.doc_code ?? "").toLowerCase();
            const b = String(r.title ?? "").toLowerCase();
            const c = String(r.kind ?? "").toLowerCase();
            return a.includes(q) || b.includes(q) || c.includes(q);
        });
    }, [rows, searchTerm, activeFilter]);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const clampedPage = Math.min(Math.max(1, page), totalPages);

    const pageItems = filtered.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

    const canPrev = clampedPage > 1;
    const canNext = clampedPage < totalPages;

    // =============================
    // Modal helpers
    // =============================
    function openEdit(doc: DocTemplateRow) {
        setEditModal({ open: true, doc });

        setEditTitle(String(doc.title ?? ""));
        setEditRecordPrefix(String(doc.record_no_prefix ?? ""));
        setEditFormPrefix(String(doc.form_code_prefix ?? ""));
        setEditRevisionNo(Number(doc.revision_no ?? 0) || 0);
        setEditIsActive(toBool(doc.is_active, true));
    }

    function closeEdit() {
        setEditModal({ open: false, doc: null });
    }

    function openUpload(doc: DocTemplateRow) {
        setUploadModal({ open: true, doc });
        setUploadFile(null);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
    }

    function closeUpload() {
        setUploadModal({ open: false, doc: null });
        setUploadFile(null);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
    }

    // =============================
    // Actions
    // =============================
    async function saveEdit() {
        const doc = editModal.doc;
        if (!doc) return;

        setSaving(true);
        setErr(null);

        try {
            await apiPatch(`/v1/document-templates/${encodeURIComponent(doc.doc_code)}`, {
                title: editTitle || null,
                record_no_prefix: editRecordPrefix || null,
                form_code_prefix: editFormPrefix || null,
                revision_no: Number(editRevisionNo) || 0,
                is_active: editIsActive ? 1 : 0,
            });

            closeEdit();
            await load();
        } catch (e) {
            setErr(getErrorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    async function toggleActive(doc: DocTemplateRow, next: boolean) {
        setErr(null);

        // optimistic update first (feels snappier)
        setRows((prev) =>
            prev.map((x) =>
                x.doc_code === doc.doc_code
                    ? {
                        ...x,
                        is_active: next ? 1 : 0,
                    }
                    : x
            )
        );

        try {
            await apiPatch(`/v1/document-templates/${encodeURIComponent(doc.doc_code)}`, {
                is_active: next ? 1 : 0,
            });
        } catch (e) {
            // rollback if failed
            setRows((prev) =>
                prev.map((x) =>
                    x.doc_code === doc.doc_code
                        ? {
                            ...x,
                            is_active: doc.is_active ?? 1,
                        }
                        : x
                )
            );
            setErr(getErrorMessage(e));
        }
    }

    async function doUpload() {
        const doc = uploadModal.doc;
        if (!doc) return;

        if (!uploadFile) {
            setErr("Pilih file .docx dulu.");
            return;
        }

        setSaving(true);
        setErr(null);

        try {
            const fd = new FormData();
            // Backend expects field name: "file"
            fd.append("file", uploadFile, uploadFile.name);

            // IMPORTANT: do NOT manually set Content-Type for multipart;
            // axios must generate the boundary.
            await apiPostRaw(`/v1/document-templates/${encodeURIComponent(doc.doc_code)}/versions`, fd, {
                headers: { Accept: "application/json" },
            });

            closeUpload();
            await load();
        } catch (e) {
            setErr(getErrorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    // =============================
    // Render
    // =============================
    return (
        <div className="min-h-[60vh]">
            {/* Header (match ReportsPage) */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">Document Templates</h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Upload DOCX template, atur prefix nomor rekaman, prefix kode form, dan revision (RevXX).
                    </p>
                </div>

                <button
                    type="button"
                    className="lims-icon-button self-start md:self-auto"
                    onClick={load}
                    aria-label="Refresh"
                    title="Refresh"
                    disabled={loading}
                >
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar (match ReportsPage) */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="tpl-search">
                            Search templates
                        </label>

                        <div className="relative">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">
                                <Search size={16} />
                            </span>

                            <input
                                id="tpl-search"
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search by doc code / title / kind…"
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />
                        </div>
                    </div>

                    <div className="w-full md:w-48">
                        <label className="sr-only" htmlFor="tpl-active-filter">
                            Active filter
                        </label>

                        <select
                            id="tpl-active-filter"
                            value={activeFilter}
                            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">All</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        className="lims-icon-button"
                        onClick={() => setPage(1)}
                        aria-label="Apply filters"
                        title="Apply filters"
                        disabled={loading}
                    >
                        <Search size={16} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 md:px-6 py-4">
                    {err && !loading && (
                        <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">{err}</div>
                    )}

                    {loading ? (
                        <div className="text-sm text-gray-600">Loading templates…</div>
                    ) : pageItems.length === 0 ? (
                        <div className="text-sm text-gray-600">No templates found.</div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">Template</th>
                                            <th className="text-left font-semibold px-4 py-3">Doc Code</th>
                                            <th className="text-left font-semibold px-4 py-3">Revision</th>
                                            <th className="text-left font-semibold px-4 py-3">Current Version</th>
                                            <th className="text-left font-semibold px-4 py-3">Updated</th>
                                            <th className="text-left font-semibold px-4 py-3">Active</th>
                                            <th className="text-right font-semibold px-4 py-3">Actions</th>
                                        </tr>
                                    </thead>

                                    <tbody className="divide-y divide-gray-100">
                                        {pageItems.map((r) => {
                                            const ver = pickCurrentVersionNo(r);
                                            const revLabel = formatRevisionNo(r.revision_no);
                                            const updated = pickUpdatedAt(r);
                                            const active = toBool(r.is_active, true);

                                            return (
                                                <tr key={r.doc_code} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-900">
                                                        <div className="font-medium">{r.title || "-"}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {r.kind ? `kind: ${r.kind}` : "kind: -"}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <span className="font-mono text-xs">{r.doc_code}</span>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">{revLabel}</td>

                                                    <td className="px-4 py-3 text-gray-700">{ver === null ? "-" : `v${ver}`}</td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        {updated ? formatDateTimeLocal(updated) : "-"}
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <label className="inline-flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={active}
                                                                disabled={saving}
                                                                onChange={(e) => toggleActive(r, e.target.checked)}
                                                            />
                                                            <span className="text-xs text-gray-600">
                                                                {active ? "Active" : "Inactive"}
                                                            </span>
                                                        </label>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                className="lims-icon-button"
                                                                aria-label="Upload DOCX"
                                                                title="Upload DOCX"
                                                                onClick={() => openUpload(r)}
                                                                disabled={saving}
                                                            >
                                                                <Upload size={16} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="lims-icon-button"
                                                                aria-label="Edit metadata"
                                                                title="Edit metadata"
                                                                onClick={() => openEdit(r)}
                                                                disabled={saving}
                                                            >
                                                                <Pencil size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination (match ReportsPage) */}
                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    Showing{" "}
                                    <span className="font-semibold">
                                        {total === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1}
                                    </span>{" "}
                                    to <span className="font-semibold">{Math.min(clampedPage * PAGE_SIZE, total)}</span>{" "}
                                    of <span className="font-semibold">{total}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={!canPrev}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label="Previous"
                                        title="Previous"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    <div className="text-xs text-gray-600">
                                        Page <span className="font-semibold">{clampedPage}</span> /{" "}
                                        <span className="font-semibold">{totalPages}</span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={!canNext}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label="Next"
                                        title="Next"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3 text-xs text-gray-500">
                                <span className="mr-2">Quick access:</span>
                                <Link className="underline" to="/reports">
                                    Reports
                                </Link>
                                <span className="mx-2">·</span>
                                <span className="font-mono">/v1/document-templates</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Upload Modal */}
            {uploadModal.open && (
                <div className="lims-modal-backdrop p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white shadow-lg">
                        <div className="lims-modal-header justify-between">
                            <div className="min-w-0">
                                <div className="font-semibold text-gray-900">Upload DOCX Template</div>
                                <div className="text-xs text-gray-500 font-mono truncate">{uploadModal.doc?.doc_code}</div>
                            </div>

                            <button
                                type="button"
                                className="lims-icon-button"
                                onClick={closeUpload}
                                aria-label="Close"
                                title="Close"
                                disabled={saving}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="lims-modal-body">
                            <div className="text-sm text-gray-600">
                                Upload file <span className="font-medium">.docx</span>. Setelah upload, sistem akan bikin version baru
                                (vN).
                            </div>

                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                                disabled={saving}
                                className="block w-full text-sm"
                            />
                        </div>

                        <div className="lims-modal-footer">
                            <button type="button" className="btn-outline" onClick={closeUpload} disabled={saving}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className={cx("lims-btn-primary", saving && "opacity-70 cursor-not-allowed")}
                                onClick={doUpload}
                                disabled={saving}
                            >
                                {saving ? "Uploading…" : "Upload"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editModal.open && (
                <div className="lims-modal-backdrop p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-lg">
                        <div className="lims-modal-header justify-between">
                            <div className="min-w-0">
                                <div className="font-semibold text-gray-900">Edit Template Metadata</div>
                                <div className="text-xs text-gray-500 font-mono truncate">{editModal.doc?.doc_code}</div>
                            </div>

                            <button
                                type="button"
                                className="lims-icon-button"
                                onClick={closeEdit}
                                aria-label="Close"
                                title="Close"
                                disabled={saving}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="px-5 py-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="md:col-span-2">
                                    <label className="text-xs font-medium text-gray-600">Title</label>
                                    <input
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        placeholder="Document title…"
                                        disabled={saving}
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">Record No Prefix</label>
                                    <input
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        value={editRecordPrefix}
                                        onChange={(e) => setEditRecordPrefix(e.target.value)}
                                        placeholder="REK/LAB-BM/…/"
                                        disabled={saving}
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500">
                                        Output: prefix + <span className="font-mono">DDMMYY</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">Form Code Prefix</label>
                                    <input
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        value={editFormPrefix}
                                        onChange={(e) => setEditFormPrefix(e.target.value)}
                                        placeholder="FORM/LAB-BM/…RevXX."
                                        disabled={saving}
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500">
                                        Output: prefix + <span className="font-mono">DD-MM-YY</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">Revision No</label>
                                    <input
                                        type="number"
                                        min={0}
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        value={editRevisionNo}
                                        onChange={(e) => setEditRevisionNo(Number(e.target.value))}
                                        disabled={saving}
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500">
                                        Ditampilkan sebagai <span className="font-mono">RevXX</span> (pad 2).
                                    </div>
                                </div>

                                <div className="flex items-end">
                                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={editIsActive}
                                            onChange={(e) => setEditIsActive(e.target.checked)}
                                            disabled={saving}
                                        />
                                        Active
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                            <div className="text-xs text-gray-500">
                                Tips: kalau prefix form kamu sudah mengandung <span className="font-mono">RevXX</span>, pastikan
                                konsisten sama revision_no.
                            </div>

                            <div className="flex gap-2">
                                <button type="button" className="btn-outline" onClick={closeEdit} disabled={saving}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className={cx("lims-btn-primary", saving && "opacity-70 cursor-not-allowed")}
                                    onClick={saveEdit}
                                    disabled={saving}
                                >
                                    {saving ? "Saving…" : "Save"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
