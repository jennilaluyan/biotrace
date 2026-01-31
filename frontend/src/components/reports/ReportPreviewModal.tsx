import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../services/api";

type Props = {
    open: boolean;
    onClose: () => void;

    // Backward compatible for COA report preview
    reportId?: number | null;

    // Generic PDF URL (LOO, future documents)
    pdfUrl?: string | null;

    title?: string;
};

/**
 * Convert absolute URL to relative path to avoid CORS,
 * and normalize /api vs /v1 based on axios baseURL.
 */
function normalizeRequestPath(requestUrl: string): string {
    let path = String(requestUrl || "").trim();
    if (!path) return path;

    // Absolute -> strip origin
    try {
        if (/^https?:\/\//i.test(path)) {
            const u = new URL(path);
            path = (u.pathname || "/") + (u.search || "");
        }
    } catch {
        // ignore
    }

    // Ensure starts with /
    if (!path.startsWith("/")) path = "/" + path;

    // If backend gives something like ".../api/..." inside the string, keep from /api
    const apiIdx = path.indexOf("/api/");
    if (apiIdx > 0) path = path.slice(apiIdx);

    const v1Idx = path.indexOf("/v1/");
    if (v1Idx > 0 && apiIdx < 0) path = path.slice(v1Idx);

    // Now map /api vs /v1 depending on http.defaults.baseURL
    const base = String(http.defaults.baseURL ?? "").replace(/\/+$/, "");
    const baseHasApi = /\/api$/i.test(base);

    // If baseURL already ends with /api, we should NOT send /api/... again
    if (baseHasApi && path.startsWith("/api/")) {
        path = path.replace(/^\/api/, "");
    }

    // If baseURL does NOT include /api but path starts with /v1, prefix /api
    // (this matches your previous logic; keep it for safety)
    if (!baseHasApi && path.startsWith("/v1/")) {
        path = "/api" + path;
    }

    return path;
}

async function blobToUsefulError(blob: Blob): Promise<string> {
    try {
        const text = await blob.text();
        if (!text) return "Request failed (empty error).";
        try {
            const json = JSON.parse(text);
            // common API error shapes
            return (
                json?.message ??
                json?.error ??
                json?.msg ??
                text
            );
        } catch {
            return text;
        }
    } catch {
        return "Request failed (unreadable error).";
    }
}

export const ReportPreviewModal: React.FC<Props> = ({
    open,
    onClose,
    reportId = null,
    pdfUrl = null,
    title = "PDF Preview",
}) => {
    const requestUrl = useMemo(() => {
        if (pdfUrl) return pdfUrl;
        if (reportId) return `/v1/reports/${reportId}/pdf`;
        return null;
    }, [pdfUrl, reportId]);

    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!open || !requestUrl) {
                setLoading(false);
                setError(null);
                setBlobUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                });
                return;
            }

            setLoading(true);
            setError(null);

            // cleanup previous blob
            setBlobUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });

            try {
                const path = normalizeRequestPath(requestUrl);

                const res = await http.get(path, { responseType: "blob" });

                if (cancelled) return;

                const blob = res.data as Blob;
                const ct = String(res.headers?.["content-type"] ?? "").toLowerCase();

                // If server returns JSON (error), show it
                if (ct.includes("application/json")) {
                    const msg = await blobToUsefulError(blob);
                    throw new Error(msg || "Server returned JSON, not a PDF.");
                }

                const url = URL.createObjectURL(blob);
                setBlobUrl(url);
            } catch (e: any) {
                if (cancelled) return;

                // axios error shape:
                // - e.response.data may be a Blob (because responseType=blob)
                const respData = e?.response?.data;
                if (respData instanceof Blob) {
                    const msg = await blobToUsefulError(respData);
                    setError(String(msg));
                } else {
                    const msg =
                        e?.response?.data?.message ??
                        e?.message ??
                        "Failed to load PDF.";
                    setError(String(msg));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
            setBlobUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
        };
    }, [open, requestUrl]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white w-[90vw] h-[90vh] rounded-xl shadow-lg flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="text-sm font-semibold text-gray-800">{title}</h2>

                    <div className="flex items-center gap-2">
                        {blobUrl ? (
                            <a
                                href={blobUrl}
                                download
                                className="lims-btn"
                                onClick={(e) => {
                                    // ensure click doesn't close modal by accident
                                    e.stopPropagation();
                                }}
                            >
                                Download
                            </a>
                        ) : null}

                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700"
                            aria-label="Close preview"
                            type="button"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 bg-gray-100">
                    {loading ? (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">
                            Loading PDF...
                        </div>
                    ) : error ? (
                        <div className="w-full h-full flex items-center justify-center p-6">
                            <div className="max-w-xl text-center">
                                <div className="text-sm font-semibold text-red-700 mb-2">
                                    Failed to preview PDF
                                </div>
                                <pre className="text-xs bg-white border rounded-lg p-3 overflow-auto max-h-[40vh] text-left">
                                    {error}
                                </pre>
                            </div>
                        </div>
                    ) : blobUrl ? (
                        <iframe title={title} src={blobUrl} className="w-full h-full border-0" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">
                            No PDF to preview.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
