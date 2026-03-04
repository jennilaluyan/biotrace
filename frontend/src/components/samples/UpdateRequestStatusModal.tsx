import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, ClipboardCheck, X } from "lucide-react";

import { updateRequestStatus } from "../../services/sampleRequestStatus";
import { listMethods, type MethodRow } from "../../services/methods";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

type Action = "accept" | "reject" | "return" | "received";

type Props = {
    open: boolean;
    sampleId: number | null; // used as Request ID in UI
    action: Action;
    currentStatus?: string | null;

    onClose: () => void;
    onUpdated: () => void;
};

type ApiErrorLike = {
    response?: { data?: any };
    data?: any;
    message?: string;
};

/**
 * Extracts a user-friendly API error message (supports Laravel validation shapes).
 */
function getErrMsg(err: unknown, fallback: string) {
    const e = err as ApiErrorLike;
    const data = e?.response?.data ?? e?.data;

    const details = data?.details ?? data?.errors;
    if (details && typeof details === "object") {
        const k = Object.keys(details)[0];
        const v = k ? (details as any)[k] : undefined;
        if (Array.isArray(v) && v[0]) return String(v[0]);
        if (typeof v === "string" && v) return v;
    }

    return (
        data?.message ??
        data?.error ??
        (typeof (e as any)?.message === "string" ? (e as any).message : null) ??
        fallback
    );
}

/**
 * Normalizes arbitrary status-ish strings into "words" (lowercase, spaces).
 */
function normalizeStatusWords(input?: string | null) {
    return String(input ?? "")
        .trim()
        .toLowerCase()
        .replace(/_/g, " ")
        .replace(/\s+/g, " ");
}

/**
 * Compacts a request-status token into a short, one-word-ish label when possible.
 * Keeps output lowercase and space-normalized.
 */
function compactRequestStatusToken(token: string, locale: string) {
    const isId = String(locale || "").toLowerCase().startsWith("id");

    const map: Record<string, { en: string; id: string }> = {
        submitted: { en: "submitted", id: "terkirim" },
        ready_for_delivery: { en: "ready", id: "siap" },
        physically_received: { en: "received", id: "diterima" },
        rejected: { en: "rejected", id: "ditolak" },
        needs_revision: { en: "revision", id: "revisi" },
        returned: { en: "revision", id: "revisi" },

        awaiting_verification: { en: "verify", id: "verifikasi" },
        waiting_sample_id_assignment: { en: "waiting", id: "menunggu" },
        sample_id_pending_verification: { en: "verify", id: "verifikasi" },
        sample_id_approved_for_assignment: { en: "approved", id: "disetujui" },

        in_transit_to_collector: { en: "transit", id: "transit" },
        under_inspection: { en: "inspect", id: "inspeksi" },
        returned_to_admin: { en: "returned", id: "kembali" },

        intake_checklist_passed: { en: "intake", id: "intake" },
        intake_validated: { en: "validated", id: "validasi" },
    };

    const chosen = map[token]?.[isId ? "id" : "en"];
    return normalizeStatusWords(chosen ?? token);
}

function formatStatusLabel(raw?: string | null, locale = "en") {
    const token = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!token) return "-";
    return compactRequestStatusToken(token, locale);
}

type ModalCopy = {
    title: string;
    subtitle: string;
    confirm: string;
    nextLabel: string; // token, will be formatted in UI
};

function getModalCopy(t: (k: string, opt?: any) => string, action: Action): ModalCopy {
    if (action === "accept") {
        return {
            title: t("samples.requestStatusModal.title.accept", { defaultValue: "Accept Request" }),
            subtitle: t("samples.requestStatusModal.subtitle.accept", {
                defaultValue: "Accept this request so the client can proceed with delivery.",
            }),
            confirm: t("samples.requestStatusModal.buttons.confirmAccept", { defaultValue: "Accept" }),
            nextLabel: "ready_for_delivery",
        };
    }

    if (action === "reject") {
        return {
            title: t("samples.requestStatusModal.title.reject", { defaultValue: "Reject Request" }),
            subtitle: t("samples.requestStatusModal.subtitle.reject", {
                defaultValue: "Reject this request. A reason is required.",
            }),
            confirm: t("samples.requestStatusModal.buttons.confirmReject", { defaultValue: "Reject" }),
            nextLabel: "rejected",
        };
    }

    if (action === "return") {
        return {
            title: t("samples.requestStatusModal.title.return", { defaultValue: "Return Request" }),
            subtitle: t("samples.requestStatusModal.subtitle.return", {
                defaultValue: "Return this request to the client for revision. A note is required.",
            }),
            confirm: t("samples.requestStatusModal.buttons.confirmReturn", { defaultValue: "Return" }),
            nextLabel: "needs_revision",
        };
    }

    return {
        title: t("samples.requestStatusModal.title.received", { defaultValue: "Mark Physically Received" }),
        subtitle: t("samples.requestStatusModal.subtitle.received", {
            defaultValue: "Confirm the sample has been physically received at the lab.",
        }),
        confirm: t("samples.requestStatusModal.buttons.confirmReceived", { defaultValue: "Mark received" }),
        nextLabel: "physically_received",
    };
}

function unwrapEnvelope<T>(res: any): T {
    // Axios-ish: res.data, but some services already return payload
    let x = res?.data ?? res;
    for (let i = 0; i < 5; i++) {
        if (x && typeof x === "object" && "data" in x && (x as any).data != null) {
            // if envelope: {data: {...}} keep drilling
            const inner = (x as any).data;
            if (inner && typeof inner === "object" && "data" in inner) {
                x = inner;
                continue;
            }
        }
        break;
    }
    return x as T;
}

export const UpdateRequestStatusModal = (props: Props) => {
    const { t, i18n } = useTranslation();
    const locale = i18n.language || "en";

    const { open, sampleId, action, currentStatus, onClose, onUpdated } = props;
    const requestId = sampleId;

    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ✅ Accept requires test method
    const isAccept = action === "accept";
    const isReject = action === "reject";
    const isReturn = action === "return";
    const isReceived = action === "received";

    const [methods, setMethods] = useState<MethodRow[]>([]);
    const [methodsLoading, setMethodsLoading] = useState(false);
    const [methodsError, setMethodsError] = useState<string | null>(null);
    const [methodId, setMethodId] = useState<number | null>(null);
    const [methodQuery, setMethodQuery] = useState("");

    const copy = useMemo(() => getModalCopy(t, action), [t, action]);

    // Reset modal state when opened or action changes
    useEffect(() => {
        if (!open) return;
        setNote("");
        setError(null);
        setBusy(false);

        setMethodsError(null);
        setMethodId(null);
        setMethodQuery("");
    }, [open, action, requestId]);

    // ESC to close
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !busy) onClose();
        };

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [open, busy, onClose]);

    // Load methods when Accept modal opens
    useEffect(() => {
        if (!open) return;
        if (!isAccept) return;

        let mounted = true;

        async function load() {
            setMethodsLoading(true);
            setMethodsError(null);

            try {
                const res = await listMethods({ page: 1, per_page: 200, q: "" });
                const payload = unwrapEnvelope<any>(res);

                // payload expected: { status, message, data: { data: MethodRow[] } }
                const rows = (payload?.data?.data ?? payload?.data ?? payload) as MethodRow[];
                const list = Array.isArray(rows) ? rows : [];

                const active = list.filter((m) => !!m?.is_active);

                if (mounted) setMethods(active);
            } catch {
                if (mounted) setMethodsError(t("samples.requestStatusModal.method.error", { defaultValue: "Failed to load methods." }));
            } finally {
                if (mounted) setMethodsLoading(false);
            }
        }

        load();
        return () => {
            mounted = false;
        };
    }, [open, isAccept, t]);

    const filteredMethods = useMemo(() => {
        const q = methodQuery.trim().toLowerCase();
        if (!q) return methods;

        return methods.filter((m) => {
            const name = String(m?.name ?? "").toLowerCase();
            const code = String(m?.code ?? "").toLowerCase();
            const desc = String(m?.description ?? "").toLowerCase();
            return name.includes(q) || code.includes(q) || desc.includes(q);
        });
    }, [methods, methodQuery]);

    const canConfirm = useMemo(() => {
        if (!open) return false;
        if (busy) return false;
        if (!requestId) return false;

        if (isAccept) return Number(methodId) > 0;
        if (isReject || isReturn) return note.trim().length >= 1;

        return true;
    }, [open, busy, requestId, isAccept, methodId, isReject, isReturn, note]);

    const Icon = isReject || isReturn ? AlertTriangle : isReceived ? ClipboardCheck : Check;

    const iconTone =
        isReject ? "bg-rose-50 text-rose-700" : isReturn ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700";

    const noteLabel = useMemo(() => {
        if (isReject) {
            return t("samples.requestStatusModal.note.labelRequired", {
                defaultValue: "Rejection reason (required)",
            });
        }
        if (isReturn) {
            return t("samples.requestStatusModal.note.labelRequiredReturn", {
                defaultValue: "Return note (required)",
            });
        }
        return t("samples.requestStatusModal.note.labelOptional", {
            defaultValue: "Note (optional)",
        });
    }, [isReject, isReturn, t]);

    const notePlaceholder = useMemo(() => {
        if (isReject) {
            return t("samples.requestStatusModal.note.placeholderReject", {
                defaultValue: "Write the reason for rejection…",
            });
        }
        if (isReturn) {
            return t("samples.requestStatusModal.note.placeholderReturn", {
                defaultValue: "Write what the client should revise…",
            });
        }
        if (isReceived) {
            return t("samples.requestStatusModal.note.placeholderReceived", {
                defaultValue: "Optional note…",
            });
        }
        return t("samples.requestStatusModal.note.placeholderAccept", {
            defaultValue: "Optional note…",
        });
    }, [isReject, isReturn, isReceived, t]);

    const submit = async () => {
        if (!canConfirm || !requestId) return;

        try {
            setBusy(true);
            setError(null);

            const trimmedNote = note.trim();
            const noteToSend = isReject || isReturn ? trimmedNote : trimmedNote.length ? trimmedNote : null;

            await updateRequestStatus(requestId, action, noteToSend, isAccept ? methodId : null);

            onClose();
            onUpdated();
        } catch (err) {
            setError(
                getErrMsg(
                    err,
                    t("samples.requestStatusModal.errors.updateFailed", {
                        defaultValue: "Failed to update request status.",
                    })
                )
            );
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    const methodHelp = t("samples.requestStatusModal.method.help", {
        defaultValue: "This method will be saved to the sample record and used for the Letter of Order (LoO).",
    });

    return (
        <div className="lims-modal-backdrop p-4" role="dialog" aria-modal="true" aria-label={copy.title}>
            <div className="lims-modal-panel max-w-xl">
                <div className="lims-modal-header">
                    <div className={cx("h-9 w-9 rounded-full flex items-center justify-center", iconTone)} aria-hidden="true">
                        <Icon size={18} />
                    </div>

                    <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900">{copy.title}</div>
                        <div className="text-xs text-gray-500 mt-0.5 truncate">{copy.subtitle}</div>
                    </div>

                    <button
                        type="button"
                        className="ml-auto lims-icon-button"
                        aria-label={t("close", { defaultValue: "Close" })}
                        title={t("close", { defaultValue: "Close" })}
                        onClick={onClose}
                        disabled={busy}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="lims-modal-body">
                    {error ? (
                        <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                            {error}
                        </div>
                    ) : null}

                    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <ClipboardCheck size={14} />
                            <span className="font-semibold">{t("summary", { defaultValue: "Summary" })}</span>
                        </div>

                        <div className="mt-2 text-sm text-gray-900">
                            <span className="text-gray-600">{t("samples.requestStatusModal.summary.current", { defaultValue: "Current" })}:</span>{" "}
                            <span className="font-semibold">{formatStatusLabel(currentStatus, locale)}</span>
                            <span className="text-gray-600">
                                {" "}
                                • {t("samples.requestStatusModal.summary.next", { defaultValue: "Next" })}:
                            </span>{" "}
                            <span className="font-semibold">{formatStatusLabel(copy.nextLabel, locale)}</span>
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                            {t("samples.requestStatusModal.summary.requestId", { defaultValue: "Request ID" })}: {requestId ?? "-"}
                        </div>
                    </div>

                    {/* ✅ Accept: required Test Method */}
                    {isAccept ? (
                        <div className="mt-4">
                            <label className="block text-sm font-semibold text-gray-900">
                                {t("samples.requestStatusModal.method.labelRequired", { defaultValue: "Test method (required)" })}
                            </label>

                            {methodsError ? (
                                <div className="mt-2 text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
                                    {methodsError}
                                </div>
                            ) : null}

                            <div className="mt-2 grid gap-2">
                                <input
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    value={methodQuery}
                                    onChange={(e) => setMethodQuery(e.target.value)}
                                    placeholder={t("search", { defaultValue: "Search" })}
                                    disabled={busy || methodsLoading}
                                />

                                <select
                                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                    value={methodId ?? ""}
                                    onChange={(e) => {
                                        const v = Number(e.target.value);
                                        setMethodId(Number.isFinite(v) && v > 0 ? v : null);
                                    }}
                                    disabled={busy || methodsLoading}
                                >
                                    <option value="">
                                        {methodsLoading
                                            ? t("samples.requestStatusModal.method.loading", { defaultValue: "Loading methods…" })
                                            : t("samples.requestStatusModal.method.placeholderSelect", { defaultValue: "Select a test method…" })}
                                    </option>

                                    {filteredMethods.map((m) => {
                                        const label = `${m.code ? `${m.code} — ` : ""}${m.name}`;
                                        return (
                                            <option key={m.method_id} value={m.method_id}>
                                                {label}
                                            </option>
                                        );
                                    })}
                                </select>

                                <div className="text-[11px] text-gray-500">{methodHelp}</div>
                            </div>
                        </div>
                    ) : null}

                    {(isReject || isReturn || isReceived) ? (
                        <div className="mt-4">
                            <div className="flex items-baseline justify-between gap-3">
                                <label className="block text-sm font-semibold text-gray-900">{noteLabel}</label>
                                <div className="text-[11px] text-gray-500 tabular-nums">{note.trim().length}/500</div>
                            </div>

                            <textarea
                                className="mt-2 w-full min-h-[120px] rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-soft focus:border-transparent"
                                placeholder={notePlaceholder}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                disabled={busy}
                                maxLength={500}
                            />

                            {(isReject || isReturn) ? (
                                <div className="mt-2 text-[11px] text-gray-500">
                                    {t("samples.requestStatusModal.note.helpRequired", {
                                        defaultValue: "This note will be saved for audit and shown to relevant users.",
                                    })}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div className="mt-5 flex items-center justify-end gap-2">
                        <button type="button" onClick={onClose} disabled={busy} className="btn-outline disabled:opacity-50">
                            {t("cancel", { defaultValue: "Cancel" })}
                        </button>

                        <button
                            type="button"
                            disabled={!canConfirm}
                            onClick={submit}
                            className={cx(
                                (isReject || isReturn) ? "lims-btn-danger" : "lims-btn-primary",
                                "disabled:opacity-50 disabled:cursor-not-allowed"
                            )}
                            title={copy.confirm}
                        >
                            {busy ? t("processing", { defaultValue: "Processing…" }) : copy.confirm}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};