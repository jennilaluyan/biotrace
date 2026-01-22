import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useClientAuth } from "../hooks/useClientAuth";

export const ClientProtectedRoute = () => {
    const location = useLocation();

    const { client, loading, isClientAuthenticated } = useClientAuth() as any;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-cream">
                <div className="text-sm text-gray-600">Loading client session.</div>
            </div>
        );
    }

    if (!isClientAuthenticated || !client) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
};
