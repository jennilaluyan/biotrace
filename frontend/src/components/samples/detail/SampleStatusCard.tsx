import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, FlaskConical, ShieldCheck, XCircle } from "lucide-react";
import type { Sample } from "../../../services/samples";

type Props = {
    sample: Sample;
    reagentRequestStatus?: string | null;
};

function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

function normalizeLabel(input?: string | null) {
    const s = String(input ?? "").trim();
    if (!s) return "-";
    if (s.includes("-") && /[A-Za-z]/.test(s) && /\d/.test(s)) return s;

    return s
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase());
}

type Summary = {
    kind: "reagent" | "request" | "crosscheck" | "sample";
    raw: string;
    display: string;
    tone: "success" | "warning" | "danger" | "neutral";
};

function toneFromRaw(raw: string): Summary["tone"] {
    const s = raw.toLowerCase();
    if (s.includes("approved") || s.includes("validated") || s.includes("verified") || s.includes("reported") || s.includes("passed")) {
        return "success";
    }
    if (s.includes("submitted") || s.includes("testing") || s.includes("in progress") || s.includes("received") || s.includes("pending") || s.includes("transit")) {
        return "warning";
    }
    if (s.includes("failed") || s.includes("denied") || s.includes("rejected")) {
        return "danger";
    }
    return "neutral";
}

function toneClass(tone: Summary["tone"]) {
    if (tone === "success") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (tone === "warning") return "bg-amber-50 text-amber-800 border-amber-200";
    if (tone === "danger") return "bg-red-50 text-red-700 border-red-200";
    return "bg-gray-50 text-gray-700 border-gray-200";
}

export function SampleStatusCard({ sample, reagentRequestStatus }: Props) {
    const { t } = useTranslation();

    const summary = useMemo<Summary>(() => {
        const s: any = sample;

        const rrRaw = String(reagentRequestStatus ?? "").trim();
        if (rrRaw) {
            const raw = rrRaw.toLowerCase();
            return {
                kind: "reagent",
                raw,
                display: `${t("samples.status.reagent")}: ${normalizeLabel(raw)}`,
                tone: toneFromRaw(raw),
            };
        }

        const rs = String(s?.request_status ?? "").trim().toLowerCase();
        if (rs) {
            const special =
                rs === "in_transit_to_analyst"
                    ? t("samples.status.inTransitToAnalyst")
                    : rs === "received_by_analyst"
                        ? t("samples.status.receivedByAnalyst")
                        : normalizeLabel(rs);

            return {
                kind: "request",
                raw: rs,
                display: special,
                tone: toneFromRaw(rs),
            };
        }

        const csRaw = String(s?.crosscheck_status ?? "").trim().toLowerCase();
        if (csRaw) {
            const cs =
                csRaw === "passed"
                    ? t("samples.status.crosscheckPassed")
                    : csRaw === "failed"
                        ? t("samples.status.crosscheckFailed")
                        : csRaw === "pending"
                            ? t("samples.status.crosscheckPending")
                            : normalizeLabel(csRaw);

            return {
                kind: "crosscheck",
                raw: csRaw,
                display: `${t("samples.status.crosscheck")}: ${cs}`,
                tone: toneFromRaw(csRaw),
            };
        }

        const currentRaw = String(s?.current_status ?? "").trim();
        if (currentRaw) {
            const display = normalizeLabel(currentRaw);
            return { kind: "sample", raw: currentRaw, display, tone: toneFromRaw(currentRaw) };
        }

        const statusEnumRaw = String(s?.status_enum ?? "").trim();
        if (statusEnumRaw) {
            const display = normalizeLabel(statusEnumRaw);
            return { kind: "sample", raw: statusEnumRaw, display, tone: toneFromRaw(statusEnumRaw) };
        }

        return { kind: "sample", raw: "pending", display: t("samples.status.pending"), tone: "neutral" };
    }, [sample, reagentRequestStatus, t]);

    const icon = summary.kind === "reagent"
        ? <ClipboardCheck size={16} />
        : summary.kind === "crosscheck"
            ? <ShieldCheck size={16} />
            : summary.tone === "danger"
                ? <XCircle size={16} />
                : <FlaskConical size={16} />;

    return (
        <div className="rounded-2xl border border-gray-100 bg-white shadow-[0_4px_14px_rgba(15,23,42,0.04)] overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-gray-900">{t("samples.status.title")}</div>

                <span className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border", toneClass(summary.tone))}>
                    {icon}
                    {summary.display}
                </span>
            </div>
        </div>
    );
}
