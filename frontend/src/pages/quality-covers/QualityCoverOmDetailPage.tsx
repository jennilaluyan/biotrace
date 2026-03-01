import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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

    return (
        <div className="min-h-[40vh] flex items-center justify-center text-sm text-gray-600">
            <div className="text-center">
                <div className="font-semibold text-gray-900">{t("loading")}</div>
                <div className="mt-2">
                    <Link to="/quality-covers/inbox/om" className="text-primary hover:underline">
                        {t("qualityCover.detail.actions.backToInbox")}
                    </Link>
                </div>
            </div>
        </div>
    );
}