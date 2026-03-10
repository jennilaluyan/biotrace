import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useClientAuth } from "../hooks/useClientAuth";
import LoadingPage from "../pages/LoadingPage";

export const ClientProtectedRoute = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const { client, loading, isClientAuthenticated } = useClientAuth();

    if (loading) {
        return (
            <LoadingPage
                a11yHint={t("auth.loadingSessionA11y", {
                    defaultValue: "Loading your session, analyzing molecular data, please wait.",
                })}
            />
        );
    }

    if (!isClientAuthenticated || !client) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
};