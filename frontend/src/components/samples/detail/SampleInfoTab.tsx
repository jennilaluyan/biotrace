import { useTranslation } from "react-i18next";
import type { Sample } from "../../../services/samples";
import { formatDateTimeLocal } from "../../../utils/date";

type Props = { sample: Sample };

function normalizeLabel(input?: string | null) {
    const s = String(input ?? "").trim();
    if (!s) return "-";
    if (s.includes("-") && /[A-Za-z]/.test(s) && /\d/.test(s)) return s;

    return s
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

function joinParams(sample: any) {
    const arr = (sample?.requested_parameters || sample?.requestedParameters || []) as any[];
    const names = arr.map((p) => p?.name).filter(Boolean);
    return names.length ? names.join(", ") : "—";
}

export function SampleInfoTab({ sample }: Props) {
    const { t } = useTranslation();
    const s: any = sample;

    const labCode = String(s?.lab_sample_code ?? "").trim() || "—";
    const sampleType = String(s?.sample_type ?? "").trim() || "—";
    const workflowGroup = normalizeLabel(s?.workflow_group ?? s?.workflowGroup ?? "—") || "—";

    const receivedAt = s?.received_at ?? null;

    const parameters = joinParams(s);

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="text-sm font-bold text-gray-900">{t("samples.info.title")}</div>
                </div>

                <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("samples.info.labCode")}</div>
                        <div className="font-mono text-xs mt-1">{labCode}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("samples.info.sampleType")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{sampleType}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 md:col-span-2">
                        <div className="text-xs text-gray-500">{t("samples.info.parameters")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{parameters}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("samples.info.workflowGroup")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">{workflowGroup}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">{t("samples.info.receivedAdmin")}</div>
                        <div className="font-semibold text-gray-900 mt-0.5">
                            {receivedAt ? formatDateTimeLocal(receivedAt) : "—"}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
