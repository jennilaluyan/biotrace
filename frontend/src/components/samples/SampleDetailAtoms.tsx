import type { ButtonHTMLAttributes } from "react";

export function cx(...arr: Array<string | false | null | undefined>) {
    return arr.filter(Boolean).join(" ");
}

export function StatusPill({ value }: { value?: string | null }) {
    const v = (value ?? "-").toLowerCase();
    const tones: Record<string, string> = {
        draft: "bg-slate-100 text-slate-700 border-slate-200",
        in_progress: "bg-blue-50 text-blue-700 border-blue-200",
        measured: "bg-emerald-50 text-emerald-700 border-emerald-200",
        failed: "bg-red-50 text-red-700 border-red-200",
        verified: "bg-purple-50 text-purple-700 border-purple-200",
        validated: "bg-indigo-50 text-indigo-700 border-indigo-200",

        submitted: "bg-blue-50 text-blue-700 border-blue-200",
        returned: "bg-amber-50 text-amber-800 border-amber-200",
        ready_for_delivery: "bg-slate-50 text-slate-700 border-slate-200",
        physically_received: "bg-emerald-50 text-emerald-700 border-emerald-200",
        intake_checklist_passed: "bg-emerald-50 text-emerald-700 border-emerald-200",
        intake_validated: "bg-indigo-50 text-indigo-700 border-indigo-200",
    };
    const tone = tones[v] || "bg-gray-50 text-gray-600 border-gray-200";

    return (
        <span
            title={value ?? "-"}
            className={cx("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border", tone)}
        >
            {value ?? "-"}
        </span>
    );
}

export function CrosscheckPill({ value }: { value?: string | null }) {
    const v = (value ?? "pending").toLowerCase();
    const tones: Record<string, string> = {
        pending: "bg-slate-50 text-slate-700 border-slate-200",
        passed: "bg-emerald-50 text-emerald-800 border-emerald-200",
        failed: "bg-red-50 text-red-800 border-red-200",
    };
    const tone = tones[v] || "bg-gray-50 text-gray-600 border-gray-200";
    const label = v === "passed" ? "Passed" : v === "failed" ? "Failed" : "Pending";

    return (
        <span className={cx("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold border", tone)}>
            {label}
        </span>
    );
}

export function SmallPrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    const { className, ...rest } = props;
    return (
        <button
            {...rest}
            className={cx(
                "lims-btn-primary",
                "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap",
                rest.disabled ? "opacity-60 cursor-not-allowed" : "",
                className
            )}
        />
    );
}

export function SmallButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
    const { className, ...rest } = props;
    return (
        <button
            {...rest}
            className={cx(
                "lims-btn",
                "px-3 py-1.5 text-xs rounded-xl whitespace-nowrap",
                rest.disabled ? "opacity-60 cursor-not-allowed" : "",
                className
            )}
        />
    );
}

export function IconRefresh({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={cx("h-4 w-4", className)}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M21 12a9 9 0 0 1-15.4 6.4" />
            <path d="M3 12a9 9 0 0 1 15.4-6.4" />
            <path d="M3 18v-5h5" />
            <path d="M21 6v5h-5" />
        </svg>
    );
}

export function WorkflowActionButton(props: {
    title: string;
    subtitle: string;
    onClick: () => void;
    disabled?: boolean;
    variant?: "primary" | "neutral";
    busy?: boolean;
}) {
    const { title, subtitle, onClick, disabled, variant = "neutral", busy } = props;

    const base =
        "w-full text-left rounded-2xl border px-4 py-3 transition " +
        "focus:outline-none focus:ring-2 focus:ring-offset-2 " +
        (disabled ? "opacity-60 cursor-not-allowed" : "hover:shadow-sm");

    const tone =
        variant === "primary"
            ? "bg-amber-50 border-amber-200 focus:ring-amber-300"
            : "bg-white border-slate-200 focus:ring-slate-300";

    return (
        <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${tone}`}>
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="font-semibold text-sm text-slate-900">{busy ? "Saving..." : title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{subtitle}</div>
                </div>
                <div className="text-slate-400 text-sm">{disabled ? "Locked" : "→"}</div>
            </div>
        </button>
    );
}
