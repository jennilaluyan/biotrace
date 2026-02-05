import { useMemo } from "react";
import { ClipboardCheck, FlaskConical, ShieldCheck, XCircle } from "lucide-react";
import type { Sample } from "../../../services/samples";

type Props = {
    sample: Sample;
    reagentRequestStatus?: string | null;
};

// local UI helpers (no external ./ui import)
function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function normalizeLabel(input?: string | null) {
    const s = String(input ?? "").trim();
    if (!s) return "-";
    if (s.includes("-") && /[A-Za-z]/.test(s) && /\d/.test(s)) return s; // keep codes like BML-034

    return s
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

function toneFor(label: string) {
    const s = label;

    if (s.includes("approved") || s.includes("validated") || s.includes("verified") || s.includes("reported")) {
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
    }
    if (s.includes("submitted") || s.includes("testing") || s.includes("in progress") || s.includes("received")) {
        return "bg-amber-50 text-amber-800 border-amber-200";
    }
    if (s.includes("failed") || s.includes("denied") || s.includes("rejected")) {
        return "bg-red-50 text-red-700 border-red-200";
    }
    return "bg-gray-50 text-gray-700 border-gray-200";
}

function iconFor(label: string) {
    if (label.includes("reagent")) return <ClipboardCheck size={16} />;
    if (label.includes("crosscheck")) return <ShieldCheck size={16} />;
    if (label.includes("failed") || label.includes("denied") || label.includes("rejected")) return <XCircle size={16} />;
    return <FlaskConical size={16} />;
}

function getSummaryStatus(sample: any, rrStatus?: string | null) {
    const rr = normalizeLabel(rrStatus);
    if (rr) return `reagent ${rr}`;

    const cs = normalizeLabel(sample?.crosscheck_status ?? "pending");
    if (cs === "failed") return "crosscheck failed";
    if (cs === "passed") return "crosscheck passed";

    const current = normalizeLabel(sample?.current_status ?? "");
    if (current) return current;

    const statusEnum = normalizeLabel(sample?.status_enum ?? "");
    if (statusEnum) return statusEnum;

    return "pending";
}

export function SampleStatusCard({ sample, reagentRequestStatus }: Props) {
    const label = useMemo(() => getSummaryStatus(sample as any, reagentRequestStatus ?? null), [sample, reagentRequestStatus]);
    const tone = toneFor(label);
    const icon = iconFor(label);

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
                <div>
                    <div className="text-sm font-bold text-gray-900">Status</div>
                </div>
                <span className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border", tone)}>
                    {icon}
                    {label}
                </span>
            </div>
        </div>
    );
}
