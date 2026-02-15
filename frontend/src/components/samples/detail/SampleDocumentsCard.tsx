import { Eye, Download, FileText } from "lucide-react";

type Props = {
    docs: any[];
    loading: boolean;
    error: string | null;
};

// local UI helpers (no external ./ui import)
function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function isBlank(v: any) {
    return v === null || v === undefined || String(v).trim() === "";
}

function normalizeLabel(input?: string | null) {
    const s = String(input ?? "").trim();
    if (!s) return "-";
    if (s.includes("-") && /[A-Za-z]/.test(s) && /\d/.test(s)) return s; // keep codes like BML-034

    return s
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

function buildPreviewUrl(d: any): string | null {
    const fid = Number(d?.pdf_file_id ?? 0);
    if (fid > 0) return `/api/v1/files/${fid}`;
    const url = d?.download_url ?? null;
    return url ? String(url) : null;
}

function buildDownloadUrl(d: any): string | null {
    const fid = Number(d?.pdf_file_id ?? 0);
    if (fid > 0) return `/api/v1/files/${fid}?download=1`;
    const url = d?.download_url ?? null;
    return url ? String(url) : null;
}

export function SampleDocumentsCard({ docs, loading, error }: Props) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-bold text-gray-900">Documents</div>
                    <div className="text-xs text-gray-500 mt-0.5">Preview & download dokumen terkait sampel</div>
                </div>
                <div className="text-xs text-gray-500">{loading ? "Loading…" : `${docs.length} item(s)`}</div>
            </div>

            <div className="px-5 py-4">
                {error ? (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3">
                        {error}
                    </div>
                ) : null}

                {loading ? (
                    <div className="text-sm text-gray-600">Loading…</div>
                ) : docs.length === 0 ? (
                    <div className="text-sm text-gray-600">No documents.</div>
                ) : (
                    <div className="space-y-2">
                        {docs.map((d, idx) => {
                            const name = normalizeLabel(d?.document_name ?? d?.type ?? "Document");

                            const recordNo = !isBlank(d?.record_no)
                                ? String(d.record_no)
                                : !isBlank(d?.number)
                                    ? String(d.number)
                                    : !isBlank(d?.document_code)
                                        ? String(d.document_code)
                                        : "-";

                            const formCode = !isBlank(d?.form_code) ? String(d.form_code) : null;

                            const status = normalizeLabel(String(d?.status ?? "-"));
                            const previewUrl = buildPreviewUrl(d);
                            const downloadUrl = buildDownloadUrl(d);

                            return (
                                <div
                                    key={`${d?.type ?? "doc"}-${d?.id ?? idx}`}
                                    className="rounded-xl border border-gray-100 px-3 py-2 flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>

                                        <div className="text-xs text-gray-600 mt-0.5 truncate">
                                            <span className="font-medium">{recordNo}</span>
                                            {formCode ? <span className="text-gray-400"> • </span> : null}
                                            {formCode ? <span>{formCode}</span> : null}
                                            <span className="text-gray-400"> • </span>
                                            <span>{status}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        {previewUrl ? (
                                            <button
                                                type="button"
                                                className={cx("lims-icon-button")}
                                                onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                                                aria-label="Preview document"
                                                title="Preview"
                                            >
                                                <Eye size={16} />
                                            </button>
                                        ) : (
                                            <span className="text-xs text-gray-400 whitespace-nowrap">—</span>
                                        )}

                                        {downloadUrl ? (
                                            <button
                                                type="button"
                                                className={cx("lims-icon-button")}
                                                onClick={() => window.open(downloadUrl, "_blank", "noopener,noreferrer")}
                                                aria-label="Download document"
                                                title="Download"
                                            >
                                                <Download size={16} />
                                            </button>
                                        ) : previewUrl ? (
                                            // fallback: kalau cuma ada preview (legacy), tetap kasih tombol "open"
                                            <button
                                                type="button"
                                                className={cx("lims-icon-button")}
                                                onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
                                                aria-label="Open document"
                                                title="Open"
                                            >
                                                <FileText size={16} />
                                            </button>
                                        ) : (
                                            <span className="text-xs text-gray-400 whitespace-nowrap">—</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
