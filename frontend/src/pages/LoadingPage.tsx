import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type Props = {
    /**
     * Extra context for screen readers (not shown visually).
     * Useful when a loader appears during auth/session restore.
     */
    a11yHint?: string;
};

export default function LoadingPage(props: Props) {
    const { t } = useTranslation();

    const a11yHint = useMemo(
        () =>
            props.a11yHint ??
            t("loading.a11yHint", { defaultValue: "Please wait while the application loads." }),
        [props.a11yHint, t]
    );

    return (
        <div className="min-h-screen bg-cream flex items-center justify-center px-6 overflow-hidden">
            <style>
                {`
                /* * Biomolecular DNA Helix Animation (Horizontal, Straight, Green & Red)
                 */
                .dna-container {
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    justify-content: center;
                    gap: 16px;
                    perspective: 800px;
                    /* Menghapus transform: rotate(-10deg) agar posisinya lurus / tidak miring */
                }

                .dna-pair {
                    position: relative;
                    width: 16px;
                    height: 80px;
                    transform-style: preserve-3d;
                    animation: dna-spin 2.2s linear infinite;
                }

                .dna-line {
                    position: absolute;
                    left: 50%;
                    top: 10px;
                    bottom: 10px;
                    width: 2px;
                    background: #94a3b8; /* Warna abu-abu netral untuk garis penghubung */
                    opacity: 0.4;
                    transform: translateX(-50%);
                }

                .dna-dot {
                    position: absolute;
                    left: 50%;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    transform: translateX(-50%);
                }

                .dna-dot.top {
                    top: 0;
                    background: #8DC63F; /* Hijau logo BIOTRACE */
                    box-shadow: 0 0 10px #8DC63F;
                    animation: dna-pulse-top 2.2s ease-in-out infinite;
                }

                .dna-dot.bottom {
                    bottom: 0;
                    background: #C60B2E; /* Merah sesuai gambar referensi */
                    box-shadow: 0 0 10px #C60B2E;
                    animation: dna-pulse-bottom 2.2s ease-in-out infinite;
                }

                /* Staggered Delays for the Helix effect (10 pasang DNA) */
                .dna-pair:nth-child(1), .dna-pair:nth-child(1) .dna-dot { animation-delay: -0.0s; }
                .dna-pair:nth-child(2), .dna-pair:nth-child(2) .dna-dot { animation-delay: -0.22s; }
                .dna-pair:nth-child(3), .dna-pair:nth-child(3) .dna-dot { animation-delay: -0.44s; }
                .dna-pair:nth-child(4), .dna-pair:nth-child(4) .dna-dot { animation-delay: -0.66s; }
                .dna-pair:nth-child(5), .dna-pair:nth-child(5) .dna-dot { animation-delay: -0.88s; }
                .dna-pair:nth-child(6), .dna-pair:nth-child(6) .dna-dot { animation-delay: -1.1s; }
                .dna-pair:nth-child(7), .dna-pair:nth-child(7) .dna-dot { animation-delay: -1.32s; }
                .dna-pair:nth-child(8), .dna-pair:nth-child(8) .dna-dot { animation-delay: -1.54s; }
                .dna-pair:nth-child(9), .dna-pair:nth-child(9) .dna-dot { animation-delay: -1.76s; }
                .dna-pair:nth-child(10), .dna-pair:nth-child(10) .dna-dot { animation-delay: -1.98s; }

                @keyframes dna-spin {
                    0% { transform: rotateX(0deg); }
                    100% { transform: rotateX(360deg); }
                }

                @keyframes dna-pulse-top {
                    0%, 100% { transform: translateX(-50%) scale(1); opacity: 1; }
                    50% { transform: translateX(-50%) scale(0.6); opacity: 0.4; }
                }

                @keyframes dna-pulse-bottom {
                    0%, 100% { transform: translateX(-50%) scale(0.6); opacity: 0.4; }
                    50% { transform: translateX(-50%) scale(1); opacity: 1; }
                }

                /* Soft glowing background aura (Campuran Hijau) */
                .dna-aura {
                    position: absolute;
                    width: 250px;
                    height: 120px;
                    background: radial-gradient(circle, #8DC63F 0%, transparent 60%);
                    opacity: 0.1;
                    filter: blur(20px);
                    animation: aura-pulse 3s ease-in-out infinite alternate;
                }

                @keyframes aura-pulse {
                    0% { transform: scale(0.9); opacity: 0.05; }
                    100% { transform: scale(1.1); opacity: 0.15; }
                }

                @media (prefers-reduced-motion: reduce) {
                    .dna-pair, .dna-dot, .dna-aura { animation: none !important; }
                }
                `}
            </style>

            <div
                className="relative flex flex-col items-center justify-center"
                role="status"
                aria-live="polite"
                aria-label={a11yHint}
            >
                <div className="dna-aura" aria-hidden="true" />

                <div className="dna-container" aria-hidden="true">
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className="dna-pair">
                            <div className="dna-line" />
                            <div className="dna-dot top" />
                            <div className="dna-dot bottom" />
                        </div>
                    ))}
                </div>

                <span className="sr-only">{a11yHint}</span>
            </div>
        </div>
    );
}