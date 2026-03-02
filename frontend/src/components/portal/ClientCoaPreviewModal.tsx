import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, ExternalLink, Loader2, X } from "lucide-react";
import { apiGetAnyBlob } from "../../services/api";

type Props = {
    open: boolean;
    onClose: () => void;

    /** sample_id untuk endpoint client COA */
    sampleId?: number | null;

    /** optional: kalau mau pakai URL langsung (mis. /storage/... atau absolute https://...) */
    pdfUrl?: string | null;

    title?: string;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function normalizeToPathIfPossible(input: string): { kind: "absolute" | "path"; value: string } {
    let s = String(input || "").trim();
    if (!s) return { kind: "path", value: "" };

    // absolute URL -> keep absolute (we will iframe directly)
    if (/^https?:\/\//i.test(s)) {
        return { kind: "absolute", value: s };
    }

    // normalize path
    s = s.replace(/\/{2,}/g, "/");
    if (!s.startsWith("/")) s = `/${s}`;
    return { kind: "path", value: s };
}

function inferWarnByStatus(status?: number | null) {
    // For preview: many "expected" conditions should be warn, not crash.
    return status === 404 || status === 403 || status === 422;
}

function extractErrMessage(e: any, fallback: string) {
    // our api wrapper throws: { status, data, message }
    const msg =
        e?.message ??
        e?.data?.message ??
        e?.data?.error ??
        (typeof e?.data === "string" ? e.data : null) ??
        e?.response?.data?.message ??
        e?.response?.data?.error ??
        e?.response?.statusText ??
        fallback;

    return String(msg);
}

export const ClientCoaPreviewModal: React.FC<Props> = ({
    open,
    onClose,
    sampleId = null,
    pdfUrl = null,
    title,
}) => {
    const { t } = useTranslation();

    const dialogTitle =
        title ?? t(["portal.coa.previewTitle", "reports.pdfPreviewTitle", "reports.previewTitle"], "COA Preview");

    const requestUrl = useMemo(() => {
        if (pdfUrl) return String(pdfUrl);
        if (sampleId) return `/v1/client/samples/${sampleId}/coa`;
        return null;
    }, [pdfUrl, sampleId]);

    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [directUrl, setDirectUrl] = useState<string | null>(null);
    const [suggestedFilename, setSuggestedFilename] = useState<string | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorKind, setErrorKind] = useState<"error" | "warn">("error");

    const cleanupBlobUrl = () => {
        setBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
        });
    };

    // Escape to close
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
                cleanupBlobUrl();
                setDirectUrl(null);
                setSuggestedFilename(null);
                setError(null);
                setErrorKind("error");
                setLoading(false);
                return;
            }

            setError(null);
            setErrorKind("error");
            cleanupBlobUrl();
            setDirectUrl(null);
            setSuggestedFilename(null);

            const norm = normalizeToPathIfPossible(requestUrl);

            // CASE 1: absolute URL -> iframe directly
            if (norm.kind === "absolute") {
                setDirectUrl(norm.value);
                setLoading(false);
                return;
            }

            const path = norm.value;

            // CASE 2: storage/static -> iframe directly
            if (path.startsWith("/storage/")) {
                setDirectUrl(path);
                setLoading(false);
                return;
            }

            // CASE 3: API endpoint -> fetch blob via api wrapper
            try {
                setLoading(true);

                const res = await apiGetAnyBlob(path);
                if (cancelled) return;

                const blob = res.blob;
                const ct = String(res.contentType ?? (blob as any)?.type ?? "").toLowerCase();

                if (!ct.includes("application/pdf")) {
                    // server sent JSON/text in blob (error)
                    const text = await blob.text();
                    throw new Error(text || "Server returned non-PDF response.");
                }

                const url = URL.createObjectURL(blob);
                setBlobUrl(url);

                const fallbackName =
                    sampleId && Number.isFinite(sampleId)
                        ? `COA_${sampleId}.pdf`
                        : "COA.pdf";

                setSuggestedFilename(res.filename || fallbackName);
            } catch (e: any) {
                if (cancelled) return;

                const status = e?.status ?? e?.response?.status ?? null;

                let msg = extractErrMessage(e, t("reports.failedToLoadPdf", "Failed to load PDF."));
                let kind: "warn" | "error" = inferWarnByStatus(status) ? "warn" : "error";

                // Make the “not ready yet” case friendlier for client
                if (status === 404) {
                    kind = "warn";
                    msg =
                        t("portal.coa.notAvailableYet", "COA belum tersedia untuk di-preview/diunduh.") +
                        (msg ? `\n\nServer: ${msg}` : "");
                }

                setErrorKind(kind);
                setError(String(msg));
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();

        return () => {
            cancelled = true;
            cleanupBlobUrl();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, requestUrl, t]);

    const effectivePreviewUrl = blobUrl ?? directUrl;

    const handleOpenNewTab = () => {
        if (!effectivePreviewUrl) return;
        window.open(effectivePreviewUrl, "_blank", "noopener,noreferrer");
    };

    const handleDownload = () => {
        if (!effectivePreviewUrl) return;

        // If it's a blob URL, we can force download with <a download>
        if (blobUrl) {
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = suggestedFilename ?? "COA.pdf";
            document.body.appendChild(a);
            a.click();
            a.remove();
            return;
        }

        // For direct URL: best effort open (browser may download/preview depending headers)
        window.open(effectivePreviewUrl, "_blank", "noopener,noreferrer");
    };

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

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className={cx("lims-icon-button", (!effectivePreviewUrl || loading) && "opacity-50 cursor-not-allowed")}
                            onClick={handleOpenNewTab}
                            disabled={!effectivePreviewUrl || loading}
                            aria-label={t("open", "Open")}
                            title={t("open", "Open")}
                        >
                            <ExternalLink size={16} />
                        </button>

                        <button
                            type="button"
                            className={cx("lims-icon-button", (!effectivePreviewUrl || loading) && "opacity-50 cursor-not-allowed")}
                            onClick={handleDownload}
                            disabled={!effectivePreviewUrl || loading}
                            aria-label={t("portal.actions.downloadCoa", "Download COA")}
                            title={t("portal.actions.downloadCoa", "Download COA")}
                        >
                            <Download size={16} />
                        </button>

                        <button
                            onClick={onClose}
                            className={cx("text-gray-500 hover:text-gray-700", loading && "opacity-50 cursor-not-allowed")}
                            aria-label={t(["close", "common.close"], "Close")}
                            title={t(["close", "common.close"], "Close")}
                            type="button"
                            disabled={loading}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 bg-gray-100 relative">
                    {loading ? (
                        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-sm text-gray-600 gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <div>{t("reports.loadingPdf", "Loading PDF…")}</div>
                        </div>
                    ) : error ? (
                        <div className="absolute inset-0 w-full h-full flex items-center justify-center p-6">
                            <div className="max-w-xl w-full text-center">
                                <div
                                    className={cx(
                                        "text-sm font-semibold mb-2",
                                        errorKind === "warn" ? "text-amber-800" : "text-red-700"
                                    )}
                                >
                                    {errorKind === "warn"
                                        ? t("portal.coa.previewUnavailable", "COA belum tersedia")
                                        : t("reports.failedPreview", "Failed to preview PDF")}
                                </div>

                                <pre
                                    className={cx(
                                        "text-xs border rounded-lg p-3 overflow-auto max-h-[40vh] text-left whitespace-pre-wrap break-words",
                                        errorKind === "warn"
                                            ? "bg-amber-50 border-amber-200 text-amber-900"
                                            : "bg-white border-gray-200 text-gray-900"
                                    )}
                                >
                                    {error}
                                </pre>

                                <div className="mt-4 flex items-center justify-center gap-2">
                                    <button type="button" className="btn-outline" onClick={onClose}>
                                        {t(["close", "common.close"], "Close")}
                                    </button>
                                </div>
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

export default ClientCoaPreviewModal;