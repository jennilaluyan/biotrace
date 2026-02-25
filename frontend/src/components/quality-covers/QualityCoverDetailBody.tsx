import { useMemo } from "react";
import { Download, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { QualityCoverInboxItem } from "../../services/qualityCovers";
import { formatDateTimeLocal } from "../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

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

const RAW_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const API_VER =
    (import.meta.env.VITE_API_VER as string | undefined) ??
    (RAW_BASE === "/api" || RAW_BASE.endsWith("/api") ? "/v1" : "/api/v1");

function buildFileUrl(fileId: number, download?: boolean) {
    const qs = download ? "?download=1" : "";
    return `${RAW_BASE}${API_VER}/files/${fileId}${qs}`;
}

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

            const mime =
                x?.mime_type ?? x?.mimeType ?? x?.file?.mime_type ?? x?.file?.mimeType ?? null;

            const created =
                x?.created_at ?? x?.createdAt ?? x?.file?.created_at ?? x?.file?.createdAt ?? null;

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
        if (qcGroup === "sequencing") return ts("qualityCover.detail.sections.results", { defaultValue: "Results (Sequencing)" });
        if (qcGroup === "rapid") return ts("qualityCover.detail.sections.results", { defaultValue: "Results (Rapid)" });
        if (qcGroup === "microbiology") return ts("qualityCover.detail.sections.results", { defaultValue: "Results (Microbiology)" });
        return ts("qualityCover.detail.sections.results", { defaultValue: "Results" });
    }, [qcGroup, ts]);

    return (
        <div className="space-y-4">
            {/* Top card */}
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

            {/* Analyst fields */}
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
                    <div className="rounded-xl border border-gray-200 px-3 py-2 text-sm">
                        {data.method_of_analysis ?? "-"}
                    </div>
                </div>

                {/* Supporting Drive + Notes (optional) */}
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

            {/* Results */}
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
                                <div className="text-xs text-gray-500">{ts("qualityCover.detail.wgs.lineage", { defaultValue: "Lineage" })}</div>
                                <div className="font-semibold text-gray-900 mt-0.5">{qcPayload?.lineage ?? "—"}</div>
                            </div>
                            <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                                <div className="text-xs text-gray-500">{ts("qualityCover.detail.wgs.variant", { defaultValue: "Variant" })}</div>
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

            {/* Attachments */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="text-sm font-bold text-gray-900">
                        {ts("qualityCover.detail.sections.supporting", { defaultValue: "Supporting documents" })}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        {ts("qualityCover.detail.sections.supportingHint", { defaultValue: "Files uploaded by the analyst (if any)." })}
                    </div>
                </div>

                <div className="p-4">
                    {supportingFiles.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-600">
                            {ts("qualityCover.detail.supporting.noFiles", { defaultValue: "No supporting files uploaded." })}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {supportingFiles.map((f) => (
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
                                        <a
                                            className="lims-icon-button"
                                            href={buildFileUrl(f.file_id, false)}
                                            target="_blank"
                                            rel="noreferrer"
                                            aria-label={ts("qualityCover.detail.supporting.open", { defaultValue: "Open" })}
                                            title={ts("qualityCover.detail.supporting.open", { defaultValue: "Open" })}
                                        >
                                            <ExternalLink size={16} />
                                        </a>

                                        <a
                                            className="lims-icon-button"
                                            href={buildFileUrl(f.file_id, true)}
                                            aria-label={ts("qualityCover.detail.supporting.download", { defaultValue: "Download" })}
                                            title={ts("qualityCover.detail.supporting.download", { defaultValue: "Download" })}
                                        >
                                            <Download size={16} />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}