import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Home } from "lucide-react";

export const NotFoundPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const title = useMemo(
        () => t("notFound.title", { defaultValue: "Sequence Not Found" }),
        [t]
    );

    const message = useMemo(
        () => t("notFound.message", { defaultValue: "The biomolecular data or page you're looking for has anomalies or doesn't exist." }),
        [t]
    );

    return (
        <div className="min-h-screen bg-cream flex items-center justify-center px-6 py-10 relative overflow-hidden">
            <style>
                {`
                /* Advanced Biomolecular Lottie-style CSS Animation */
                .nf-bg-grid {
                    position: absolute;
                    inset: 0;
                    background:
                        radial-gradient(circle at 15% 50%, rgba(0,0,0,.04), transparent 30%),
                        radial-gradient(circle at 85% 30%, rgba(0,0,0,.03), transparent 35%),
                        linear-gradient(to right, rgba(0,0,0,.02) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(0,0,0,.02) 1px, transparent 1px);
                    background-size: auto, auto, 40px 40px, 40px 40px;
                    pointer-events: none;
                }

                .anim-container {
                    position: relative;
                    width: 140px;
                    height: 140px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                /* Floating Core Element (Broken Flask) */
                .flask-float {
                    animation: float-main 4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                    transform-origin: center;
                }

                /* Escaping Hexagons (Chemical Bonds) */
                .hex-particle {
                    position: absolute;
                    opacity: 0;
                    transform-origin: center;
                }
                .hex-1 { animation: hex-escape 3.5s cubic-bezier(0.2, 0.8, 0.2, 1) infinite; }
                .hex-2 { animation: hex-escape 4.2s cubic-bezier(0.2, 0.8, 0.2, 1) infinite 1.2s; }
                .hex-3 { animation: hex-escape 3.8s cubic-bezier(0.2, 0.8, 0.2, 1) infinite 2.5s; }

                /* Leaking Drop */
                .drip {
                    animation: drop-fall 2.5s ease-in infinite;
                    transform-origin: top;
                }

                /* DNA Strand background floating */
                .bg-dna {
                    animation: dna-drift 8s linear infinite alternate;
                }

                @keyframes float-main {
                    0%, 100% { transform: translateY(0px) rotate(-5deg); }
                    50% { transform: translateY(-12px) rotate(2deg); }
                }

                @keyframes hex-escape {
                    0% { transform: translate(0, 0) scale(0) rotate(0deg); opacity: 0; }
                    20% { opacity: 0.8; transform: translate(15px, -20px) scale(1) rotate(45deg); }
                    80% { opacity: 0.5; transform: translate(40px, -60px) scale(0.8) rotate(120deg); }
                    100% { transform: translate(50px, -80px) scale(0) rotate(180deg); opacity: 0; }
                }

                @keyframes drop-fall {
                    0% { transform: translateY(0) scale(1); opacity: 0; }
                    10% { opacity: 1; transform: translateY(5px) scale(1.1); }
                    80% { transform: translateY(45px) scale(0.8); opacity: 0.8; }
                    100% { transform: translateY(55px) scale(0.5); opacity: 0; }
                }

                @keyframes dna-drift {
                    0% { transform: translate(-10px, -10px) rotate(-10deg) scale(0.9); }
                    100% { transform: translate(10px, 10px) rotate(5deg) scale(1.1); }
                }

                @media (prefers-reduced-motion: reduce) {
                    .flask-float, .hex-particle, .drip, .bg-dna { animation: none !important; }
                }
                `}
            </style>

            <div className="nf-bg-grid" aria-hidden="true" />

            <div className="w-full max-w-2xl relative z-10">
                <div className="rounded-[2rem] border border-black/5 bg-white/80 backdrop-blur-md shadow-xl overflow-hidden">
                    <div className="p-8 sm:p-12">
                        <div className="flex flex-col sm:flex-row items-center gap-10">

                            {/* Rich Lottie-style Biomolecular SVG Animation */}
                            <div className="anim-container shrink-0 text-primary">
                                {/* Background out-of-focus DNA */}
                                <svg className="bg-dna absolute -left-4 -top-4 w-16 h-16 opacity-10" viewBox="0 0 100 100">
                                    <path d="M20,10 Q40,30 20,50 T20,90" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                    <path d="M50,10 Q30,30 50,50 T50,90" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                                    <line x1="28" y1="20" x2="42" y2="20" stroke="currentColor" strokeWidth="3" />
                                    <line x1="25" y1="40" x2="45" y2="40" stroke="currentColor" strokeWidth="3" />
                                    <line x1="28" y1="60" x2="42" y2="60" stroke="currentColor" strokeWidth="3" />
                                    <line x1="25" y1="80" x2="45" y2="80" stroke="currentColor" strokeWidth="3" />
                                </svg>

                                {/* Main Animated Group */}
                                <div className="flask-float relative z-10">
                                    <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        {/* Glowing shadow */}
                                        <ellipse cx="50" cy="85" rx="30" ry="8" fill="currentColor" fillOpacity="0.1" />

                                        {/* Tipped Flask / Test Tube */}
                                        <path d="M40 20 L40 45 C40 45 25 60 25 75 C25 88.8 36.2 100 50 100 C63.8 100 75 88.8 75 75 C75 60 60 45 60 45 L60 20" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" transform="rotate(25 50 50)" />

                                        {/* Flask Opening Rim */}
                                        <path d="M35 20 L65 20" stroke="currentColor" strokeWidth="5" strokeLinecap="round" transform="rotate(25 50 50)" />

                                        {/* Spilled Liquid / Biomaterial inside */}
                                        <path d="M28 70 C28 82 38 92 50 92 C62 92 72 82 72 70 C72 65 65 65 50 65 C35 65 28 65 28 70 Z" fill="currentColor" fillOpacity="0.4" transform="rotate(25 50 50)" />

                                        {/* 404 Written inside the flask as molecular code */}
                                        <text x="50" y="85" fontFamily="monospace" fontSize="16" fontWeight="bold" fill="#fff" textAnchor="middle" transform="rotate(25 50 50)">404</text>
                                    </svg>
                                </div>

                                {/* Escaping Hexagons (Data/Molecules) */}
                                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
                                    <g className="hex-particle hex-1" fill="none" stroke="currentColor" strokeWidth="3">
                                        <path d="M50 30 L56 34 L56 41 L50 45 L44 41 L44 34 Z" />
                                    </g>
                                    <g className="hex-particle hex-2" fill="currentColor" fillOpacity="0.3">
                                        <path d="M50 30 L54 32.5 L54 37.5 L50 40 L46 37.5 L46 32.5 Z" />
                                    </g>
                                    <g className="hex-particle hex-3" fill="none" stroke="currentColor" strokeWidth="2" strokeOpacity="0.6">
                                        <path d="M50 30 L58 35 L58 45 L50 50 L42 45 L42 35 Z" />
                                    </g>

                                    {/* Liquid Drip */}
                                    <path className="drip" d="M75 60 Q80 70 75 75 Q70 70 75 60 Z" fill="currentColor" fillOpacity="0.6" />
                                </svg>
                            </div>

                            <div className="flex-1 text-center sm:text-left">
                                <div className="text-5xl sm:text-6xl font-black tracking-tight text-primary leading-none mb-4">
                                    404
                                </div>
                                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                                    {title}
                                </h1>
                                <p className="text-base text-gray-600 mb-8 max-w-md mx-auto sm:mx-0">
                                    {message}
                                </p>

                                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
                                    <button
                                        type="button"
                                        onClick={() => navigate(-1)}
                                        className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gray-200 bg-transparent px-5 py-2.5 text-sm font-semibold text-gray-700 transition-all hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary/20 active:scale-95"
                                    >
                                        <ArrowLeft className="h-4 w-4" />
                                        {t("notFound.back", { defaultValue: "Go Back" })}
                                    </button>

                                    <Link
                                        to="/dashboard"
                                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/50 active:scale-95"
                                    >
                                        <Home className="h-4 w-4" />
                                        {t("nav.dashboard", { defaultValue: "Return to Lab" })}
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Soft ambient corner glows for lab atmosphere */}
                <div
                    className="absolute -z-10 -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-[80px]"
                    aria-hidden="true"
                />
                <div
                    className="absolute -z-10 -bottom-20 -left-20 h-72 w-72 rounded-full bg-primary/10 blur-[80px]"
                    aria-hidden="true"
                />
            </div>
        </div>
    );
};