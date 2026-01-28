import { useEffect, useMemo, useState } from "react";
import { looService, type LetterOfOrder, type LooStatus } from "../../services/loo";
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
    if (s === "client_signed" || s === "locked") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
}

function fmtDateTime(iso?: string | null) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

function coerceLoo(maybe: any): any | null {
    if (!maybe) return null;

    const directId = Number(maybe?.loo_id ?? maybe?.id ?? maybe?.loa_id ?? 0);
    if (!Number.isNaN(directId) && directId > 0) {
        return {
            loo_id: directId,
            sample_id: Number(maybe?.sample_id ?? maybe?.sampleId ?? 0),
            loo_number: maybe?.loo_number ?? maybe?.number ?? maybe?.loa_number ?? null,
            loo_status: (maybe?.loo_status ?? maybe?.status ?? maybe?.loa_status ?? null) as LooStatus | null,
            created_at: maybe?.created_at ?? maybe?.createdAt,
            updated_at: maybe?.updated_at ?? maybe?.updatedAt ?? null,
            signed_internal_at: maybe?.signed_internal_at ?? null,
            sent_to_client_at: maybe?.sent_to_client_at ?? null,
            client_signed_at: maybe?.client_signed_at ?? null,
            locked_at: maybe?.locked_at ?? null,
            pdf_url: maybe?.pdf_url ?? maybe?.pdfUrl ?? null,
        } satisfies LetterOfOrder;
    }

    const keys = ["loo", "letter_of_order", "letterOfOrder", "loo_document", "looDoc", "loa"];
    for (const k of keys) {
        const v = maybe?.[k];
        const coerced = coerceLoo(v);
        if (coerced) return coerced;
    }

    return null;
}

type Props = {
    sampleId: number;
    roleId: number | null;
    samplePayload?: any;
    onChanged?: () => void;
};

export function LooPanelStaff({ sampleId, roleId, samplePayload, onChanged }: Props) {
    const canManage = useMemo(() => {
        return roleId === ROLE_ID.ADMIN || roleId === ROLE_ID.OPERATIONAL_MANAGER || roleId === ROLE_ID.LAB_HEAD;
    }, [roleId]);

    const [loo, setLoo] = useState<any | null>(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    useEffect(() => {
        const extracted = coerceLoo(samplePayload);
        if (extracted) setLoo(extracted);
    }, [samplePayload]);

    const st = String(loo?.loo_status ?? "").toLowerCase();

    const safeErr = (e: any, fallback: string) =>
        e?.data?.message ?? e?.data?.error ?? e?.message ?? e?.response?.data?.message ?? fallback;

    const generate = async () => {
        if (!sampleId || Number.isNaN(sampleId)) return;
        try {
            setWorking(true);
            setError(null);
            setInfo(null);
            const next = await looService.generate(sampleId);
            setLoo(next);
            setInfo("LoO generated.");
            onChanged?.();
        } catch (e: any) {
            setError(safeErr(e, "Failed to generate LoO."));
        } finally {
            setWorking(false);
        }
    };

    const signatures = Array.isArray(loo?.signatures) ? loo.signatures : [];
    const isSigned = (roleCode: "OM" | "LH") =>
        signatures.some((s: any) => String(s?.role_code ?? "").toUpperCase() === roleCode && !!s?.signed_at);

    const canSignRole = (roleCode: "OM" | "LH") => {
        // only OM can sign OM, only LH can sign LH
        if (roleCode === "OM") return roleId === ROLE_ID.OPERATIONAL_MANAGER;
        if (roleCode === "LH") return roleId === ROLE_ID.LAB_HEAD;
        return false;
    };

    const signAs = async (roleCode: "OM" | "LH") => {
        if (!loo?.loo_id) return;
        if (!canSignRole(roleCode)) return;
        if (isSigned(roleCode)) return;

        try {
            setWorking(true);
            setError(null);
            setInfo(null);
            const next = await looService.signInternal(loo.loo_id, roleCode);
            setLoo(next);
            setInfo(`${roleCode} signed.`);
            onChanged?.();
        } catch (e: any) {
            setError(safeErr(e, `Failed to sign as ${roleCode}.`));
        } finally {
            setWorking(false);
        }
    };

    const sendToClient = async () => {
        if (!loo?.loo_id) return;
        try {
            setWorking(true);
            setError(null);
            setInfo(null);
            const next = await looService.sendToClient(loo.loo_id);
            setLoo(next);
            setInfo("LoO sent to client.");
            onChanged?.();
        } catch (e: any) {
            setError(safeErr(e, "Failed to send LoO to client."));
        } finally {
            setWorking(false);
        }
    };

    const openPdf = () => {
        if (!loo?.pdf_url) return;
        window.open(loo.pdf_url, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-bold text-gray-900">Letter of Order (LoO)</div>
                    <div className="text-xs text-gray-500 mt-1">
                        Backoffice workflow: generate → internal sign → send to client → client sign (locked).
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Status</span>
                    <span
                        className={cx(
                            "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border",
                            toStatusTone(loo?.loo_status ?? null)
                        )}
                        title={loo?.loo_status ?? "-"}
                    >
                        {loo?.loo_status ?? "—"}
                    </span>
                </div>
            </div>

            <div className="px-5 py-4 space-y-3">
                {!canManage && (
                    <div className="text-xs text-gray-500 italic">
                        LoO actions are available for Admin / Operational Manager / Lab Head.
                    </div>
                )}

                {error && (
                    <div className="text-sm text-red-700 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">{error}</div>
                )}

                {info && (
                    <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                        {info}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                        <div className="text-xs text-gray-500">LoO ID</div>
                        <div className="font-semibold text-gray-900">{loo?.loo_id ?? "—"}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">LoO Number</div>
                        <div className="font-semibold text-gray-900">{loo?.loo_number ?? "—"}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">Created</div>
                        <div className="text-gray-800">{fmtDateTime(loo?.created_at)}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">Updated</div>
                        <div className="text-gray-800">{fmtDateTime(loo?.updated_at ?? null)}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">Signed internal at</div>
                        <div className="text-gray-800">{fmtDateTime(loo?.signed_internal_at ?? null)}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">Sent to client at</div>
                        <div className="text-gray-800">{fmtDateTime(loo?.sent_to_client_at ?? null)}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">Client signed at</div>
                        <div className="text-gray-800">{fmtDateTime(loo?.client_signed_at ?? null)}</div>
                    </div>

                    <div>
                        <div className="text-xs text-gray-500">Locked at</div>
                        <div className="text-gray-800">{fmtDateTime(loo?.locked_at ?? null)}</div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                    <button
                        type="button"
                        className={cx("lims-btn-primary", working && "opacity-60 cursor-not-allowed")}
                        onClick={generate}
                        disabled={working}
                    >
                        {working ? "Working..." : loo?.loo_id ? "Re-generate LoO" : "Generate LoO"}
                    </button>

                    {!!loo?.loo_id && (
                        <>
                            <div className="mt-3 space-y-2">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={isSigned("OM")}
                                        disabled={working || !canSignRole("OM") || isSigned("OM")}
                                        onChange={() => signAs("OM")}
                                    />
                                    <span className={canSignRole("OM") ? "" : "text-gray-400"}>
                                        OM Sign {isSigned("OM") ? "(signed)" : ""}
                                    </span>
                                </label>

                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={isSigned("LH")}
                                        disabled={working || !canSignRole("LH") || isSigned("LH")}
                                        onChange={() => signAs("LH")}
                                    />
                                    <span className={canSignRole("LH") ? "" : "text-gray-400"}>
                                        LH Sign {isSigned("LH") ? "(signed)" : ""}
                                    </span>
                                </label>

                                <div className="text-xs text-gray-500">
                                    Internal signatures are independent — one can sign without waiting for the other.
                                </div>
                            </div>

                            <button
                                type="button"
                                className={cx("lims-btn", working && "opacity-60 cursor-not-allowed")}
                                onClick={sendToClient}
                                disabled={working}
                            >
                                Send to Client
                            </button>
                        </>
                    )}

                    {!!loo?.pdf_url && (
                        <button type="button" className="lims-btn" onClick={openPdf}>
                            Open PDF
                        </button>
                    )}
                </div>

                {st === "locked" && (
                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-2 rounded-xl">
                        LoO is locked. Test assignment can be unlocked by this status.
                    </div>
                )}
            </div>
        </div>
    );
}
