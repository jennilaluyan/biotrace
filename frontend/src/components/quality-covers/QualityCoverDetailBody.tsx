import { useMemo, useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { apiGetAnyBlob } from "../../services/api";
import type { QualityCoverInboxItem } from "../../services/qualityCovers";
import { formatDateTimeLocal } from "../../utils/date";

type Props = {
    data: QualityCoverInboxItem;
    stepLabel?: string;
};

type NormalizedFile = {
    file_id: number;
    name: string;
    mime_type?: string | null;
    size_bytes?: number | null;
    created_at?: string | null;
};

function fmtBytes(n?: number | null) {
    if (!n || !Number.isFinite(n)) return "—";
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
}

function normalizeSupportingFiles(qc: any): NormalizedFile[] {
    const raw =
        qc?.supporting_files ??
        qc?.supportingFiles ??
        qc?.supporting_documents ??
        qc?.supportingDocuments ??
        [];

    if (!Array.isArray(raw)) return [];

    return raw
        .map((x: any) => {
            const fileId = Number(x?.file_id ?? x?.fileId ?? x?.file?.file_id ?? x?.file?.id ?? 0);
            if (!fileId) return null;

            const name =
                String(
                    x?.original_name ??
                    x?.name ??
                    x?.filename ??
                    x?.file?.original_name ??
                    x?.file?.name ??
                    x?.file?.filename ??
                    ""
                ).trim() || `File #${fileId}`;

            const size =
                x?.size_bytes ??
                x?.sizeBytes ??
                x?.file?.size_bytes ??
                x?.file?.sizeBytes ??
                null;

            const mime = x?.mime_type ?? x?.mimeType ?? x?.file?.mime_type ?? x?.file?.mimeType ?? null;

            const created = x?.created_at ?? x?.createdAt ?? x?.file?.created_at ?? x?.file?.createdAt ?? null;

            return {
                file_id: fileId,
                name,
                size_bytes: typeof size === "number" ? size : Number(size) || null,
                mime_type: mime ? String(mime) : null,
                created_at: created ? String(created) : null,
            } as NormalizedFile;
        })
        .filter(Boolean) as NormalizedFile[];
}

function detectQcGroup(workflowGroupRaw: string): "pcr" | "sequencing" | "rapid" | "microbiology" | "other" {
    const g = String(workflowGroupRaw ?? "").trim().toLowerCase();
    if (!g) return "other";

    if (g.includes("pcr")) return "pcr";
    if (g.includes("sequencing") || g.includes("wgs")) return "sequencing";
    if (g.includes("rapid") || g.includes("antigen")) return "rapid";
    if (g.includes("microbiology") || g.includes("group_19_22") || g.includes("group_23_32")) return "microbiology";

    return "other";
}

function isPreviewableMime(mime?: string | null) {
    const m = String(mime ?? "").toLowerCase();
    if (!m) return false;
    if (m.startsWith("image/")) return true;
    if (m === "application/pdf") return true;
    if (m.startsWith("text/")) return true;
    return false;
}

function startDownloadFromBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openPreviewFromBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
        // Popup blocked -> leave it as a download fallback by returning false
        URL.revokeObjectURL(url);
        return false;
    }

    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
}

export function QualityCoverDetailBody({ data, stepLabel }: Props) {
    const { t } = useTranslation();
    const ts = (key: string, options?: any) => String(t(key, options));

    const sampleCode = data?.sample?.lab_sample_code ?? `#${data.sample_id}`;
    const workflowGroupRaw = String(data?.sample?.workflow_group ?? data?.workflow_group ?? "");
    const clientName = data?.sample?.client?.name ?? "-";

    const qcGroup = useMemo(() => detectQcGroup(workflowGroupRaw), [workflowGroupRaw]);
    const qcPayload = (data as any)?.qc_payload ?? null;

    const supportingDriveUrl =
        String((data as any)?.supporting_drive_url ?? (data as any)?.supportingDriveUrl ?? "").trim() || "";
    const supportingNotes =
        String((data as any)?.supporting_notes ?? (data as any)?.supportingNotes ?? "").trim() || "";

    const supportingFiles = useMemo(() => normalizeSupportingFiles(data), [data]);

    const resultsTitle = useMemo(() => {
        if (qcGroup === "pcr") return ts("qualityCover.detail.sections.results", { defaultValue: "Results (PCR)" });
        if (qcGroup === "sequencing")
            return ts("qualityCover.detail.sections.results", { defaultValue: "Results (Sequencing)" });
        if (qcGroup === "rapid") return ts("qualityCover.detail.sections.results", { defaultValue: "Results (Rapid)" });
        if (qcGroup === "microbiology")
            return ts("qualityCover.detail.sections.results", { defaultValue: "Results (Microbiology)" });
        return ts("qualityCover.detail.sections.results", { defaultValue: "Results" });
    }, [qcGroup, ts]);

    const [fileBusyId, setFileBusyId] = useState<number | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);

    async function openFile(fileId: number, mimeHint?: string | null) {
        setFileBusyId(fileId);
        setFileError(null);

        try {
            const { blob, filename, contentType } = await apiGetAnyBlob(`/v1/files/${fileId}`);
            const mime = String(contentType || blob.type || mimeHint || "").toLowerCase();

            if (isPreviewableMime(mime)) {
                const opened = openPreviewFromBlob(blob);
                if (!opened) {
                    startDownloadFromBlob(blob, filename || `file-${fileId}`);
                }
            } else {
                startDownloadFromBlob(blob, filename || `file-${fileId}`);
            }
        } catch (e: any) {
            setFileError(e?.message || ts("qualityCover.detail.supporting.failed", { defaultValue: "Failed to open file." }));
        } finally {
            setFileBusyId(null);
        }
    }

    async function downloadFile(fileId: number) {
        setFileBusyId(fileId);
        setFileError(null);

        try {
            const { blob, filename } = await apiGetAnyBlob(`/v1/files/${fileId}?download=1`);
            startDownloadFromBlob(blob, filename || `file-${fileId}`);
        } catch (e: any) {
            setFileError(
                e?.message || ts("qualityCover.detail.supporting.failedDownload", { defaultValue: "Failed to download file." })
            );
        } finally {
            setFileBusyId(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <div className="text-sm text-gray-500">{t("qualityCover.detail.meta.sample")}</div>
                        <div className="text-lg font-semibold text-gray-900">{sampleCode}</div>
                        <div className="text-sm text-gray-600">
                            {t("qualityCover.detail.meta.client")}: {clientName} • {t("qualityCover.detail.meta.group")}:{" "}
                            {workflowGroupRaw || "-"}
                        </div>
                        {stepLabel ? <div className="text-[11px] text-gray-500 mt-1">{stepLabel}</div> : null}
                    </div>

                    <div className="text-right">
                        <div className="text-sm text-gray-500">{t("qualityCover.detail.meta.status")}</div>
                        <div className="font-medium text-gray-900">{data.status}</div>
                        <div className="text-xs text-gray-600">
                            {t("qualityCover.detail.meta.submitted")}:{" "}
                            {data.submitted_at ? formatDateTimeLocal(data.submitted_at) : "-"}
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                    <div>
                        <div className="text-xs text-gray-500">{t("qualityCover.detail.fields.dateOfAnalysis")}</div>
                        <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                            {data.date_of_analysis ? formatDateTimeLocal(data.date_of_analysis) : "-"}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">{t("qualityCover.detail.fields.checkedBy")}</div>
                        <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                            {data.checked_by?.name ?? data.checked_by_staff_id ?? "-"}
                        </div>
                    </div>
                </div>

                <div>
                    <div className="text-xs text-gray-500">{t("qualityCover.detail.fields.methodOfAnalysis")}</div>
                    <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">{data.method_of_analysis ?? "-"}</div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                    <div>
                        <div className="text-xs text-gray-500">
                            {ts("qualityCover.section.supporting.driveUrl", { defaultValue: "Google Drive link (optional)" })}
                        </div>

                        {supportingDriveUrl ? (
                            <a
                                href={supportingDriveUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline break-all"
                                title={supportingDriveUrl}
                            >
                                <ExternalLink size={16} />
                                {supportingDriveUrl}
                            </a>
                        ) : (
                            <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm mt-1">-</div>
                        )}
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">
                            {ts("qualityCover.section.supporting.notes", { defaultValue: "Other notes (optional)" })}
                        </div>
                        <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm mt-1 whitespace-pre-wrap">
                            {supportingNotes || "-"}
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="text-sm font-bold text-gray-900">{resultsTitle}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        {ts("qualityCover.detail.sections.resultsHint", { defaultValue: "Analyst measurement output." })}
                    </div>
                </div>

                <div className="p-4">
                    {qcGroup === "pcr" ? (
                        <div className="overflow-x-auto">
                            <table className="min-w-[720px] w-full text-sm">
                                <thead className="text-gray-600 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left font-semibold px-3 py-2">Marker</th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            {ts("qualityCover.detail.pcr.value", { defaultValue: "Value" })}
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            {ts("qualityCover.detail.pcr.result", { defaultValue: "Result" })}
                                        </th>
                                        <th className="text-left font-semibold px-3 py-2">
                                            {ts("qualityCover.detail.pcr.interpretation", { defaultValue: "Interpretation" })}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {["ORF1b", "RdRp", "RPP30"].map((k) => {
                                        const row = qcPayload?.[k] ?? {};
                                        return (
                                            <tr key={k} className="align-top">
                                                <td className="px-3 py-2 font-semibold text-gray-900">{k}</td>
                                                <td className="px-3 py-2">{row?.value ?? "—"}</td>
                                                <td className="px-3 py-2">{row?.result ?? "—"}</td>
                                                <td className="px-3 py-2">{row?.interpretation ?? "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : qcGroup === "sequencing" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                <div className="text-xs text-gray-500">
                                    {ts("qualityCover.detail.wgs.lineage", { defaultValue: "Lineage" })}
                                </div>
                                <div className="font-semibold text-gray-900 mt-0.5">{qcPayload?.lineage ?? "—"}</div>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                <div className="text-xs text-gray-500">
                                    {ts("qualityCover.detail.wgs.variant", { defaultValue: "Variant" })}
                                </div>
                                <div className="font-semibold text-gray-900 mt-0.5">{qcPayload?.variant ?? "—"}</div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {String(qcPayload?.notes ?? "").trim() ? (
                                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm whitespace-pre-wrap">
                                    {qcPayload?.notes}
                                </div>
                            ) : qcPayload ? (
                                <pre className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs overflow-auto">
                                    {JSON.stringify(qcPayload, null, 2)}
                                </pre>
                            ) : (
                                <div className="text-sm text-gray-600">—</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="text-sm font-bold text-gray-900">
                        {ts("qualityCover.detail.sections.supporting", { defaultValue: "Supporting documents" })}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        {ts("qualityCover.detail.sections.supportingHint", { defaultValue: "Files uploaded by the analyst (if any)." })}
                    </div>
                </div>

                <div className="p-4 space-y-3">
                    {fileError ? (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                            {fileError}
                        </div>
                    ) : null}

                    {supportingFiles.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                            {ts("qualityCover.detail.supporting.noFiles", { defaultValue: "No supporting files uploaded." })}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {supportingFiles.map((f) => {
                                const busy = fileBusyId === f.file_id;

                                return (
                                    <div
                                        key={f.file_id}
                                        className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3 py-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-semibold text-gray-900 truncate">{f.name}</div>
                                            <div className="text-[11px] text-gray-500 mt-1">
                                                {fmtBytes(f.size_bytes)} {f.mime_type ? `• ${f.mime_type}` : ""}
                                            </div>
                                        </div>

                                        <div className="shrink-0 flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="lims-icon-button"
                                                onClick={() => void openFile(f.file_id, f.mime_type)}
                                                aria-label={ts("qualityCover.detail.supporting.open", { defaultValue: "Open" })}
                                                title={ts("qualityCover.detail.supporting.open", { defaultValue: "Open" })}
                                                disabled={!!fileBusyId}
                                            >
                                                {busy ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                                            </button>

                                            <button
                                                type="button"
                                                className="lims-icon-button"
                                                onClick={() => void downloadFile(f.file_id)}
                                                aria-label={ts("qualityCover.detail.supporting.download", { defaultValue: "Download" })}
                                                title={ts("qualityCover.detail.supporting.download", { defaultValue: "Download" })}
                                                disabled={!!fileBusyId}
                                            >
                                                <Download size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}