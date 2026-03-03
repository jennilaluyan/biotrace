import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import LoadingPage from "../pages/LoadingPage";

export const ProtectedRoute = () => {
    const { t } = useTranslation();
    const { isAuthenticated, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <LoadingPage
                a11yHint={t("auth.loadingSessionA11y", {
                    defaultValue: "Loading your session, analyzing molecular data, please wait.",
                })}
            />
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
};