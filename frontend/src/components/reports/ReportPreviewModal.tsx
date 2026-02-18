import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, FileText, AlertTriangle } from "lucide-react";
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
    title,
}) => {
    const { t } = useTranslation();

    const dialogTitle = title ?? t("reports.pdfPreviewTitle");

    const requestUrl = useMemo(() => {
        if (pdfUrl) return pdfUrl; // storage/static
        if (reportId) return `/v1/reports/${reportId}/pdf`; // API endpoint
        return null;
    }, [pdfUrl, reportId]);

    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [directUrl, setDirectUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

            // CASE 1: storage/static → iframe langsung
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
                const msg = e?.response?.data?.message ?? e?.message ?? t("reports.failedToLoadPdf");
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className="bg-white w-[92vw] h-[92vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-black/10">
                <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-white border border-gray-200">
                            <FileText size={18} />
                        </div>
                        <h2 className="text-sm font-bold text-gray-900 truncate">{dialogTitle}</h2>
                    </div>

                    <button
                        onClick={onClose}
                        className={cx("lims-icon-button", loading && "opacity-60 cursor-not-allowed")}
                        aria-label={t("close")}
                        title={t("close")}
                        type="button"
                        disabled={loading}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="flex-1 bg-gray-100">
                    {loading ? (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">
                            {t("reports.loadingPdf")}
                        </div>
                    ) : error ? (
                        <div className="w-full h-full flex items-center justify-center p-6">
                            <div className="max-w-2xl w-full">
                                <div className="flex items-center justify-center gap-2 text-sm font-semibold text-red-700 mb-3">
                                    <AlertTriangle size={18} />
                                    {t("reports.failedPreview")}
                                </div>

                                <pre className="text-xs bg-white border rounded-xl p-3 overflow-auto max-h-[50vh] text-left">
                                    {error}
                                </pre>
                            </div>
                        </div>
                    ) : blobUrl ? (
                        <iframe title={dialogTitle} src={blobUrl} className="w-full h-full border-0" />
                    ) : directUrl ? (
                        <iframe title={dialogTitle} src={directUrl} className="w-full h-full border-0" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-600">
                            {t("reports.noPdf")}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}
