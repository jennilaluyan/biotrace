import { useTranslation } from "react-i18next";
import { CalendarClock, FlaskConical, ClipboardList, StickyNote, User, Tag } from "lucide-react";

import type { Sample } from "../../../services/samples";
import { formatDateTimeLocal } from "../../../utils/date";

function safeText(v: any) {
    if (v === null || v === undefined) return "—";
    const s = String(v).trim();
    return s.length ? s : "—";
}

export function SampleRequestInfoTab({ sample }: { sample: Sample }) {
    const { t } = useTranslation();
    const s: any = sample;

    const params = Array.isArray(s?.requested_parameters) ? s.requested_parameters : [];
    const hasParams = params.length > 0;

    const clientName = safeText(s?.client?.name ?? (s?.client_id ? t("samples.requestInfo.clientFallback", { id: s.client_id }) : null));
    const clientEmail = typeof s?.client?.email === "string" && s.client.email.trim() ? s.client.email.trim() : null;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <ClipboardList size={16} className="text-gray-500" aria-hidden="true" />
                                <div className="text-sm font-bold text-gray-900">{t("samples.requestInfo.title")}</div>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">{t("samples.requestInfo.subtitle")}</div>
                        </div>
                    </div>
                </div>

                <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                    <div>
                        <div className="lims-detail-label flex items-center gap-2">
                            <FlaskConical size={14} className="text-gray-400" aria-hidden="true" />
                            {t("samples.requestInfo.sampleType")}
                        </div>
                        <div className="lims-detail-value">{safeText(s?.sample_type)}</div>
                    </div>

                    <div>
                        <div className="lims-detail-label flex items-center gap-2">
                            <CalendarClock size={14} className="text-gray-400" aria-hidden="true" />
                            {t("samples.requestInfo.scheduledDelivery")}
                        </div>
                        <div className="lims-detail-value">
                            {s?.scheduled_delivery_at ? formatDateTimeLocal(s.scheduled_delivery_at) : "—"}
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="lims-detail-label flex items-center gap-2">
                            <Tag size={14} className="text-gray-400" aria-hidden="true" />
                            {t("samples.requestInfo.requestedParameters")}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                            {hasParams ? (
                                params.map((p: any) => {
                                    const code = String(p?.code ?? "").trim();
                                    const name = String(p?.name ?? "").trim();
                                    const fallback = t("samples.requestInfo.parameterFallback", { id: String(p?.parameter_id ?? p?.id ?? "") });
                                    const label = (code ? `${code} — ` : "") + (name || fallback);

                                    return (
                                        <span
                                            key={String(p?.parameter_id ?? p?.id ?? label)}
                                            className="inline-flex items-center rounded-full px-3 py-1 text-xs border bg-gray-50 text-gray-800 border-gray-200"
                                            title={label}
                                        >
                                            {label}
                                        </span>
                                    );
                                })
                            ) : (
                                <span className="text-gray-600">{t("samples.requestInfo.noParameters")}</span>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="lims-detail-label flex items-center gap-2">
                            <ClipboardList size={14} className="text-gray-400" aria-hidden="true" />
                            {t("samples.requestInfo.examinationPurpose")}
                        </div>
                        <div className="lims-detail-value">{safeText(s?.examination_purpose)}</div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="lims-detail-label flex items-center gap-2">
                            <StickyNote size={14} className="text-gray-400" aria-hidden="true" />
                            {t("samples.requestInfo.additionalNotes")}
                        </div>
                        <div className="lims-detail-value">{safeText(s?.additional_notes)}</div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="lims-detail-label flex items-center gap-2">
                            <User size={14} className="text-gray-400" aria-hidden="true" />
                            {t("samples.requestInfo.client")}
                        </div>
                        <div className="lims-detail-value">
                            {clientName}
                            {clientEmail ? <span className="text-xs text-gray-500"> · {clientEmail}</span> : null}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
