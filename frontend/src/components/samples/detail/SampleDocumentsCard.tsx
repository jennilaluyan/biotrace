import { Download, FileText } from "lucide-react";

type Props = {
    docs: any[];
    loading: boolean;
    error: string | null;
};

// local UI helpers (no external ./ui import)
function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function titleize(input?: string | null) {
    const s = String(input ?? "").trim();
    if (!s) return "-";
    if (s.includes("-") && /[A-Za-z]/.test(s) && /\d/.test(s)) return s; // keep codes like BML-034

    return s
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * ✅ Step 19: Rename COA labels + keep backward aliases.
 * We prefer backend `document_name`, but we also map legacy naming just in case.
 */
function normalizeDocName(d: any): string {
    const type = String(d?.type ?? "").toUpperCase();
    const rawName = String(d?.document_name ?? d?.name ?? "").trim();
    const number = String(d?.number ?? d?.document_code ?? "").toLowerCase();

    if (type !== "COA") return rawName ? titleize(rawName) : "Document";

    const s = rawName.toLowerCase();

    // WGS strongest signal
    if (s.includes("wgs") || number.includes("/adm/16/") || number.includes("wgs")) return "COA WGS";

    // Legacy: institution / kerja sama
    if (
        s.includes("institution") ||
        s.includes("institusi") ||
        s.includes("kerja sama") ||
        s.includes("kerjasama") ||
        s.includes("cooperation")
    ) {
        return "COA PCR Kerja Sama";
    }

    // Legacy: individual / mandiri
    if (s.includes("individual") || s.includes("mandiri")) return "COA PCR Mandiri";

    // Generic backend label "Certificate of Analysis (CoA)" => default PCR Mandiri (safe)
    return "COA PCR Mandiri";
}

function normalizeStatus(input?: string | null) {
    const s = String(input ?? "").trim();
    if (!s) return "-";
    return s.toLowerCase().replace(/_/g, " ");
}

function openUrl(url: string, download: boolean) {
    const raw = String(url || "").trim();
    if (!raw) return;

    // best-effort: ask backend to send attachment disposition
    const u = raw.includes("?") ? `${raw}&download=1` : `${raw}?download=1`;
    const target = download ? u : raw;

    window.open(target, "_blank", "noopener,noreferrer");
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
                            const name = normalizeDocName(d);

                            // ✅ Prefer new metadata when available
                            const recordNo = String(d?.record_no ?? "").trim();
                            const formCode = String(d?.form_code ?? "").trim();

                            // Fallbacks
                            const number = String(d?.number ?? d?.document_code ?? "-").trim();
                            const status = normalizeStatus(d?.status ?? null);
                            const url = d?.download_url ?? null;

                            const metaLine =
                                recordNo || formCode
                                    ? `${recordNo || "-"} • ${formCode || "-"}`
                                    : `${number} • ${status}`;

                            return (
                                <div
                                    key={`${d?.type ?? "doc"}-${d?.id ?? idx}`}
                                    className="rounded-xl border px-3 py-2 flex items-center justify-between gap-3"
                                >
                                    <div className="min-w-0">
                                        <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
                                        <div className="text-xs text-gray-600 mt-0.5 truncate">{metaLine}</div>
                                        {!recordNo && !formCode ? (
                                            <div className="text-[11px] text-gray-500 mt-0.5 truncate">{status}</div>
                                        ) : null}
                                    </div>

                                    {url ? (
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className={cx("lims-icon-button")}
                                                onClick={() => openUrl(String(url), false)}
                                                aria-label="Preview document"
                                                title="Preview"
                                            >
                                                <FileText size={16} />
                                            </button>

                                            <button
                                                type="button"
                                                className={cx("lims-icon-button")}
                                                onClick={() => openUrl(String(url), true)}
                                                aria-label="Download document"
                                                title="Download"
                                            >
                                                <Download size={16} />
                                            </button>
                                        </div>
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
