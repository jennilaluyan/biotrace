import { useEffect, useMemo, useState } from "react";
import type { Sample, SampleStatus, SampleComment } from "../../services/samples";
import { sampleService } from "../../services/samples";
import {
    getAllowedSampleStatusTargets,
    sampleStatusLabel,
} from "../../utils/sampleTransitions";
import { ROLE_ID } from "../../utils/roles";
import { commentTargetLabelByStatus } from "../../utils/sampleCommentTargets";
import { formatDateTimeLocal } from "../../utils/date";

type Props = {
    open: boolean;
    onClose: () => void;
    sample: Sample | null;
    roleId: number; // dari getUserRoleId(user)
    onUpdated?: () => void;

    // ✅ optional: buat badge jumlah komentar di tombol update status (di SamplesPage)
    onCommentsCountChange?: (sampleId: number, count: number) => void;
};

export const UpdateSampleStatusModal = ({
    open,
    onClose,
    sample,
    roleId,
    onUpdated,
    onCommentsCountChange,
}: Props) => {
    const [targetStatus, setTargetStatus] = useState<SampleStatus | "">("");
    const [note, setNote] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // ✅ pisahkan error: status vs comments
    const [statusError, setStatusError] = useState<string | null>(null);
    const [commentsError, setCommentsError] = useState<string | null>(null);

    const [comments, setComments] = useState<SampleComment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [commentBody, setCommentBody] = useState("");
    const [commentSubmitting, setCommentSubmitting] = useState(false);

    const isLabHead = roleId === ROLE_ID.LAB_HEAD;

    const allowedTargets = useMemo(() => {
        return getAllowedSampleStatusTargets(roleId, sample?.current_status);
    }, [roleId, sample?.current_status]);

    const canSubmit =
        open &&
        !!sample &&
        allowedTargets.length > 0 &&
        !!targetStatus &&
        !submitting;

    const currentLabel = sample?.current_status
        ? sampleStatusLabel(sample.current_status)
        : "-";

    const loadComments = async () => {
        if (!sample) return;

        try {
            setCommentsLoading(true);
            setCommentsError(null);

            const data = await sampleService.getComments(sample.sample_id);
            const list = Array.isArray(data) ? data : [];

            setComments(list);

            // ✅ update badge count (viewer-specific)
            onCommentsCountChange?.(sample.sample_id, list.length);
        } catch (err: any) {
            // ✅ error khusus comments (tidak ganggu update status)
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Failed to load comments.";
            setCommentsError(msg);
            setComments([]);
            onCommentsCountChange?.(sample.sample_id, 0);
        } finally {
            setCommentsLoading(false);
        }
    };

    useEffect(() => {
        if (!open) return;

        setTargetStatus("");
        setNote("");
        setSubmitting(false);
        setStatusError(null);

        setCommentBody("");
        setCommentSubmitting(false);
        setCommentsError(null);

        loadComments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, sample?.sample_id]);

    const submit = async () => {
        if (!sample) return;
        if (!targetStatus) return;

        try {
            setSubmitting(true);
            setStatusError(null);

            await sampleService.updateStatus(sample.sample_id, {
                target_status: targetStatus,
                note: note?.trim() ? note.trim() : null,
            });

            onUpdated?.();
            onClose();
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Failed to update sample status.";
            setStatusError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const submitComment = async () => {
        if (!sample) return;

        const body = commentBody.trim();
        if (!body) return;

        try {
            setCommentSubmitting(true);
            setCommentsError(null);

            await sampleService.addComment(sample.sample_id, { body });

            setCommentBody("");
            await loadComments();
        } catch (err: any) {
            const msg =
                err?.data?.message ??
                err?.data?.error ??
                "Failed to add comment.";
            setCommentsError(msg);
        } finally {
            setCommentSubmitting(false);
        }
    };

    if (!open || !sample) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* overlay */}
            <div className="absolute inset-0 bg-black/30" onClick={onClose} />

            {/* modal */}
            <div className="relative w-[92vw] max-w-[680px] bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden flex flex-col max-h-[calc(100vh-3rem)]">
                <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between bg-white sticky top-0 z-10">
                    <div>
                        <div className="text-lg font-semibold text-gray-900">
                            Update Sample Status
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                            Sample #{sample.sample_id} • Current:{" "}
                            <span className="font-medium">{currentLabel}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                <div className="px-6 py-5 overflow-y-auto pb-6">
                    {/* role gating info */}
                    {allowedTargets.length === 0 && (
                        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            No allowed status transitions for your role from{" "}
                            <b>{currentLabel}</b>.
                        </div>
                    )}

                    {/* ✅ error khusus status update */}
                    {statusError && (
                        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                            {statusError}
                        </div>
                    )}

                    {/* Comments Section */}
                    <div className="mb-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-gray-800">
                                    Lab Head Comments
                                </div>

                                {/* small badge count */}
                                <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700">
                                    {commentsLoading ? "…" : comments.length}
                                </span>
                            </div>

                            <button
                                type="button"
                                onClick={loadComments}
                                disabled={commentsLoading}
                                className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
                            >
                                {commentsLoading ? "Refreshing..." : "Refresh"}
                            </button>
                        </div>

                        <div className="mt-2 text-xs text-gray-500">
                            Visible to:{" "}
                            <span className="font-medium">
                                {commentTargetLabelByStatus(sample?.current_status)}
                            </span>
                        </div>

                        {/* ✅ error khusus comments (di dalam section) */}
                        {commentsError && (
                            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                {commentsError}
                            </div>
                        )}

                        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50/40 p-3 max-h-40 overflow-y-auto">
                            {commentsLoading ? (
                                <div className="text-xs text-gray-600">Loading comments...</div>
                            ) : comments.length === 0 ? (
                                <div className="rounded-lg bg-white border border-gray-100 p-3">
                                    <div className="text-sm font-medium text-gray-800">
                                        No comments to show
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                        Either there are no comments yet, or none are visible to your role for the current status.
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {comments.map((c) => (
                                        <div
                                            key={c.comment_id}
                                            className="rounded-lg bg-white border border-gray-100 p-2"
                                        >
                                            <div className="text-[11px] text-gray-500 flex items-center justify-between">
                                                <span>
                                                    {c.author_name
                                                        ? c.author_name
                                                        : c.created_by
                                                            ? `Staff #${c.created_by}`
                                                            : "Lab Head"}
                                                </span>
                                                <span>
                                                    {formatDateTimeLocal(c.created_at)}
                                                </span>
                                            </div>
                                            <div className="text-sm text-gray-800 mt-1 whitespace-pre-wrap">
                                                {c.body}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Composer (Lab Head only) */}
                        {isLabHead && (
                            <div className="mt-3">
                                <label className="block text-xs font-semibold text-gray-600 mb-2">
                                    Add comment (Lab Head)
                                </label>
                                <textarea
                                    value={commentBody}
                                    onChange={(e) => setCommentBody(e.target.value)}
                                    maxLength={500}
                                    disabled={commentSubmitting}
                                    className="w-full min-h-[84px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50"
                                    placeholder="Write comment for the responsible role..."
                                />
                                <div className="mt-2 flex items-center justify-between">
                                    <div className="text-xs text-gray-400">
                                        {commentBody.length}/500
                                    </div>
                                    <button
                                        type="button"
                                        onClick={submitComment}
                                        disabled={commentSubmitting || !commentBody.trim()}
                                        className="px-4 py-2 rounded-full text-xs font-semibold bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {commentSubmitting ? "Posting..." : "Post Comment"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Status form */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-2">
                                Target status
                            </label>
                            <select
                                value={targetStatus}
                                onChange={(e) => setTargetStatus(e.target.value as any)}
                                disabled={allowedTargets.length === 0 || submitting}
                                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50"
                            >
                                <option value="">Select target status...</option>
                                {allowedTargets.map((s) => (
                                    <option key={s} value={s}>
                                        {sampleStatusLabel(s)}
                                    </option>
                                ))}
                            </select>

                            {allowedTargets.length > 0 && (
                                <div className="mt-2 text-xs text-gray-500">
                                    Allowed:{" "}
                                    <span className="font-medium">
                                        {allowedTargets.map(sampleStatusLabel).join(", ")}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-2">
                                Note (optional)
                            </label>
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={500}
                                disabled={submitting}
                                className="w-full min-h-24 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent disabled:bg-gray-50"
                                placeholder="Reason / note for this change..."
                            />
                            <div className="mt-1 text-xs text-gray-400">{note.length}/500</div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-white sticky bottom-0 z-10">
                    <button
                        type="button"
                        className="px-5 py-2 rounded-full border text-sm hover:bg-gray-50"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="lims-btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                        onClick={submit}
                        disabled={!canSubmit}
                    >
                        {submitting ? "Updating..." : "Update Status"}
                    </button>
                </div>
            </div>
        </div>
    );
};
