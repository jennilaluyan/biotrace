import { Navigate, Outlet, useLocation } from "react-router-dom";
import { usePortalAuth } from "../context/PortalAuthContext";

export const ProtectedClientRoute = () => {
    const { isClientAuthenticated, loading } = usePortalAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-cream">
                <div className="text-sm text-gray-600">Loading portal session...</div>
            </div>
        );
    }

    if (!isClientAuthenticated) {
        return <Navigate to="/portal/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
};
