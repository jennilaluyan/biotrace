import { FileText } from "lucide-react";

type Props = {
    docs: any[];
    loading: boolean;
    error: string | null;
};

// local UI helpers (no external ./ui import)
function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
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

export function SampleDocumentsCard({ docs, loading, error }: Props) {
    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-bold text-gray-900">Documents</div>
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
                            const name = d?.document_name ?? d?.type ?? "Document";
                            const no = d?.number ?? d?.document_code ?? "-";
                            const status = d?.status ?? "-";
                            const url = d?.download_url ?? null;

                            return (
                                <div
                                    key={`${d?.type ?? "doc"}-${d?.id ?? idx}`}
                                    className="rounded-xl border px-3 py-2 flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
                                        <div className="text-xs text-gray-600 mt-0.5 truncate">
                                            {no} • {String(status ?? "-").toLowerCase().replace(/_/g, " ")}
                                        </div>
                                    </div>

                                    {url ? (
                                        <button
                                            type="button"
                                            className={cx("lims-icon-button")}
                                            onClick={() => window.open(String(url), "_blank", "noopener,noreferrer")}
                                            aria-label="Open document"
                                            title="Open"
                                        >
                                            <FileText size={16} />
                                        </button>
                                    ) : (
                                        <span className="text-xs text-gray-400 whitespace-nowrap">—</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
