// L:\Campus\Final Countdown\biotrace\frontend\src\components\reports\ReportPreviewModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Loader2 } from "lucide-react";
import { http } from "../../services/api";

type Props = {
    open: boolean;
    onClose: () => void;

    reportId?: number | null;
    pdfUrl?: string | null;
    title?: string;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

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
    title,
}) => {
    const { t } = useTranslation();

    const dialogTitle = title ?? t(["reports.pdfPreviewTitle", "reports.previewTitle"], "PDF Preview");

    const requestUrl = useMemo(() => {
        if (pdfUrl) return pdfUrl; // storage/static
        if (reportId) return `/v1/reports/${reportId}/pdf`; // API endpoint
        return null;
    }, [pdfUrl, reportId]);

    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [directUrl, setDirectUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Escape to close (keep the “new” behavior, but fits old design)
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!loading) onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, loading, onClose]);

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

            // CASE 1: storage/static → iframe directly
            if (path.startsWith("/storage/")) {
                setDirectUrl(path);
                return;
            }

            // CASE 2: API endpoint → axios blob
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
                const msg =
                    e?.response?.data?.message ??
                    e?.message ??
                    t("reports.failedToLoadPdf", "Failed to load PDF.");
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
    }, [open, requestUrl, t]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            onClick={!loading ? onClose : undefined}
        >
            <div
                className={cx(
                    "bg-white w-[90vw] h-[90vh] rounded-xl shadow-lg flex flex-col overflow-hidden",
                    "animate-in fade-in zoom-in-95 duration-150"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="text-sm font-semibold text-gray-800 truncate">{dialogTitle}</h2>

                    <button
                        onClick={onClose}
                        className={cx(
                            "text-gray-500 hover:text-gray-700",
                            loading && "opacity-50 cursor-not-allowed"
                        )}
                        aria-label={t(["close", "common.close"], "Close")}
                        title={t(["close", "common.close"], "Close")}
                        type="button"
                        disabled={loading}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 bg-gray-100 relative">
                    {loading ? (
                        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-sm text-gray-600 gap-2">
                            {/* “old design”, but with nicer spinner + color tweak */}
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <div>{t("reports.loadingPdf", "Loading PDF…")}</div>
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center p-6">
                            <div className="max-w-xl w-full text-center">
                                <div className="text-sm font-semibold text-red-700 mb-2">
                                    {t("reports.failedPreview", "Failed to preview PDF")}
                                </div>
                                <pre className="text-xs bg-white border rounded-lg p-3 overflow-auto max-h-[40vh] text-left whitespace-pre-wrap break-words">
                                    {error}
                                </pre>
                                <button
                                    type="button"
                                    className="mt-4 lims-icon-button"
                                    onClick={onClose}
                                >
                                    {t(["close", "common.close"], "Close")}
                                </button>
                            </div>
                        </div>
                    ) : blobUrl ? (
                        <iframe title={dialogTitle} src={blobUrl} className="w-full h-full border-0" />
                    ) : directUrl ? (
                        <iframe title={dialogTitle} src={directUrl} className="w-full h-full border-0" />
                    ) : (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center text-sm text-gray-600">
                            {t("reports.noPdf", "No PDF to preview.")}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
