import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Save, Send, Loader2, Paperclip, Download, Trash2, UploadCloud } from "lucide-react";

import type { Sample } from "../../services/samples";
import {
    QualityCover,
    getQualityCover,
    saveQualityCoverDraft,
    submitQualityCover,
    uploadQualityCoverSupportingDocs,
    deleteQualityCoverSupportingDoc,
    type SupportingFile,
} from "../../services/qualityCovers";
import { apiGetAnyBlob } from "../../services/api";
import { formatDateTimeLocal } from "../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Props = {
    sample: Sample;
    checkedByName: string;
    disabled?: boolean;
    onAfterSave?: () => void;
};

function prettyErr(e: any, fallback: string) {
    return (
        e?.message ||
        e?.data?.message ||
        e?.data?.error ||
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        fallback
    );
}

function titleCaseWords(input: string) {
    return String(input ?? "")
        .replace(/_/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

type ValidationKey =
    | "notAllowed"
    | "alreadySubmitted"
    | "methodRequired"
    | "pcr.markerMissing"
    | "pcr.valueRequired"
    | "pcr.valueNumeric"
    | "pcr.resultRequired"
    | "pcr.interpretationRequired"
    | "wgs.lineageRequired"
    | "wgs.variantRequired"
    | "others.notesRequired";

type ValidationResult = { ok: true } | { ok: false; key: ValidationKey; ctx?: Record<string, any> };

function humanFileSize(bytes: number | null | undefined): string {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const kb = n / 1024;
    if (kb < 1024) return `${Math.ceil(kb)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
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

export function QualityCoverSection(props: Props) {
    const { t } = useTranslation();
    const ts = (key: string, options?: any) => String(t(key, options));

    const { sample, checkedByName, disabled, onAfterSave } = props;

    const sampleId = Number((sample as any)?.sample_id ?? 0);

    const workflowGroup = String((sample as any)?.workflow_group ?? "").toLowerCase();
    const qcGroup = useMemo(() => {
        if (workflowGroup.includes("pcr")) return "pcr";
        if (workflowGroup.includes("sequencing") || workflowGroup.includes("wgs")) return "wgs";
        return "others";
    }, [workflowGroup]);

    const requested = useMemo(() => {
        return (((sample as any)?.requested_parameters || (sample as any)?.requestedParameters || []) as any[]) ?? [];
    }, [sample]);

    const parameterId = useMemo(() => {
        return requested.length === 1 && requested?.[0]?.parameter_id ? Number(requested[0].parameter_id) : undefined;
    }, [requested]);

    const paramLabel = useMemo(() => {
        const s =
            requested
                .map((p: any) => p?.name)
                .filter(Boolean)
                .join(", ") || "—";
        return s;
    }, [requested]);

    const sampleCode = String((sample as any)?.lab_sample_code ?? "—");

    const [qcLoading, setQcLoading] = useState(false);
    const [qcSaving, setQcSaving] = useState(false);
    const [qcSubmitting, setQcSubmitting] = useState(false);
    const [qcError, setQcError] = useState<string | null>(null);

    const [cover, setCover] = useState<QualityCover | null>(null);

    const [methodOfAnalysis, setMethodOfAnalysis] = useState("");
    const [qcPayload, setQcPayload] = useState<any>({});

    const [supportingDriveUrl, setSupportingDriveUrl] = useState("");
    const [supportingNotes, setSupportingNotes] = useState("");

    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [uploadingFiles, setUploadingFiles] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const [fileBusyId, setFileBusyId] = useState<number | null>(null);

    function addPendingFiles(files: File[]) {
        const incoming = (files ?? []).filter(Boolean);
        if (incoming.length === 0) return;
        setPendingFiles((prev) => [...prev, ...incoming]);
    }

    useEffect(() => {
        if (!sampleId) return;

        let alive = true;

        (async () => {
            try {
                setQcLoading(true);
                setQcError(null);

                const c = await getQualityCover(sampleId);
                if (!alive) return;

                setCover(c);

                setMethodOfAnalysis(c?.method_of_analysis ? String(c.method_of_analysis) : "");
                setQcPayload(c?.qc_payload ?? {});

                setSupportingDriveUrl(String(c?.supporting_drive_url ?? ""));
                setSupportingNotes(String(c?.supporting_notes ?? ""));
            } catch (e: any) {
                if (!alive) return;
                setQcError(prettyErr(e, t("qualityCover.section.errors.loadFailed")));
                setCover(null);
            } finally {
                if (!alive) return;
                setQcLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [sampleId, t]);

    const statusText = useMemo(() => {
        const v = String(cover?.status ?? "draft").trim().toLowerCase();
        if (v === "submitted") return t("qualityCover.section.status.submitted");
        if (v === "draft") return t("qualityCover.section.status.draft");
        return titleCaseWords(v);
    }, [cover?.status, t]);

    const statusPillClass = useMemo(() => {
        return cover?.status === "submitted"
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-white border-gray-200 text-gray-700";
    }, [cover?.status]);

    const validate = useMemo<ValidationResult>(() => {
        if (disabled) return { ok: false, key: "notAllowed" };
        if (cover?.status === "submitted") return { ok: false, key: "alreadySubmitted" };
        if (!methodOfAnalysis.trim()) return { ok: false, key: "methodRequired" };

        if (qcGroup === "pcr") {
            const req = ["ORF1b", "RdRp", "RPP30"] as const;

            for (const k of req) {
                const obj = qcPayload?.[k];

                if (!obj) return { ok: false, key: "pcr.markerMissing", ctx: { marker: k } };

                if (obj.value === null || obj.value === undefined || obj.value === "")
                    return { ok: false, key: "pcr.valueRequired", ctx: { marker: k } };

                if (Number.isNaN(Number(obj.value)))
                    return { ok: false, key: "pcr.valueNumeric", ctx: { marker: k } };

                if (!String(obj.result ?? "").trim())
                    return { ok: false, key: "pcr.resultRequired", ctx: { marker: k } };

                if (!String(obj.interpretation ?? "").trim())
                    return { ok: false, key: "pcr.interpretationRequired", ctx: { marker: k } };
            }
        }

        if (qcGroup === "wgs") {
            if (!String(qcPayload?.lineage ?? "").trim()) return { ok: false, key: "wgs.lineageRequired" };
            if (!String(qcPayload?.variant ?? "").trim()) return { ok: false, key: "wgs.variantRequired" };
        }

        if (qcGroup === "others") {
            if (!String(qcPayload?.notes ?? "").trim()) return { ok: false, key: "others.notesRequired" };
        }

        return { ok: true };
    }, [disabled, cover?.status, methodOfAnalysis, qcPayload, qcGroup]);

    const submitDisabledReason = useMemo<string | null>(() => {
        if (validate.ok) return null;

        const ctx = validate.ctx ?? {};
        const msg = t(`qualityCover.section.validation.${validate.key}`, ctx as any);
        return typeof msg === "string" ? msg : String(msg);
    }, [validate, t]);

    const isLocked = !!disabled || cover?.status === "submitted";
    const isBusy = qcLoading || qcSaving || qcSubmitting || uploadingFiles;

    const nowLabel = useMemo(() => {
        try {
            return formatDateTimeLocal(new Date().toISOString());
        } catch {
            return new Date().toLocaleString();
        }
    }, []);

    const supportingFiles: SupportingFile[] = useMemo(() => {
        const arr = (cover as any)?.supporting_files;
        return Array.isArray(arr) ? (arr as SupportingFile[]) : [];
    }, [cover]);

    async function uploadPendingIfAny(qualityCoverId: number) {
        if (pendingFiles.length === 0) return;

        setUploadingFiles(true);
        setUploadError(null);

        try {
            const updated = await uploadQualityCoverSupportingDocs(qualityCoverId, pendingFiles);
            setCover(updated);
            setPendingFiles([]);
        } catch (e: any) {
            setUploadError(prettyErr(e, "Failed to upload supporting documents."));
            throw e;
        } finally {
            setUploadingFiles(false);
        }
    }

    async function downloadSupportingFile(fileId: number) {
        setFileBusyId(fileId);
        setUploadError(null);

        try {
            const { blob, filename } = await apiGetAnyBlob(`/v1/files/${fileId}?download=1`);
            startDownloadFromBlob(blob, filename || `file-${fileId}`);
        } catch (e: any) {
            setUploadError(prettyErr(e, "Failed to download file."));
        } finally {
            setFileBusyId(null);
        }
    }

    async function onSaveDraft() {
        if (!sampleId) return;
        if (disabled) return;

        setQcSaving(true);
        setQcError(null);

        try {
            const c = await saveQualityCoverDraft(sampleId, {
                parameter_id: parameterId ?? null,
                parameter_label: paramLabel !== "—" ? paramLabel : null,
                method_of_analysis: methodOfAnalysis || null,
                qc_payload: qcPayload,
                supporting_drive_url: supportingDriveUrl.trim() || null,
                supporting_notes: supportingNotes.trim() || null,
            });

            setCover(c);

            if (c?.quality_cover_id) {
                await uploadPendingIfAny(Number(c.quality_cover_id));
            }

            onAfterSave?.();
        } catch (e: any) {
            setQcError(prettyErr(e, t("qualityCover.section.errors.saveDraftFailed")));
        } finally {
            setQcSaving(false);
        }
    }

    async function onSubmit() {
        if (!sampleId) return;
        if (disabled) return;
        if (submitDisabledReason) return;

        setQcSubmitting(true);
        setQcError(null);

        try {
            const draft = await saveQualityCoverDraft(sampleId, {
                parameter_id: parameterId ?? null,
                parameter_label: paramLabel !== "—" ? paramLabel : null,
                method_of_analysis: methodOfAnalysis.trim(),
                qc_payload: qcPayload,
                supporting_drive_url: supportingDriveUrl.trim() || null,
                supporting_notes: supportingNotes.trim() || null,
            });

            setCover(draft);

            if (draft?.quality_cover_id) {
                await uploadPendingIfAny(Number(draft.quality_cover_id));
            }

            const submitted = await submitQualityCover(sampleId, {
                parameter_id: parameterId ?? null,
                parameter_label: paramLabel !== "—" ? paramLabel : null,
                method_of_analysis: methodOfAnalysis.trim(),
                qc_payload: qcPayload,
                supporting_drive_url: supportingDriveUrl.trim() || null,
                supporting_notes: supportingNotes.trim() || null,
            });

            setCover(submitted);

            const refreshed = await getQualityCover(sampleId);
            if (refreshed) setCover(refreshed);

            onAfterSave?.();
        } catch (e: any) {
            setQcError(prettyErr(e, t("qualityCover.section.errors.submitFailed")));
        } finally {
            setQcSubmitting(false);
        }
    }

    async function onRemoveSupportingFile(fileId: number) {
        if (!cover?.quality_cover_id) return;
        if (isLocked) return;

        setUploadError(null);

        try {
            const updated = await deleteQualityCoverSupportingDoc(Number(cover.quality_cover_id), Number(fileId));
            setCover(updated);
        } catch (e: any) {
            setUploadError(prettyErr(e, "Failed to remove supporting document."));
        }
    }

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="text-sm font-bold text-gray-900">{t("qualityCover.section.title")}</div>

                        <span className={cx("text-[11px] px-2 py-0.5 rounded-full border", statusPillClass)}>
                            {statusText}
                        </span>

                        {isLocked ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-full border bg-white border-gray-200 text-gray-600">
                                {t("qualityCover.section.lockedBadge")}
                            </span>
                        ) : null}
                    </div>

                    <div className="text-xs text-gray-500 mt-1">{t("qualityCover.section.subtitle")}</div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        className={cx(
                            "lims-btn inline-flex items-center justify-center gap-2 rounded-xl h-10 px-3",
                            "min-w-11",
                            (qcLoading || qcSaving || isLocked) && "opacity-60 cursor-not-allowed"
                        )}
                        onClick={onSaveDraft}
                        disabled={qcLoading || qcSaving || isLocked}
                        aria-label={t("saveDraft")}
                        title={isLocked ? t("qualityCover.section.tooltips.locked") : t("saveDraft")}
                    >
                        {qcSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        <span className="hidden sm:inline">{t("saveDraft")}</span>
                    </button>

                    <button
                        type="button"
                        className={cx(
                            "lims-btn-primary inline-flex items-center justify-center gap-2 rounded-xl h-10 px-3",
                            "min-w-11",
                            (!!submitDisabledReason || qcLoading || qcSubmitting || uploadingFiles) &&
                            "opacity-60 cursor-not-allowed"
                        )}
                        onClick={onSubmit}
                        disabled={qcLoading || qcSubmitting || uploadingFiles || !!submitDisabledReason}
                        aria-label={t("submit")}
                        title={submitDisabledReason || t("submit")}
                    >
                        {qcSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        <span className="hidden sm:inline">{t("submit")}</span>
                    </button>
                </div>
            </div>

            <div className="px-5 py-4">
                {qcError ? (
                    <div
                        className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl mb-3"
                        role="alert"
                    >
                        {qcError}
                    </div>
                ) : null}

                {isLocked ? (
                    <div className="text-sm text-gray-700 bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl mb-3">
                        {t("qualityCover.section.lockedHint")}
                    </div>
                ) : null}

                {qcLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("qualityCover.section.states.loading")}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("qualityCover.section.meta.parameter")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{paramLabel}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("qualityCover.section.meta.date")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{nowLabel}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("qualityCover.section.meta.labCode")}</div>
                        <div className="font-mono text-xs mt-1">{sampleCode}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("qualityCover.section.meta.checkedBy")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{checkedByName || "—"}</div>
                    </div>
                </div>

                <div className="mt-4">
                    <label className="block text-xs text-gray-500">
                        {t("qualityCover.section.fields.methodOfAnalysis")} <span className="text-red-600">*</span>
                    </label>
                    <input
                        value={methodOfAnalysis}
                        onChange={(e) => setMethodOfAnalysis(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                        disabled={isLocked}
                        placeholder={t("qualityCover.section.placeholders.methodOfAnalysis")}
                    />
                    <div className="mt-1 text-[11px] text-gray-500">{t("qualityCover.section.hints.methodOfAnalysis")}</div>
                </div>

                <div className="mt-4">
                    {qcGroup === "pcr" ? (
                        <div className="space-y-3">
                            {["ORF1b", "RdRp", "RPP30"].map((k) => (
                                <div key={k} className="rounded-2xl border border-gray-100 bg-white px-4 py-3">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <div className="text-xs font-semibold text-gray-800">{k}</div>
                                        <div className="text-[11px] text-gray-500">{t("qualityCover.section.groups.pcr.markerHint")}</div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                        <div>
                                            <label className="block text-xs text-gray-500">{t("qualityCover.section.pcr.value")}</label>
                                            <input
                                                value={qcPayload?.[k]?.value ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: { ...(prev?.[k] || {}), value: e.target.value },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                inputMode="decimal"
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                placeholder={t("qualityCover.section.pcr.valuePlaceholder")}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500">{t("qualityCover.section.pcr.result")}</label>
                                            <input
                                                value={qcPayload?.[k]?.result ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: { ...(prev?.[k] || {}), result: e.target.value },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                placeholder={t("qualityCover.section.pcr.resultPlaceholder")}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs text-gray-500">{t("qualityCover.section.pcr.interpretation")}</label>
                                            <input
                                                value={qcPayload?.[k]?.interpretation ?? ""}
                                                onChange={(e) =>
                                                    setQcPayload((prev: any) => ({
                                                        ...prev,
                                                        [k]: {
                                                            ...(prev?.[k] || {}),
                                                            interpretation: e.target.value,
                                                        },
                                                    }))
                                                }
                                                disabled={isLocked}
                                                className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                                placeholder={t("qualityCover.section.pcr.interpretationPlaceholder")}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {qcGroup === "wgs" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs text-gray-500">{t("qualityCover.section.wgs.lineage")}</label>
                                <input
                                    value={qcPayload?.lineage ?? ""}
                                    onChange={(e) => setQcPayload((prev: any) => ({ ...prev, lineage: e.target.value }))}
                                    disabled={isLocked}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    placeholder={t("qualityCover.section.wgs.lineagePlaceholder")}
                                />
                            </div>

                            <div>
                                <label className="block text-xs text-gray-500">{t("qualityCover.section.wgs.variant")}</label>
                                <input
                                    value={qcPayload?.variant ?? ""}
                                    onChange={(e) => setQcPayload((prev: any) => ({ ...prev, variant: e.target.value }))}
                                    disabled={isLocked}
                                    className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    placeholder={t("qualityCover.section.wgs.variantPlaceholder")}
                                />
                            </div>
                        </div>
                    ) : null}

                    {qcGroup === "others" ? (
                        <div>
                            <label className="block text-xs text-gray-500">{t("qualityCover.section.others.notes")}</label>
                            <textarea
                                value={qcPayload?.notes ?? ""}
                                onChange={(e) => setQcPayload((prev: any) => ({ ...prev, notes: e.target.value }))}
                                disabled={isLocked}
                                className={cx(
                                    "mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm min-h-24",
                                    "focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                                )}
                                placeholder={t("qualityCover.section.others.notesPlaceholder")}
                            />
                        </div>
                    ) : null}

                    {submitDisabledReason ? (
                        <div className={cx("mt-3 text-xs", isBusy ? "text-gray-400" : "text-gray-500")}>
                            {submitDisabledReason}
                        </div>
                    ) : null}
                </div>

                <div className="mt-5 w-full rounded-2xl border border-gray-100 bg-white overflow-hidden flex flex-col">
                    <div className="w-full px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <Paperclip size={16} className="text-gray-700" />
                                <div className="text-sm font-extrabold text-gray-900">
                                    {ts("qualityCover.section.supporting.title", { defaultValue: "Supporting documents" })}
                                </div>

                                <div className="text-xs text-gray-500 mt-1">
                                    {ts("qualityCover.section.supporting.subtitle", {
                                        defaultValue: "Optional. Upload any files (0..n): PDF, images, DOCX, XLSX, etc.",
                                    })}
                                </div>
                            </div>

                            {uploadingFiles ? (
                                <div className="text-xs text-gray-600 inline-flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" />
                                    Uploading…
                                </div>
                            ) : null}
                        </div>

                        <div className="w-full p-4 space-y-4">
                            <div className="md:col-span-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <div
                                            className={cx(
                                                "rounded-2xl border-2 border-dashed p-6 bg-gray-50/60",
                                                "flex flex-col items-center justify-center text-center",
                                                "transition",
                                                isLocked || uploadingFiles ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-gray-50",
                                                isDragOver ? "border-primary ring-2 ring-primary-soft bg-white" : "border-gray-200"
                                            )}
                                            onClick={() => {
                                                if (isLocked || uploadingFiles) return;
                                                fileInputRef.current?.click();
                                            }}
                                            onDragOver={(e) => {
                                                if (isLocked || uploadingFiles) return;
                                                e.preventDefault();
                                                setIsDragOver(true);
                                            }}
                                            onDragLeave={() => setIsDragOver(false)}
                                            onDrop={(e) => {
                                                if (isLocked || uploadingFiles) return;
                                                e.preventDefault();
                                                setIsDragOver(false);

                                                const files = Array.from(e.dataTransfer?.files ?? []);
                                                addPendingFiles(files);
                                            }}
                                            role="button"
                                            aria-disabled={isLocked || uploadingFiles}
                                            title={ts("qualityCover.section.supporting.upload", { defaultValue: "Upload supporting docs (0..n)" })}
                                        >
                                            <UploadCloud className={cx("mb-3", isDragOver ? "text-primary" : "text-gray-600")} size={34} />

                                            <div className="text-sm font-semibold text-gray-900">
                                                {ts("qualityCover.section.supporting.dropTitle", { defaultValue: "Drag and drop files here" })}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {ts("qualityCover.section.supporting.dropHint", { defaultValue: "or browse from your computer" })}
                                            </div>

                                            <button
                                                type="button"
                                                className={cx("btn-outline mt-4", (isLocked || uploadingFiles) && "cursor-not-allowed")}
                                                disabled={isLocked || uploadingFiles}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isLocked || uploadingFiles) return;
                                                    fileInputRef.current?.click();
                                                }}
                                            >
                                                {ts("qualityCover.section.supporting.browse", { defaultValue: "Browse files" })}
                                            </button>

                                            <div className="mt-3 text-[11px] text-gray-500">
                                                {ts("qualityCover.section.supporting.subtitle", {
                                                    defaultValue: "Optional. Upload any files (0..n): PDF, images, DOCX, XLSX, etc.",
                                                })}
                                            </div>

                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                multiple
                                                className="hidden"
                                                disabled={isLocked || uploadingFiles}
                                                onChange={(e) => {
                                                    const files = Array.from(e.target.files ?? []);
                                                    addPendingFiles(files);
                                                    e.currentTarget.value = "";
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                                {ts("qualityCover.section.supporting.driveUrl", { defaultValue: "Google Drive link (optional)" })}
                                            </label>
                                            <input
                                                value={supportingDriveUrl}
                                                onChange={(e) => setSupportingDriveUrl(e.target.value)}
                                                placeholder="https://drive.google.com/..."
                                                disabled={isLocked}
                                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                                {ts("qualityCover.section.supporting.notes", { defaultValue: "Other notes (optional)" })}
                                            </label>
                                            <textarea
                                                value={supportingNotes}
                                                onChange={(e) => setSupportingNotes(e.target.value)}
                                                rows={4}
                                                placeholder="Any additional context…"
                                                disabled={isLocked}
                                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-100"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {uploadError ? (
                                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                                        {uploadError}
                                    </div>
                                ) : null}

                                {pendingFiles.length > 0 ? (
                                    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                                            <div className="text-sm font-semibold text-gray-900">
                                                {ts("qualityCover.section.supporting.pending", { defaultValue: "Pending upload" })}
                                            </div>
                                            <div className="text-[11px] text-gray-500">
                                                {ts("qualityCover.section.supporting.filesHint", {
                                                    defaultValue: "Files are uploaded when you click Save draft or Submit.",
                                                })}
                                            </div>
                                        </div>

                                        <ul className="divide-y divide-gray-100">
                                            {pendingFiles.map((f, idx) => (
                                                <li key={`${f.name}-${idx}`} className="px-4 py-3 flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="text-sm font-medium text-gray-900 truncate">{f.name}</div>
                                                        <div className="text-xs text-gray-500">{humanFileSize(f.size)}</div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="lims-icon-button"
                                                        onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                                                        disabled={isLocked || uploadingFiles}
                                                        aria-label={ts("qualityCover.section.supporting.remove", { defaultValue: "Remove" })}
                                                        title={ts("qualityCover.section.supporting.remove", { defaultValue: "Remove" })}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : null}

                                {supportingFiles.length > 0 ? (
                                    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
                                            <div className="text-sm font-semibold text-gray-900">
                                                {ts("qualityCover.section.supporting.uploaded", { defaultValue: "Uploaded" })}
                                            </div>
                                        </div>

                                        <ul className="divide-y divide-gray-100">
                                            {supportingFiles.map((f) => {
                                                const busy = fileBusyId === f.file_id;

                                                return (
                                                    <li key={f.file_id} className="px-4 py-3 flex items-center justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-medium text-gray-900 truncate">
                                                                {f.original_name ?? `File #${f.file_id}`}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {humanFileSize(f.size_bytes)}
                                                                {f.mime_type ? ` • ${f.mime_type}` : ""}
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                className="btn-outline px-3! py-1! text-xs inline-flex items-center gap-2"
                                                                onClick={() => void downloadSupportingFile(f.file_id)}
                                                                disabled={!!fileBusyId}
                                                                title={ts("qualityCover.section.supporting.download", { defaultValue: "Download" })}
                                                            >
                                                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                                                                {ts("qualityCover.section.supporting.download", { defaultValue: "Download" })}
                                                            </button>

                                                            {!isLocked ? (
                                                                <button
                                                                    type="button"
                                                                    className="lims-icon-button"
                                                                    onClick={() => onRemoveSupportingFile(f.file_id)}
                                                                    disabled={uploadingFiles || !!fileBusyId}
                                                                    aria-label={ts("qualityCover.section.supporting.remove", { defaultValue: "Remove" })}
                                                                    title={ts("qualityCover.section.supporting.remove", { defaultValue: "Remove" })}
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                ) : (
                                    <div className="text-[11px] text-gray-500">
                                        {ts("qualityCover.section.supporting.noFiles", { defaultValue: "No supporting documents uploaded." })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}