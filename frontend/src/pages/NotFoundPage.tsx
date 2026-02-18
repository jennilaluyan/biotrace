import { useTranslation } from "react-i18next";

export const NotFoundPage = () => {
    const { t } = useTranslation();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-cream">
            <h1 className="text-3xl font-semibold text-primary mb-2">{t("notFound.title")}</h1>
            <p className="text-sm text-gray-600">{t("notFound.message")}</p>
        </div>
    );
};
