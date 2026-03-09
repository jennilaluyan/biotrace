import { Eye } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SampleArchiveListItem } from "../../../services/sampleArchive";
import { formatDateTimeLocal } from "../../../utils/date";

function safeText(v: any, fallback = "—") {
    if (v === null || v === undefined) return fallback;
    const s = String(v).trim();
    return s.length ? s : fallback;
}

export default function ArchivedFailedRequestsTab(props: {
    items: SampleArchiveListItem[];
    onOpen: (sampleId: number) => void;
}) {
    const { t } = useTranslation();
    const { items, onOpen } = props;

    return (
        <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
                <thead className="bg-white text-gray-700 border-b border-gray-100">
                    <tr>
                        <th className="text-left font-semibold px-4 py-3">
                            {t("samples.pages.archive.failedTable.request", { defaultValue: "Request" })}
                        </th>
                        <th className="text-left font-semibold px-4 py-3">
                            {t("samples.pages.archive.failedTable.client", { defaultValue: "Client" })}
                        </th>
                        <th className="text-left font-semibold px-4 py-3">
                            {t("samples.pages.archive.failedTable.sampleType", { defaultValue: "Sample type" })}
                        </th>
                        <th className="text-left font-semibold px-4 py-3">
                            {t("samples.pages.archive.failedTable.status", { defaultValue: "Status" })}
                        </th>
                        <th className="text-left font-semibold px-4 py-3">
                            {t("samples.pages.archive.failedTable.archived", { defaultValue: "Archived" })}
                        </th>
                        <th className="text-right font-semibold px-4 py-3">
                            {t("samples.pages.archive.failedTable.actions", { defaultValue: "Actions" })}
                        </th>
                    </tr>
                </thead>

                <tbody className="divide-y divide-gray-100">
                    {items.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                                {t("samples.pages.archive.emptyTitle", { defaultValue: "No archived samples" })}
                            </td>
                        </tr>
                    ) : (
                        items.map((it) => {
                            const sampleId = Number(it.sample_id ?? 0);
                            const status = String(it.request_status ?? "").trim().toLowerCase();

                            const statusCls =
                                status === "rejected"
                                    ? "bg-rose-50 text-rose-700 border-rose-200"
                                    : "bg-amber-50 text-amber-800 border-amber-200";

                            const statusLabel =
                                status === "rejected"
                                    ? t("requestStatus.rejected", { defaultValue: "Rejected" })
                                    : t("requestStatus.returned", { defaultValue: "Returned" });

                            return (
                                <tr key={sampleId} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">#{sampleId}</td>
                                    <td className="px-4 py-3 text-gray-700">{safeText(it.client_name)}</td>
                                    <td className="px-4 py-3 text-gray-700">{safeText(it.sample_type)}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusCls}`}>
                                            {statusLabel}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-gray-700">
                                        {it.archived_at ? formatDateTimeLocal(it.archived_at) : "—"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-end">
                                            <button
                                                type="button"
                                                className="lims-icon-button"
                                                onClick={() => onOpen(sampleId)}
                                                aria-label={t("view", { defaultValue: "View" })}
                                                title={t("view", { defaultValue: "View" })}
                                            >
                                                <Eye size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}