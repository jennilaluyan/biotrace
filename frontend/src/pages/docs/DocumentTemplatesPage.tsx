// L:\Campus\Final Countdown\biotrace\frontend\src\pages\docs\DocumentTemplatesPage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Pencil, RefreshCw, Search, Upload, X } from "lucide-react";
import { useTranslation } from "react-i18next";

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
    is_active?: boolean | number | string | null;

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
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
        const s = v.trim().toLowerCase();
        if (s === "0" || s === "false" || s === "no") return false;
        if (s === "1" || s === "true" || s === "yes") return true;
        return Boolean(s);
    }
    return Boolean(v);
}

function formatRevisionNo(n: unknown) {
    const rev = Number(n ?? 0) || 0;
    return `Rev${String(Math.max(0, rev)).padStart(2, "0")}`;
}

function pickCurrentVersionNo(r: DocTemplateRow): number | null {
    const v = (r.current_version?.version ?? r.current_version_no) as any;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
}

function pickUpdatedAt(r: DocTemplateRow): string | null {
    return r.updated_at ?? r.version_uploaded_at ?? r.current_version?.created_at ?? r.created_at ?? null;
}

function expectedTemplateExt(docCode: string): "docx" | "xlsx" {
    const dc = String(docCode ?? "").trim().toUpperCase();
    if (dc.startsWith("COA_")) return "xlsx";
    return "docx";
}

function isExpectedTemplateFile(docCode: string, file: File): boolean {
    const ext = expectedTemplateExt(docCode);
    return ext === "xlsx" ? /\.xlsx$/i.test(file.name) : /\.docx$/i.test(file.name);
}

function acceptByDocCode(docCode: string): string {
    const ext = expectedTemplateExt(docCode);
    return ext === "xlsx"
        ? ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let v = bytes;
    let idx = 0;
    while (v >= 1024 && idx < units.length - 1) {
        v /= 1024;
        idx += 1;
    }
    return `${v.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function DocumentTemplatesPage() {
    // IMPORTANT: force common namespace so keys like "search", "loading", "actions" always resolve.
    const { t } = useTranslation("common");

    // =============================
    // State
    // =============================
    const [rows, setRows] = useState<DocTemplateRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // One shared error string, but we *avoid* showing it behind modals.
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
    const [dragActive, setDragActive] = useState(false);

    const anyModalOpen = uploadModal.open || editModal.open;

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
        setErr(null);
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
        setErr(null);
        setUploadModal({ open: true, doc });
        setUploadFile(null);
        setDragActive(false);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
    }

    function closeUpload() {
        setUploadModal({ open: false, doc: null });
        setUploadFile(null);
        setDragActive(false);
        if (uploadInputRef.current) uploadInputRef.current.value = "";
    }

    // =============================
    // Upload helpers (dropzone)
    // =============================
    function pickFile(file: File | null) {
        const docCode = uploadModal.doc?.doc_code ?? "";
        const needExt = expectedTemplateExt(docCode);

        if (!file) {
            setUploadFile(null);
            return;
        }

        if (!isExpectedTemplateFile(docCode, file)) {
            setUploadFile(null);
            setErr(t("docs.templates.errors.invalidFileType", { ext: needExt }));
            return;
        }

        setErr(null);
        setUploadFile(file);
    }

    function onBrowseClick() {
        if (saving) return;
        uploadInputRef.current?.click();
    }

    function onDropFiles(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        const file = e.dataTransfer?.files?.[0] ?? null;
        pickFile(file);
    }

    function onDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        if (!saving) setDragActive(true);
    }

    function onDragLeave(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
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

        const docCode = uploadModal.doc?.doc_code ?? "";
        const needExt = expectedTemplateExt(docCode);

        if (!uploadFile) {
            setErr(t("docs.templates.errors.pickFileFirst"));
            return;
        }

        if (!isExpectedTemplateFile(docCode, uploadFile)) {
            setErr(t("docs.templates.errors.invalidFileType", { ext: needExt }));
            return;
        }

        setSaving(true);
        setErr(null);

        try {
            const fd = new FormData();
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

    function clearFilters() {
        setSearchTerm("");
        setActiveFilter("all");
        setPage(1);
    }

    // =============================
    // Render
    // =============================
    return (
        <div className="min-h-[60vh]">
            {/* Header */}
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-0 py-2">
                <div>
                    <h1 className="text-lg md:text-xl font-bold text-gray-900">{t("docs.templates.title")}</h1>
                    <p className="text-xs text-gray-500 mt-1">{t("docs.templates.subtitle")}</p>
                </div>

                <button
                    type="button"
                    className="lims-icon-button self-start md:self-auto"
                    onClick={load}
                    aria-label={t("refresh")}
                    title={t("refresh")}
                    disabled={loading || saving}
                >
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="mt-2 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {/* Filter bar */}
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="flex-1">
                        <label className="sr-only" htmlFor="tpl-search">
                            {t("search")}
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
                                placeholder={t("docs.templates.searchPlaceholder")}
                                className="w-full rounded-xl border border-gray-300 pl-9 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                            />

                            {searchTerm.trim() ? (
                                <button
                                    type="button"
                                    className="absolute inset-y-0 right-2 my-auto h-8 w-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100"
                                    onClick={() => setSearchTerm("")}
                                    aria-label={t("clearFilters")}
                                    title={t("clearFilters")}
                                >
                                    <X size={16} />
                                </button>
                            ) : null}
                        </div>
                    </div>

                    <div className="w-full md:w-52">
                        <label className="sr-only" htmlFor="tpl-active-filter">
                            {t("docs.templates.activeFilterLabel")}
                        </label>

                        <select
                            id="tpl-active-filter"
                            value={activeFilter}
                            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
                            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                        >
                            <option value="all">{t("docs.templates.activeFilter.all")}</option>
                            <option value="active">{t("docs.templates.activeFilter.active")}</option>
                            <option value="inactive">{t("docs.templates.activeFilter.inactive")}</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        className="btn-outline w-full md:w-auto"
                        onClick={clearFilters}
                        disabled={loading || saving}
                        title={t("clearFilters")}
                    >
                        {t("clearFilters")}
                    </button>
                </div>

                {/* Content */}
                <div className="px-4 md:px-6 py-4">
                    {err && !loading && !anyModalOpen && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">
                            {err}
                        </div>
                    )}

                    {loading ? (
                        <div className="text-sm text-gray-600">{t("docs.templates.loading")}</div>
                    ) : pageItems.length === 0 ? (
                        <div className="rounded-2xl border border-gray-200 bg-white px-5 py-8 text-center">
                            <div className="mx-auto h-10 w-10 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500">
                                <Search size={18} />
                            </div>
                            <div className="mt-3 text-sm font-semibold text-gray-900">{t("docs.templates.emptyTitle")}</div>
                            <div className="mt-1 text-xs text-gray-500 max-w-xl mx-auto">{t("docs.templates.emptyBody")}</div>
                            <div className="mt-4 flex items-center justify-center gap-2">
                                <button type="button" className="btn-outline" onClick={clearFilters} disabled={saving}>
                                    {t("clearFilters")}
                                </button>
                                <button type="button" className="btn-outline" onClick={load} disabled={saving}>
                                    {t("refresh")}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-white text-gray-700 border-b border-gray-100">
                                        <tr>
                                            <th className="text-left font-semibold px-4 py-3">{t("docs.templates.table.template")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("docs.templates.table.docCode")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("docs.templates.table.revision")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("docs.templates.table.currentVersion")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("docs.templates.table.updated")}</th>
                                            <th className="text-left font-semibold px-4 py-3">{t("docs.templates.table.active")}</th>
                                            <th className="text-right font-semibold px-4 py-3">{t("docs.templates.table.actions")}</th>
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
                                                        <div className="font-medium">{r.title || "—"}</div>
                                                        <div className="text-xs text-gray-500">
                                                            {r.kind ? t("docs.templates.kindValue", { kind: r.kind }) : t("docs.templates.kindEmpty")}
                                                        </div>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <span className="font-mono text-xs">{r.doc_code}</span>
                                                    </td>

                                                    <td className="px-4 py-3 text-gray-700">{revLabel}</td>

                                                    <td className="px-4 py-3 text-gray-700">{ver === null ? "—" : `v${ver}`}</td>

                                                    <td className="px-4 py-3 text-gray-700">{updated ? formatDateTimeLocal(updated) : "—"}</td>

                                                    <td className="px-4 py-3 text-gray-700">
                                                        <label className="inline-flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={active}
                                                                disabled={saving}
                                                                onChange={(e) => toggleActive(r, e.target.checked)}
                                                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary-soft"
                                                                aria-label={`${r.doc_code} ${active ? t("docs.templates.status.active") : t("docs.templates.status.inactive")}`}
                                                            />
                                                            <span className="text-xs text-gray-600">
                                                                {active ? t("docs.templates.status.active") : t("docs.templates.status.inactive")}
                                                            </span>
                                                        </label>
                                                    </td>

                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                type="button"
                                                                className="lims-icon-button"
                                                                aria-label={t("docs.templates.actions.uploadDocx")}
                                                                title={t("docs.templates.actions.uploadDocx")}
                                                                onClick={() => openUpload(r)}
                                                                disabled={saving}
                                                            >
                                                                <Upload size={16} />
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="lims-icon-button"
                                                                aria-label={t("docs.templates.actions.editMetadata")}
                                                                title={t("docs.templates.actions.editMetadata")}
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

                            {/* Pagination */}
                            <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
                                <div className="text-xs text-gray-600">
                                    {t("docs.templates.pagination.showing", {
                                        from: total === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1,
                                        to: Math.min(clampedPage * PAGE_SIZE, total),
                                        total,
                                    })}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={!canPrev}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label={t("prev")}
                                        title={t("prev")}
                                    >
                                        <ChevronLeft size={16} />
                                    </button>

                                    <div className="text-xs text-gray-600">{t("docs.templates.pagination.pageOf", { page: clampedPage, totalPages })}</div>

                                    <button
                                        type="button"
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={!canNext}
                                        className="lims-icon-button disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label={t("next")}
                                        title={t("next")}
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-3 text-xs text-gray-500">
                                <span className="mr-2">{t("docs.templates.quickAccess")}</span>
                                <Link className="underline" to="/reports">
                                    {t("nav.reports")}
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
                                <div className="font-semibold text-gray-900">{t("docs.templates.upload.title")}</div>
                                <div className="text-xs text-gray-500 font-mono truncate">{uploadModal.doc?.doc_code}</div>
                            </div>

                            <button
                                type="button"
                                className="lims-icon-button"
                                onClick={closeUpload}
                                aria-label={t("close")}
                                title={t("close")}
                                disabled={saving}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="lims-modal-body">
                            {/* Modal-specific error */}
                            {err && <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{err}</div>}

                            <div className="text-sm text-gray-600">{t("docs.templates.upload.hint")}</div>

                            {/* Dropzone */}
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={onBrowseClick}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") onBrowseClick();
                                }}
                                onDrop={onDropFiles}
                                onDragOver={onDragOver}
                                onDragLeave={onDragLeave}
                                className={cx(
                                    "mt-2 rounded-2xl border-2 border-dashed p-5 transition",
                                    "cursor-pointer select-none",
                                    saving && "opacity-70 cursor-not-allowed pointer-events-none",
                                    dragActive ? "border-primary-soft bg-primary-soft/10" : "border-gray-300 bg-gray-50 hover:bg-gray-100/70"
                                )}
                                aria-label={t("docs.templates.upload.dropzoneAria")}
                                title={t("docs.templates.upload.dropzoneTitle")}
                            >
                                <div className="flex flex-col items-center text-center gap-2">
                                    <div
                                        className={cx(
                                            "h-10 w-10 rounded-2xl flex items-center justify-center",
                                            dragActive ? "bg-primary-soft/15 text-primary" : "bg-black/5 text-gray-700"
                                        )}
                                    >
                                        <Upload size={18} />
                                    </div>

                                    <div className="text-sm text-gray-800 font-medium">{t("docs.templates.upload.dropzoneHeadline")}</div>

                                    <div className="text-xs text-gray-600">
                                        {t("docs.templates.upload.dropzoneSub")}
                                        <span className="underline text-primary"> {t("docs.templates.upload.dropzoneBrowse")}</span>
                                    </div>

                                    <div className="text-[11px] text-gray-500 mt-1">
                                        {t("docs.templates.upload.supportedExt", { ext: expectedTemplateExt(uploadModal.doc?.doc_code ?? "") })}
                                    </div>
                                </div>

                                {/* Hidden input */}
                                <input
                                    ref={uploadInputRef}
                                    type="file"
                                    accept={acceptByDocCode(uploadModal.doc?.doc_code ?? "")}
                                    onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                                    disabled={saving}
                                    className="hidden"
                                />
                            </div>

                            {/* Selected file */}
                            {uploadFile && (
                                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-gray-900 truncate">{uploadFile.name}</div>
                                        <div className="text-xs text-gray-500">{formatBytes(uploadFile.size)}</div>
                                    </div>

                                    <button
                                        type="button"
                                        className="lims-icon-button"
                                        aria-label={t("remove")}
                                        title={t("remove")}
                                        onClick={() => {
                                            pickFile(null);
                                            if (uploadInputRef.current) uploadInputRef.current.value = "";
                                        }}
                                        disabled={saving}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="lims-modal-footer">
                            <button type="button" className="btn-outline" onClick={closeUpload} disabled={saving}>
                                {t("cancel")}
                            </button>
                            <button
                                type="button"
                                className={cx("lims-btn-primary", saving && "opacity-70 cursor-not-allowed")}
                                onClick={doUpload}
                                disabled={saving || !uploadFile}
                                title={!uploadFile ? t("docs.templates.errors.pickDocxFirst") : t("docs.templates.upload.action")}
                            >
                                {saving ? t("docs.templates.upload.uploading") : t("docs.templates.upload.action")}
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
                                <div className="font-semibold text-gray-900">{t("docs.templates.edit.title")}</div>
                                <div className="text-xs text-gray-500 font-mono truncate">{editModal.doc?.doc_code}</div>
                            </div>

                            <button
                                type="button"
                                className="lims-icon-button"
                                onClick={closeEdit}
                                aria-label={t("close")}
                                title={t("close")}
                                disabled={saving}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="px-5 py-4">
                            {err && <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-4">{err}</div>}

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="md:col-span-2">
                                    <label className="text-xs font-medium text-gray-600">{t("docs.templates.edit.fields.title")}</label>
                                    <input
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        placeholder={t("docs.templates.edit.placeholders.title")}
                                        disabled={saving}
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">{t("docs.templates.edit.fields.recordPrefix")}</label>
                                    <input
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        value={editRecordPrefix}
                                        onChange={(e) => setEditRecordPrefix(e.target.value)}
                                        placeholder={t("docs.templates.edit.placeholders.recordPrefix")}
                                        disabled={saving}
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500">{t("docs.templates.edit.hints.recordPrefix")}</div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">{t("docs.templates.edit.fields.formPrefix")}</label>
                                    <input
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        value={editFormPrefix}
                                        onChange={(e) => setEditFormPrefix(e.target.value)}
                                        placeholder={t("docs.templates.edit.placeholders.formPrefix")}
                                        disabled={saving}
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500">{t("docs.templates.edit.hints.formPrefix")}</div>
                                </div>

                                <div>
                                    <label className="text-xs font-medium text-gray-600">{t("docs.templates.edit.fields.revisionNo")}</label>
                                    <input
                                        type="number"
                                        min={0}
                                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                        value={editRevisionNo}
                                        onChange={(e) => setEditRevisionNo(Number(e.target.value))}
                                        disabled={saving}
                                    />
                                    <div className="mt-1 text-[11px] text-gray-500">{t("docs.templates.edit.hints.revisionNo")}</div>
                                </div>

                                <div className="flex items-end">
                                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                            type="checkbox"
                                            checked={editIsActive}
                                            onChange={(e) => setEditIsActive(e.target.checked)}
                                            disabled={saving}
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary-soft"
                                        />
                                        {t("docs.templates.status.active")}
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                            <div className="text-xs text-gray-500">{t("docs.templates.edit.footerTip")}</div>

                            <div className="flex gap-2">
                                <button type="button" className="btn-outline" onClick={closeEdit} disabled={saving}>
                                    {t("cancel")}
                                </button>
                                <button
                                    type="button"
                                    className={cx("lims-btn-primary", saving && "opacity-70 cursor-not-allowed")}
                                    onClick={saveEdit}
                                    disabled={saving}
                                >
                                    {saving ? t("saving") : t("save")}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
