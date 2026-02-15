import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, RefreshCw, Upload, X } from "lucide-react";

import { http, apiGet, apiPatch } from "../../services/api";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTimeLocal } from "../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type DocTemplateRow = {
    doc_code: string;
    title?: string | null;

    kind?: string | null;
    is_active?: boolean | number | null;

    record_no_prefix?: string | null;
    form_code_prefix?: string | null;
    revision_no?: number | null;

    // backend bisa beda shape, jadi dibuat optional
    current_version_id?: number | null;
    current_version?: { version?: number | null; created_at?: string | null } | null;

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

export function DocumentTemplatesPage() {
    const [rows, setRows] = useState<DocTemplateRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [q, setQ] = useState("");

    const [uploadModal, setUploadModal] = useState<UploadModalState>({ open: false, doc: null });
    const [editModal, setEditModal] = useState<EditModalState>({ open: false, doc: null });

    const [saving, setSaving] = useState(false);

    const [editTitle, setEditTitle] = useState("");
    const [editRecordPrefix, setEditRecordPrefix] = useState("");
    const [editFormPrefix, setEditFormPrefix] = useState("");
    const [editRevisionNo, setEditRevisionNo] = useState<number>(0);
    const [editIsActive, setEditIsActive] = useState<boolean>(true);

    const uploadInputRef = useRef<HTMLInputElement | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);

    async function load() {
        setLoading(true);
        setErr(null);
        try {
            // expected: { data: [...] }
            const res = await apiGet<{ data?: DocTemplateRow[] }>("/api/v1/document-templates");
            setRows(Array.isArray(res?.data) ? (res.data as DocTemplateRow[]) : []);
        } catch (e) {
            setErr(getErrorMessage(e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        load();
    }, []);

    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return rows;

        return rows.filter((r) => {
            const a = (r.doc_code ?? "").toLowerCase();
            const b = (r.title ?? "").toLowerCase();
            return a.includes(needle) || b.includes(needle);
        });
    }, [rows, q]);

    function openEdit(doc: DocTemplateRow) {
        setEditModal({ open: true, doc });

        setEditTitle((doc.title ?? "").toString());
        setEditRecordPrefix((doc.record_no_prefix ?? "").toString());
        setEditFormPrefix((doc.form_code_prefix ?? "").toString());
        setEditRevisionNo(Number(doc.revision_no ?? 0) || 0);

        const active = doc.is_active;
        setEditIsActive(active === null || active === undefined ? true : Boolean(active));
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

    async function saveEdit() {
        const doc = editModal.doc;
        if (!doc) return;

        setSaving(true);
        setErr(null);
        try {
            await apiPatch(`/api/v1/document-templates/${encodeURIComponent(doc.doc_code)}`, {
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
        try {
            await apiPatch(`/api/v1/document-templates/${encodeURIComponent(doc.doc_code)}`, {
                is_active: next ? 1 : 0,
            });

            // optimistic update
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
        } catch (e) {
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
            // backend request biasanya expect "file"
            fd.append("file", uploadFile);

            await http.post(`/api/v1/document-templates/${encodeURIComponent(doc.doc_code)}/versions`, fd, {
                // axios akan set boundary; cukup kasih hint content-type
                headers: { "Content-Type": "multipart/form-data" },
            });

            closeUpload();
            await load();
        } catch (e) {
            setErr(getErrorMessage(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-xl font-semibold">Document Templates</div>
                    <div className="text-sm text-gray-500">
                        Upload DOCX template, atur prefix nomor rekaman, prefix kode form, dan revision (RevXX).
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className={cx(
                            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                            loading ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"
                        )}
                        onClick={load}
                        disabled={loading}
                        title="Refresh"
                    >
                        <RefreshCw className={cx("h-4 w-4", loading && "animate-spin")} />
                        Refresh
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <input
                    className="w-full max-w-md rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    placeholder="Search doc_code / title…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                />

                <div className="text-sm text-gray-500">
                    {loading ? "Loading…" : `${filtered.length} templates`}
                </div>
            </div>

            {err && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {err}
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border bg-white">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-700">
                        <tr>
                            <th className="px-4 py-3 text-left font-medium">Template Name</th>
                            <th className="px-4 py-3 text-left font-medium">Doc Code</th>
                            <th className="px-4 py-3 text-left font-medium">Revision</th>
                            <th className="px-4 py-3 text-left font-medium">Current Version</th>
                            <th className="px-4 py-3 text-left font-medium">Updated At</th>
                            <th className="px-4 py-3 text-left font-medium">Active</th>
                            <th className="px-4 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>

                    <tbody className="divide-y">
                        {filtered.map((r) => {
                            const verRaw = r.current_version?.version;
                            const ver = typeof verRaw === "number" && Number.isFinite(verRaw) ? verRaw : null;

                            const rev = Number(r.revision_no ?? 0) || 0;
                            const revLabel = `Rev${String(rev).padStart(2, "0")}`;

                            const updated =
                                r.updated_at ??
                                r.current_version?.created_at ??
                                r.created_at ??
                                null;

                            const active = r.is_active === null || r.is_active === undefined ? true : Boolean(r.is_active);

                            return (
                                <tr key={r.doc_code} className="hover:bg-gray-50/60">
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{r.title || "-"}</div>
                                        <div className="text-xs text-gray-500">{r.kind ? `kind: ${r.kind}` : ""}</div>
                                    </td>

                                    <td className="px-4 py-3 font-mono text-xs">{r.doc_code}</td>

                                    <td className="px-4 py-3">{revLabel}</td>

                                    <td className="px-4 py-3">
                                        {ver === null || ver === undefined ? "-" : `v${ver}`}
                                    </td>

                                    <td className="px-4 py-3 text-gray-600">
                                        {updated ? formatDateTimeLocal(updated) : "-"}
                                    </td>

                                    <td className="px-4 py-3">
                                        <label className="inline-flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={active}
                                                onChange={(e) => toggleActive(r, e.target.checked)}
                                            />
                                            <span className="text-xs text-gray-600">{active ? "Active" : "Inactive"}</span>
                                        </label>
                                    </td>

                                    <td className="px-4 py-3">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                                                onClick={() => openUpload(r)}
                                            >
                                                <Upload className="h-4 w-4" />
                                                Upload DOCX
                                            </button>

                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-gray-50"
                                                onClick={() => openEdit(r)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                                Edit
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {!loading && filtered.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                                    No templates found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Upload Modal */}
            {uploadModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="font-semibold">Upload DOCX Template</div>
                                <div className="text-xs text-gray-500 font-mono">{uploadModal.doc?.doc_code}</div>
                            </div>
                            <button
                                type="button"
                                className="rounded-lg p-2 hover:bg-gray-100"
                                onClick={closeUpload}
                                aria-label="Close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-3 p-4">
                            <div className="text-sm text-gray-600">
                                Upload file <span className="font-medium">.docx</span>. Setelah upload, sistem akan bikin version baru (vN).
                            </div>

                            <input
                                ref={uploadInputRef}
                                type="file"
                                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                            />

                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                                    onClick={closeUpload}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className={cx(
                                        "rounded-lg px-3 py-2 text-sm text-white bg-black hover:bg-black/90",
                                        saving && "opacity-70 cursor-not-allowed"
                                    )}
                                    onClick={doUpload}
                                    disabled={saving}
                                >
                                    {saving ? "Uploading…" : "Upload"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <div>
                                <div className="font-semibold">Edit Template Metadata</div>
                                <div className="text-xs text-gray-500 font-mono">{editModal.doc?.doc_code}</div>
                            </div>
                            <button
                                type="button"
                                className="rounded-lg p-2 hover:bg-gray-100"
                                onClick={closeEdit}
                                aria-label="Close"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="grid gap-4 p-4 md:grid-cols-2">
                            <div className="md:col-span-2">
                                <label className="text-xs font-medium text-gray-600">Title</label>
                                <input
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Document title…"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-600">Record No Prefix</label>
                                <input
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-black/10"
                                    value={editRecordPrefix}
                                    onChange={(e) => setEditRecordPrefix(e.target.value)}
                                    placeholder="REK/LAB-BM/…/"
                                />
                                <div className="mt-1 text-[11px] text-gray-500">
                                    Output: prefix + <span className="font-mono">DDMMYY</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-medium text-gray-600">Form Code Prefix</label>
                                <input
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-black/10"
                                    value={editFormPrefix}
                                    onChange={(e) => setEditFormPrefix(e.target.value)}
                                    placeholder="FORM/LAB-BM/…RevXX."
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
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                                    value={editRevisionNo}
                                    onChange={(e) => setEditRevisionNo(Number(e.target.value))}
                                />
                                <div className="mt-1 text-[11px] text-gray-500">
                                    Ditampilkan sebagai <span className="font-mono">RevXX</span> (pad 2).
                                </div>
                            </div>

                            <div className="flex items-end">
                                <label className="inline-flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={editIsActive}
                                        onChange={(e) => setEditIsActive(e.target.checked)}
                                    />
                                    Active
                                </label>
                            </div>
                        </div>

                        <div className="flex items-center justify-between border-t px-4 py-3">
                            <div className="text-xs text-gray-500">
                                Tips: kalau prefix form kamu sudah mengandung <span className="font-mono">RevXX</span>, pastikan konsisten sama revision_no.
                            </div>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                                    onClick={closeEdit}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className={cx(
                                        "rounded-lg px-3 py-2 text-sm text-white bg-black hover:bg-black/90",
                                        saving && "opacity-70 cursor-not-allowed"
                                    )}
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

            <div className="text-xs text-gray-500">
                <span className="mr-2">Quick access:</span>
                <Link className="underline" to="/reports">
                    Reports
                </Link>
                <span className="mx-2">·</span>
                <span className="font-mono">/api/v1/document-templates</span>
            </div>
        </div>
    );
}
