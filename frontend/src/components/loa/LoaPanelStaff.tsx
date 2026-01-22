import { useEffect, useMemo, useState } from "react";
import { loaService, type LetterOfOrder, type LoaStatus } from "../../services/loa";
import { ROLE_ID } from "../../utils/roles";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function toStatusTone(raw?: string | null) {
    const s = (raw ?? "").toLowerCase();
    if (!s) return "bg-gray-50 text-gray-700 border-gray-200";
    if (s === "draft") return "bg-slate-50 text-slate-700 border-slate-200";
    if (s === "signed_internal") return "bg-indigo-50 text-indigo-700 border-indigo-200";
    if (s === "sent_to_client") return "bg-blue-50 text-blue-700 border-blue-200";
    if (s === "client_signed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "locked") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
}

function fmtDateTime(iso?: string | null) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

// Try to extract LoA from whatever backend attaches to sample payload.
function coerceLoa(maybe: any): LetterOfOrder | null {
    if (!maybe) return null;

    // direct match
    if (typeof maybe === "object" && (maybe.loa_id || maybe.id) && (maybe.sample_id || maybe.sampleId || true)) {
        const loa_id = Number(maybe.loa_id ?? maybe.id);
        if (!Number.isNaN(loa_id) && loa_id > 0) {
            return {
                loa_id,
                sample_id: Number(maybe.sample_id ?? maybe.sampleId ?? 0),
                loa_number: maybe.loa_number ?? maybe.number ?? null,
                loa_status: (maybe.loa_status ?? maybe.status ?? null) as LoaStatus | null,
                created_at: maybe.created_at ?? maybe.createdAt,
                updated_at: maybe.updated_at ?? maybe.updatedAt ?? null,
                signed_internal_at: maybe.signed_internal_at ?? null,
                sent_to_client_at: maybe.sent_to_client_at ?? null,
                client_signed_at: maybe.client_signed_at ?? null,
                locked_at: maybe.locked_at ?? null,
                pdf_url: maybe.pdf_url ?? maybe.pdfUrl ?? null,
            };
        }
    }

    // nested keys
    const keys = ["loa", "letter_of_order", "letterOfOrder", "loa_document", "loaDoc"];
    for (const k of keys) {
        const v = maybe?.[k];
        const coerced = coerceLoa(v);
        if (coerced) return coerced;
    }

    // flattened fields
    const loa_id = Number(maybe?.loa_id ?? maybe?.loaId ?? 0);
    if (!Number.isNaN(loa_id) && loa_id > 0) {
        return {
            loa_id,
            sample_id: Number(maybe?.sample_id ?? maybe?.sampleId ?? 0),
            loa_number: maybe?.loa_number ?? null,
            loa_status: (maybe?.loa_status ?? null) as LoaStatus | null,
            created_at: maybe?.created_at,
            updated_at: maybe?.updated_at ?? null,
            signed_internal_at: maybe?.signed_internal_at ?? null,
            sent_to_client_at: maybe?.sent_to_client_at ?? null,
            client_signed_at: maybe?.client_signed_at ?? null,
            locked_at: maybe?.locked_at ?? null,
            pdf_url: maybe?.pdf_url ?? null,
        };
    }

    return null;
}

type Props = {
    sampleId: number;
    roleId: number | null;
    /** sample payload (optional) — used to try extract LoA if backend already sends it */
    samplePayload?: any;
    /** optional callback after any successful action (so parent can reload sample detail) */
    onChanged?: () => void;
};

export function LoaPanelStaff({ sampleId, roleId, samplePayload, onChanged }: Props) {
    const canManage = useMemo(() => {
        return roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.OPERATIONAL_MANAGER || roleId === ROLE_ID.LAB_HEAD;
    }, [roleId]);

    const [loa, setLoa] = useState<LetterOfOrder | null>(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    useEffect(() => {
        // refresh local LoA if sample payload changes (e.g. parent reload)
        const extracted = coerceLoa(samplePayload);
        if (extracted) setLoa(extracted);
    }, [samplePayload]);

    const loaStatus = String(loa?.loa_status ?? "").toLowerCase();

    const showGenerate = canManage;
    const showSignInternal = canManage && !!loa?.loa_id;
    const showSend = canManage && !!loa?.loa_id;

    const openPdf = () => {
        if (!loa?.pdf_url) return;
        window.open(loa.pdf_url, "_blank", "noopener,noreferrer");
    };

    const safeErr = (e: any, fallback: string) =>
        e?.data?.message ?? e?.data?.error ?? e?.message ?? fallback;

    const generate = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        try {
            setWorking(true);
            setError(null);
            setInfo(null);
            const next = await loaService.generate(sampleId);
            setLoa(next);
            setInfo("LoA generated.");
            onChanged?.();
        } catch (e: any) {
            setError(safeErr(e, "Failed to generate LoA."));
        } finally {
            setWorking(false);
        }
    };

    const signInternal = async () => {
        if (!loa?.loa_id) return;
        try {
            setWorking(true);
            setError(null);
            setInfo(null);
            const next = await loaService.signInternal(loa.loa_id);
            setLoa(next);
            setInfo("LoA signed internally.");
            onChanged?.();
        } catch (e: any) {
            setError(safeErr(e, "Failed to sign LoA internally."));
        } finally {
            setWorking(false);
        }
    };

    const sendToClient = async () => {
        if (!loa?.loa_id) return;
        try {
            setWorking(true);
            setError(null);
            setInfo(null);
            const next = await loaService.sendToClient(loa.loa_id);
            setLoa(next);
            setInfo("LoA sent to client.");
            onChanged?.();
        } catch (e: any) {
            setError(safeErr(e, "Failed to send LoA to client."));
        } finally {
            setWorking(false);
        }
    };

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-bold text-gray-900">Letter of Order (LoA)</div>
                    <div className="text-xs text-gray-500 mt-1">
                        Backoffice workflow: generate → internal sign → send to client. Backend remains source of truth.
                    </div>
                </div>

                {/* Status pill */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Status</span>
                    <span
                        className={cx(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border",
                            toStatusTone(loa?.loa_status ?? null)
                        )}
                        title={loa?.loa_status ?? "-"}
                    >
                        {loa?.loa_status ?? "—"}
                    </span>
                </div>
            </div>

            <div className="px-5 py-4 space-y-3">
                {!canManage && (
                    <div className="text-xs text-gray-500 italic">
                        LoA actions are available for Admin / Operational Manager / Lab Head.
                    </div>
                )}

                {error && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">
                        {error}
                    </div>
                )}
                {info && (
                    <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                        {info}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                        <div className="text-xs text-gray-500">LoA ID</div>
                        <div className="font-semibold text-gray-900">{loa?.loa_id ?? "—"}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">LoA Number</div>
                        <div className="font-semibold text-gray-900">{loa?.loa_number ?? "—"}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">Created</div>
                        <div className="text-gray-800">{fmtDateTime(loa?.created_at)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">Updated</div>
                        <div className="text-gray-800">{fmtDateTime(loa?.updated_at ?? null)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">Signed internal at</div>
                        <div className="text-gray-800">{fmtDateTime(loa?.signed_internal_at ?? null)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">Sent to client at</div>
                        <div className="text-gray-800">{fmtDateTime(loa?.sent_to_client_at ?? null)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">Client signed at</div>
                        <div className="text-gray-800">{fmtDateTime(loa?.client_signed_at ?? null)}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500">Locked at</div>
                        <div className="text-gray-800">{fmtDateTime(loa?.locked_at ?? null)}</div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                    {showGenerate && (
                        <button
                            type="button"
                            className={cx("lims-btn-primary", working && "opacity-60 cursor-not-allowed")}
                            onClick={generate}
                            disabled={working}
                            title="Generate LoA for this sample"
                        >
                            {working ? "Working..." : loa?.loa_id ? "Re-generate LoA" : "Generate LoA"}
                        </button>
                    )}

                    {showSignInternal && (
                        <button
                            type="button"
                            className={cx("lims-btn", working && "opacity-60 cursor-not-allowed")}
                            onClick={signInternal}
                            disabled={working}
                            title="Sign LoA internally"
                        >
                            Sign Internal
                        </button>
                    )}

                    {showSend && (
                        <button
                            type="button"
                            className={cx("lims-btn", working && "opacity-60 cursor-not-allowed")}
                            onClick={sendToClient}
                            disabled={working}
                            title="Send LoA to client"
                        >
                            Send to Client
                        </button>
                    )}

                    {!!loa?.pdf_url && (
                        <button type="button" className="lims-btn" onClick={openPdf} title="Open LoA PDF">
                            Open PDF
                        </button>
                    )}
                </div>

                {loaStatus === "locked" && (
                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                        LoA is locked. (Step 9 will use this to gate test assignment.)
                    </div>
                )}
            </div>
        </div>
    );
}
