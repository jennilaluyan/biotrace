import React, { useEffect, useMemo, useState } from "react";
import { http } from "../../services/api";

type Props = {
    open: boolean;
    onClose: () => void;

    reportId?: number | null;
    pdfUrl?: string | null;
    title?: string;
};

function normalizeToSameOriginPath(input: string): string {
    let s = String(input || "").trim();
    if (!s) return s;

    if (/^https?:\/\//i.test(s)) {
        try {
            const u = new URL(s);
            s = (u.pathname || "") + (u.search || "");
        } catch {
            return s;
        }
    }

    s = s.replace(/\/{2,}/g, "/");
    if (!s.startsWith("/")) s = `/${s}`;
    return s;
}

export const ReportPreviewModal: React.FC<Props> = ({
    open,
    onClose,
    reportId = null,
    pdfUrl = null,
    title = "PDF Preview",
}) => {
    const requestUrl = useMemo(() => {
        if (pdfUrl) return pdfUrl;               // storage/static
        if (reportId) return `/v1/reports/${reportId}/pdf`; // API endpoint
        return null;
    }, [pdfUrl, reportId]);

    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [directUrl, setDirectUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (!open || !requestUrl) {
                setBlobUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                });
                setDirectUrl(null);
                setError(null);
                setLoading(false);
                return;
            }

            setError(null);
            setBlobUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
            setDirectUrl(null);

            const path = normalizeToSameOriginPath(requestUrl);

            // ✅ CASE 1: storage/static → jangan axios → iframe langsung
            if (path.startsWith("/storage/")) {
                setDirectUrl(path);
                return;
            }

            // ✅ CASE 2: API endpoint → axios blob
            try {
                setLoading(true);

                const res = await http.request({
                    method: "GET",
                    url: path,
                    baseURL: window.location.origin,
                    responseType: "blob",
                    withCredentials: true,
                });

                if (cancelled) return;

                const blob = res.data as Blob;
                const ct = String((res.headers as any)?.["content-type"] ?? "").toLowerCase();

                if (!ct.includes("application/pdf")) {
                    const text = await blob.text();
                    throw new Error(text || "Server returned non-PDF response.");
                }

                const url = URL.createObjectURL(blob);
                setBlobUrl(url);
            } catch (e: any) {
                if (cancelled) return;
                const msg = e?.response?.data?.message ?? e?.message ?? "Failed to load PDF.";
                setError(String(msg));
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
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700"
                        aria-label="Close preview"
                        type="button"
                    >
                        ✕
                    </button>
                </div>

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
                    ) : directUrl ? (
                        <iframe title={title} src={directUrl} className="w-full h-full border-0" />
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
