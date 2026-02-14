import type { Sample } from "../../../services/samples";
import { formatDateTimeLocal } from "../../../utils/date";

function safeText(v: any) {
    if (v === null || v === undefined) return "-";
    const s = String(v).trim();
    return s.length ? s : "-";
}

export function SampleRequestInfoTab({ sample }: { sample: Sample }) {
    const s: any = sample;

    return (
        <div className="space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
                    <div className="text-sm font-bold text-gray-900">Sample Info</div>
                    <div className="text-xs text-gray-500 mt-1">Request details (client submission).</div>
                </div>

                <div className="px-5 py-4 grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
                    <div>
                        <div className="lims-detail-label">Sample Type</div>
                        <div className="lims-detail-value">{safeText(s?.sample_type)}</div>
                    </div>

                    <div>
                        <div className="lims-detail-label">Scheduled Delivery</div>
                        <div className="lims-detail-value">
                            {s?.scheduled_delivery_at ? formatDateTimeLocal(s.scheduled_delivery_at) : "-"}
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="lims-detail-label">Requested Parameters</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {Array.isArray(s?.requested_parameters) && s.requested_parameters.length ? (
                                s.requested_parameters.map((p: any) => {
                                    const code = String(p?.code ?? "").trim();
                                    const name = String(p?.name ?? "").trim();
                                    const label = (code ? `${code} — ` : "") + (name || `Parameter #${p?.parameter_id ?? ""}`);
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
                                <span className="text-gray-600">-</span>
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="lims-detail-label">Examination Purpose</div>
                        <div className="lims-detail-value">{safeText(s?.examination_purpose)}</div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="lims-detail-label">Additional Notes</div>
                        <div className="lims-detail-value">{safeText(s?.additional_notes)}</div>
                    </div>

                    <div className="lg:col-span-2">
                        <div className="lims-detail-label">Client</div>
                        <div className="lims-detail-value">
                            {safeText(s?.client?.name ?? (s?.client_id ? `Client #${s.client_id}` : "-"))}
                            {s?.client?.email ? <span className="text-xs text-gray-500"> · {s.client.email}</span> : null}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
