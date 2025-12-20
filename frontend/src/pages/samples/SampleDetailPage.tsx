import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId, getUserRoleLabel } from "../../utils/roles";
import { formatDate } from "../../utils/date";
import { sampleService, Sample } from "../../services/samples";

export const SampleDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    // mengikuti SamplePolicy viewAny
    const canViewSamples = useMemo(() => {
        return (
            roleId === ROLE_ID.ADMIN ||
            roleId === ROLE_ID.LAB_HEAD ||
            roleId === ROLE_ID.OPERATIONAL_MANAGER ||
            roleId === ROLE_ID.ANALYST ||
            roleId === ROLE_ID.SAMPLE_COLLECTOR
        );
    }, [roleId]);

    const sampleId = Number(id);
    const [sample, setSample] = useState<Sample | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            if (!canViewSamples) {
                setLoading(false);
                return;
            }

            if (!sampleId || Number.isNaN(sampleId)) {
                setError("Invalid sample URL.");
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                const data = await sampleService.getById(sampleId);
                setSample(data);
            } catch (err: any) {
                const msg =
                    err?.data?.message ??
                    err?.data?.error ??
                    "Failed to load sample detail.";
                setError(msg);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [canViewSamples, sampleId]);

    if (!canViewSamples) {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role <span className="font-semibold">({roleLabel})</span> is not
                    allowed to access the samples module.
                </p>
                <Link to="/samples" className="mt-4 lims-btn-primary">
                    Back to samples
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-[60vh]">
            {/* Breadcrumb (samakan dengan ClientDetailPage) */}
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <span className="lims-breadcrumb-icon">
                        <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <path d="M4 12h9" />
                            <path d="M11 9l3 3-3 3" />
                            <path d="M4 6v12" />
                        </svg>
                    </span>

                    <Link to="/samples" className="lims-breadcrumb-link">
                        Samples
                    </Link>

                    <span className="lims-breadcrumb-separator">›</span>

                    <span className="lims-breadcrumb-current">Sample Detail</span>
                </nav>
            </div>

            <div className="lims-detail-shell">
                {loading && (
                    <div className="text-sm text-gray-600">Loading sample detail...</div>
                )}

                {error && !loading && (
                    <div className="text-sm text-red-600 bg-red-100 px-3 py-2 rounded mb-4">
                        {error}
                    </div>
                )}

                {!loading && !error && sample && (
                    <div className="space-y-6">
                        {/* Header / Summary */}
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h1 className="text-lg md:text-xl font-bold text-gray-900">
                                    Sample Detail
                                </h1>
                                <div className="text-sm text-gray-600 mt-1">
                                    Sample ID <span className="font-semibold">#{sample.sample_id}</span>
                                    {" · "}
                                    Current Status{" "}
                                    <span className="font-semibold">{sample.current_status}</span>
                                    {" · "}
                                    high-level:{" "}
                                    <span className="font-mono text-xs">{sample.status_enum ?? "-"}</span>
                                </div>
                            </div>
                        </div>

                        {/* Cards (boleh tetap pakai layout kamu yang sekarang) */}
                        <div className="bg-white border border-gray-100 rounded-2xl shadow-[0_4px_14px_rgba(15,23,42,0.04)] px-5 py-5">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                <div>
                                    <h3 className="lims-detail-section-title mb-3">Sample Info</h3>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <div className="lims-detail-label">Sample Type</div>
                                            <div className="lims-detail-value">{sample.sample_type}</div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">Received At</div>
                                            <div className="lims-detail-value">{formatDate(sample.received_at)}</div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">Priority</div>
                                            <div className="lims-detail-value">{String(sample.priority ?? "-")}</div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">Contact History</div>
                                            <div className="lims-detail-value">{sample.contact_history ?? "-"}</div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="lims-detail-label">Examination Purpose</div>
                                            <div className="lims-detail-value">
                                                {sample.examination_purpose ?? "-"}
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="lims-detail-label">Additional Notes</div>
                                            <div className="lims-detail-value">
                                                {sample.additional_notes ?? "-"}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="lims-detail-section-title mb-3">Client & Creator</h3>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="col-span-2">
                                            <div className="lims-detail-label">Client</div>
                                            <div className="lims-detail-value">
                                                {sample.client?.name ?? `Client #${sample.client_id}`}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">Client Email</div>
                                            <div className="lims-detail-value break-all">
                                                {sample.client?.email ?? "-"}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="lims-detail-label">Client Phone</div>
                                            <div className="lims-detail-value">
                                                {sample.client?.phone ?? "-"}
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="lims-detail-label">Created By</div>
                                            <div className="lims-detail-value">
                                                {sample.creator?.name ?? `Staff #${sample.created_by}`}
                                            </div>
                                        </div>
                                        <div className="col-span-2">
                                            <div className="lims-detail-label">Creator Email</div>
                                            <div className="lims-detail-value break-all">
                                                {sample.creator?.email ?? "-"}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <h3 className="lims-detail-section-title mb-2">
                                    Audit Trail / Status History (Next)
                                </h3>
                                <div className="text-sm text-gray-600">
                                    -
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
