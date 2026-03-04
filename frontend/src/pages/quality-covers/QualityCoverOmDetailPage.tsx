import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export function QualityCoverOmDetailPage() {
    const { t } = useTranslation();
    const nav = useNavigate();
    const { qualityCoverId } = useParams();

    useEffect(() => {
        const id = Number(qualityCoverId);
        if (!Number.isFinite(id) || id <= 0) return;

        nav("/quality-covers/inbox/om", {
            replace: true,
            state: { preselectId: id },
        });
    }, [qualityCoverId, nav]);

    const goBack = useCallback(() => {
        const idx = (window.history.state as any)?.idx ?? 0;
        if (idx > 0) nav(-1);
        else nav("/quality-covers/inbox/om", { replace: true });
    }, [nav]);

    return (
        <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-600">
            <div className="text-center">
                <div className="font-semibold text-gray-900">{t("loading")}</div>
                <div className="mt-2">
                    <button
                        type="button"
                        onClick={goBack}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:translate-y-px transition"
                    >
                        <ArrowLeft size={16} />
                        {t("back", "Back")}
                    </button>
                </div>
            </div>
        </div>
    );
}