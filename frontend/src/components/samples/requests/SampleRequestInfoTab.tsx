import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Sample } from "../../../services/samples";
import { formatDateTimeLocal } from "../../../utils/date";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function unwrapRequestedParameters(sample: any) {
    const a = sample?.requested_parameters ?? sample?.requestedParameters ?? [];
    return Array.isArray(a) ? a : [];
}

function displayText(value: unknown, fallback = "—") {
    const text = String(value ?? "").trim();
    return text || fallback;
}

export function SampleRequestInfoTab(props: { sample: Sample }) {
    const { t } = useTranslation();
    const s: any = props.sample as any;

    const requested = useMemo(() => unwrapRequestedParameters(s), [s]);
    const testMethod = useMemo(
        () => String(s?.test_method_name ?? s?.testMethodName ?? "").trim(),
        [s?.test_method_name, s?.testMethodName]
    );

    const scheduledDeliveryText = useMemo(() => {
        const raw = s?.scheduled_delivery_at;
        if (!raw) return "—";
        return formatDateTimeLocal(raw);
    }, [s?.scheduled_delivery_at]);

    const clientName = displayText(
        s?.client?.type === "institution"
            ? s?.client?.institution_name ?? s?.client?.name ?? s?.client_name
            : s?.client?.name ?? s?.client_name,
        t("samples.requestInfo.clientFallback", { defaultValue: "—" })
    );

    const clientEmail = String(s?.client?.email ?? s?.client_email ?? "").trim();

    const batchSummary = s?.batch_summary ?? null;
    const batchActiveTotal = Number(batchSummary?.batch_active_total ?? s?.request_batch_total ?? 1);
    const batchExcludedTotal = Number(batchSummary?.batch_excluded_total ?? 0);
    const isBatchRequest = !!(s?.request_batch_id && batchActiveTotal > 1);

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">
                    {t("samples.requestInfo.title", { defaultValue: "Request information" })}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                    {t("samples.requestInfo.subtitle", {
                        defaultValue: "Client-submitted details for this request.",
                    })}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">
                            {t("samples.requestInfo.sampleType", { defaultValue: "Sample type" })}
                        </div>
                        <div className="font-semibold text-gray-900 mt-0.5">
                            {displayText(s?.sample_type)}
                        </div>
                    </div>

                    {isBatchRequest ? (
                        <div className="rounded-xl border border-sky-100 bg-sky-50 px-3 py-2">
                            <div className="text-xs text-sky-700">
                                {t("samples.requestInfo.batchRequest", {
                                    defaultValue: "Institutional batch",
                                })}
                            </div>
                            <div className="font-semibold text-sky-900 mt-0.5">
                                {batchActiveTotal}{" "}
                                {t("samples.requestInfo.samplesCount", {
                                    defaultValue: "active samples",
                                })}
                            </div>
                            {batchExcludedTotal > 0 ? (
                                <div className="text-xs text-sky-700 mt-1">
                                    {batchExcludedTotal}{" "}
                                    {t("samples.requestInfo.excludedCount", {
                                        defaultValue: "excluded from active batch",
                                    })}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">
                            {t("samples.requestInfo.testMethod", { defaultValue: "Test method" })}
                        </div>
                        <div className={cx("font-semibold mt-0.5", testMethod ? "text-gray-900" : "text-gray-500")}>
                            {testMethod || t("samples.requestInfo.testMethodEmpty", { defaultValue: "Not set yet" })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">
                            {t("samples.requestInfo.scheduledDelivery", { defaultValue: "Delivery schedule" })}
                        </div>
                        <div className="font-semibold text-gray-900 mt-0.5">{scheduledDeliveryText}</div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <div className="text-xs text-gray-500">
                            {t("samples.requestInfo.client", { defaultValue: "Client" })}
                        </div>
                        <div className="font-semibold text-gray-900 mt-0.5">{clientName}</div>
                        <div className="text-xs text-gray-500">{clientEmail}</div>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">
                    {t("samples.requestInfo.requestedParameters", { defaultValue: "Requested parameters" })}
                </div>

                <div className="mt-3 space-y-2">
                    {requested.length === 0 ? (
                        <div className="text-sm text-gray-600">
                            {t("samples.requestInfo.noParameters", { defaultValue: "No parameters." })}
                        </div>
                    ) : (
                        requested.map((p: any, idx: number) => {
                            const code = String(p?.code ?? "").trim();
                            const name = String(p?.name ?? "").trim();
                            const label =
                                (code ? `${code} — ` : "") +
                                (name || t("samples.requestInfo.parameterFallback", { defaultValue: "Parameter" }));

                            return (
                                <div
                                    key={`${p?.parameter_id ?? idx}`}
                                    className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2"
                                >
                                    <div className="text-sm font-semibold text-gray-900">{label}</div>
                                    {p?.tag ? <div className="text-xs text-gray-500 mt-0.5">{String(p.tag)}</div> : null}
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                        <div className="text-xs text-gray-500">
                            {t("samples.requestInfo.examinationPurpose", { defaultValue: "Purpose" })}
                        </div>
                        <div className="mt-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                            {displayText(s?.examination_purpose)}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">
                            {t("samples.requestInfo.additionalNotes", { defaultValue: "Additional notes" })}
                        </div>
                        <div className="mt-1 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                            {displayText(s?.additional_notes)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}