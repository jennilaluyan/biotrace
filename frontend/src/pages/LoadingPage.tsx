import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TestTube2 } from "lucide-react";

type Props = {
    /** Short label shown under the loader. Keep it minimal. */
    label?: string;
    /**
     * Extra context for screen readers (not shown visually).
     * Useful when a loader appears during auth/session restore.
     */
    a11yHint?: string;
};

export default function LoadingPage(props: Props) {
    const { t } = useTranslation();

    const label = useMemo(
        () => props.label ?? t("loading.label", { defaultValue: "Loading…" }),
        [props.label, t]
    );

    const a11yHint = useMemo(
        () =>
            props.a11yHint ??
            t("loading.a11yHint", { defaultValue: "Please wait while the application loads." }),
        [props.a11yHint, t]
    );

    return (
        <div className="min-h-screen bg-cream flex items-center justify-center px-6">
            <style>
                {`
                .bt-loader {
                    width: 92px;
                    height: 92px;
                    position: relative;
                    display: grid;
                    place-items: center;
                }

                /* Soft lab-ish backdrop (subtle grid + glow) */
                .bt-bg {
                    position: absolute;
                    inset: -22px;
                    border-radius: 28px;
                    background:
                        radial-gradient(closest-side, rgba(0,0,0,.06), transparent 70%),
                        linear-gradient(to right, rgba(0,0,0,.03) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(0,0,0,.03) 1px, transparent 1px);
                    background-size: auto, 18px 18px, 18px 18px;
                    filter: blur(.2px);
                }

                /* Conic ring using currentColor (so Tailwind text-primary controls it) */
                .bt-ring {
                    position: absolute;
                    inset: 6px;
                    border-radius: 999px;
                    background: conic-gradient(from 0deg, currentColor 0 62deg, transparent 62deg 360deg);
                    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 0);
                    mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 0);
                    opacity: .55;
                    animation: bt-spin 1.05s linear infinite;
                }

                /* Inner glassy disc */
                .bt-disc {
                    position: absolute;
                    inset: 18px;
                    border-radius: 999px;
                    background: rgba(255,255,255,.75);
                    border: 1px solid rgba(0,0,0,.06);
                    box-shadow: 0 10px 30px rgba(0,0,0,.06);
                }

                /* Tiny “molecules” orbiting */
                .bt-orbit {
                    position: absolute;
                    inset: 0;
                    animation: bt-spin 1.8s linear infinite;
                }
                .bt-dot {
                    position: absolute;
                    width: 6px;
                    height: 6px;
                    border-radius: 999px;
                    background: currentColor;
                    opacity: .35;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                }
                .bt-dot:nth-child(2) { top: auto; bottom: 12px; opacity: .22; width: 7px; height: 7px; }
                .bt-dot:nth-child(3) { top: 50%; left: 12px; transform: translateY(-50%); opacity: .18; width: 5px; height: 5px; }

                .bt-icon {
                    position: relative;
                    z-index: 2;
                    animation: bt-bob 1.25s ease-in-out infinite;
                    opacity: .8;
                }

                @keyframes bt-spin { to { transform: rotate(360deg); } }
                @keyframes bt-bob {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-4px); }
                }

                @media (prefers-reduced-motion: reduce) {
                    .bt-ring, .bt-orbit, .bt-icon { animation: none !important; }
                }
                `}
            </style>

            <div className="flex flex-col items-center">
                <div
                    className="text-primary bt-loader"
                    role="status"
                    aria-live="polite"
                    aria-label={a11yHint}
                >
                    <div className="bt-bg" aria-hidden="true" />
                    <div className="bt-ring" aria-hidden="true" />
                    <div className="bt-disc" aria-hidden="true" />
                    <div className="bt-orbit" aria-hidden="true">
                        <div className="bt-dot" />
                        <div className="bt-dot" />
                        <div className="bt-dot" />
                    </div>

                    <TestTube2 className="bt-icon h-9 w-9" aria-hidden="true" />
                    <span className="sr-only">{a11yHint}</span>
                </div>

                <div className="mt-4 text-sm text-gray-600">{label}</div>
            </div>
        </div>
    );
}