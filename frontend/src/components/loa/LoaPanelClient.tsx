import { useEffect, useState } from "react";
import { loaService, type LetterOfOrder, type LoaStatus } from "../../services/loa";

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function fmtDateTime(iso?: string | null) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
}

function tone(raw?: string | null) {
    const s = (raw ?? "").toLowerCase();
    if (!s) return "bg-gray-100 text-gray-700";
    if (s === "draft") return "bg-gray-100 text-gray-700";
    if (s === "signed_internal") return "bg-indigo-100 text-indigo-700";
    if (s === "sent_to_client") return "bg-blue-100 text-blue-800";
    if (s === "client_signed") return "bg-emerald-100 text-emerald-800";
    if (s === "locked") return "bg-emerald-100 text-emerald-800";
    return "bg-gray-100 text-gray-700";
}

// Reuse the same extraction idea: client payload might nest LoA.
function coerceLoa(maybe: any): LetterOfOrder | null {
    if (!maybe) return null;

    const loa_id = Number(maybe?.loa_id ?? maybe?.loaId ?? maybe?.id ?? 0);
    if (!Number.isNaN(loa_id) && loa_id > 0) {
        return {
            loa_id,
            sample_id: Number(maybe?.sample_id ?? maybe?.sampleId ?? 0),
            loa_number: maybe?.loa_number ?? maybe?.number ?? null,
            loa_status: (maybe?.loa_status ?? maybe?.status ?? null) as LoaStatus | null,
            created_at: maybe?.created_at ?? maybe?.createdAt,
            updated_at: maybe?.updated_at ?? maybe?.updatedAt ?? null,
            signed_internal_at: maybe?.signed_internal_at ?? null,
            sent_to_client_at: maybe?.sent_to_client_at ?? null,
            client_signed_at: maybe?.client_signed_at ?? null,
            locked_at: maybe?.locked_at ?? null,
            pdf_url: maybe?.pdf_url ?? maybe?.pdfUrl ?? null,
        };
    }

    const keys = ["loa", "letter_of_order", "letterOfOrder", "loa_document", "loaDoc"];
    for (const k of keys) {
        const v = maybe?.[k];
        const coerced = coerceLoa(v);
        if (coerced) return coerced;
    }

    return null;
}

type Props = {
    /** The whole client request payload (so we can attempt to extract LoA from it) */
    requestPayload: any;
    /** Called after successful client sign, so parent can reload */
    onChanged?: () => void;
};

export function LoaPanelClient({ requestPayload, onChanged }: Props) {
    const [loa, setLoa] = useState<LetterOfOrder | null>(null);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);

    useEffect(() => {
        const extracted = coerceLoa(requestPayload);
        setLoa(extracted);
    }, [requestPayload]);

    const st = String(loa?.loa_status ?? "").toLowerCase();
    const canClientSign =
        !!loa?.loa_id &&
        (st === "sent_to_client" || st === "signed_internal" || st === "draft") && // UI-guidance only; backend enforces truth
        st !== "client_signed" &&
        st !== "locked";

    const safeErr = (e: any, fallback: string) =>
        e?.data?.message ?? e?.data?.error ?? e?.message ?? fallback;

    const clientSign = async () => {
        if (!loa?.loa_id) return;
        try {
            setWorking(true);
            setError(null);
            setInfo(null);
            const next = await loaService.clientSign(loa.loa_id);
            setLoa(next);
            setInfo("LoA signed successfully.");
            onChanged?.();
        } catch (e: any) {
            setError(safeErr(e, "Failed to sign LoA."));
        } finally {
            setWorking(false);
        }
    };

    const openPdf = () => {
        if (!loa?.pdf_url) return;
        window.open(loa.pdf_url, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <div className="text-sm font-semibold text-gray-900">Letter of Order (LoA)</div>
                    <div className="text-xs text-gray-500 mt-1">
                        After staff sends the LoA, you can sign it here. Backend decides eligibility.
                    </div>
                </div>

                <span
                    className={cx(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        tone(loa?.loa_status ?? null)
                    )}
                >
                    {loa?.loa_status ?? "—"}
                </span>
            </div>

            <div className="px-4 md:px-6 py-5 space-y-3">
                {!loa && (
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        No LoA yet. Please wait for backoffice to generate and send it.
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

                {loa && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                                <div className="text-xs text-gray-500">LoA ID</div>
                                <div className="font-semibold text-gray-900">{loa.loa_id}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">LoA Number</div>
                                <div className="font-semibold text-gray-900">{loa.loa_number ?? "—"}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Sent to client at</div>
                                <div className="text-gray-800">{fmtDateTime(loa.sent_to_client_at ?? null)}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500">Client signed at</div>
                                <div className="text-gray-800">{fmtDateTime(loa.client_signed_at ?? null)}</div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pt-1">
                            <button
                                type="button"
                                className={cx("lims-btn-primary", (!canClientSign || working) && "opacity-60 cursor-not-allowed")}
                                onClick={clientSign}
                                disabled={!canClientSign || working}
                                title="Sign LoA"
                            >
                                {working ? "Signing..." : "Sign LoA"}
                            </button>

                            {!!loa.pdf_url && (
                                <button type="button" className="lims-btn" onClick={openPdf} title="Open LoA PDF">
                                    Open PDF
                                </button>
                            )}

                            {st === "locked" && (
                                <span className="text-xs text-emerald-700 font-semibold">LoA is locked.</span>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
