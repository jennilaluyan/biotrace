import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Home, Beaker, TestTube2 } from "lucide-react";

export const NotFoundPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const title = useMemo(
        () => t("notFound.title", { defaultValue: "Page not found" }),
        [t]
    );

    const message = useMemo(
        () => t("notFound.message", { defaultValue: "This page doesn’t exist." }),
        [t]
    );

    return (
        <div className="min-h-screen bg-cream flex items-center justify-center px-6 py-10 relative overflow-hidden">
            <style>
                {`
                /* Subtle lab grid */
                .nf-grid {
                    position: absolute;
                    inset: 0;
                    background:
                        radial-gradient(circle at 20% 20%, rgba(0,0,0,.06), transparent 40%),
                        radial-gradient(circle at 80% 30%, rgba(0,0,0,.05), transparent 42%),
                        linear-gradient(to right, rgba(0,0,0,.03) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(0,0,0,.03) 1px, transparent 1px);
                    background-size: auto, auto, 26px 26px, 26px 26px;
                    opacity: .75;
                    pointer-events: none;
                }

                @keyframes nf-float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }

                @keyframes nf-drip {
                    0% { transform: translateY(0); opacity: 0; }
                    15% { opacity: .55; }
                    100% { transform: translateY(26px); opacity: 0; }
                }

                @media (prefers-reduced-motion: reduce) {
                    .nf-float, .nf-drip { animation: none !important; }
                }
                `}
            </style>

            <div className="nf-grid" aria-hidden="true" />

            <div className="w-full max-w-xl relative">
                <div className="rounded-2xl border border-black/5 bg-white/75 backdrop-blur shadow-sm overflow-hidden">
                    <div className="p-7 sm:p-8">
                        <div className="flex items-start justify-between gap-5">
                            <div className="min-w-0">
                                <div className="text-5xl font-extrabold tracking-tight text-primary leading-none">
                                    404
                                </div>
                                <div className="mt-2 text-xl font-semibold text-primary">{title}</div>
                                <div className="mt-2 text-sm text-gray-600">{message}</div>
                            </div>

                            {/* Simple lab illustration */}
                            <div className="relative shrink-0">
                                <div
                                    className="nf-float rounded-2xl border border-primary/15 bg-primary/5 p-4"
                                    style={{ animation: "nf-float 2.2s ease-in-out infinite" }}
                                    aria-hidden="true"
                                >
                                    <div className="relative h-14 w-14">
                                        <Beaker className="absolute left-1 top-1 h-7 w-7 text-primary/55" />
                                        <TestTube2 className="absolute right-1 bottom-1 h-7 w-7 text-primary/45 rotate-12" />
                                        {/* Dripping droplet */}
                                        <span
                                            className="nf-drip absolute left-6 top-10 h-2 w-2 rounded-full bg-primary/35"
                                            style={{ animation: "nf-drip 1.35s ease-in infinite" }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-7 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-black/5"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                {t("notFound.back", { defaultValue: "Back" })}
                            </button>

                            <Link
                                to="/dashboard"
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                            >
                                <Home className="h-4 w-4" />
                                {t("nav.dashboard", { defaultValue: "Dashboard" })}
                            </Link>
                        </div>
                    </div>
                </div>

                {/* Soft corner glow */}
                <div
                    className="absolute -z-10 -top-10 -right-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="absolute -z-10 -bottom-12 -left-12 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
                    aria-hidden="true"
                />
            </div>
        </div>
    );
};