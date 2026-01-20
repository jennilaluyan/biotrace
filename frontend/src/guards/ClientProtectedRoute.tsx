import { Navigate, Outlet } from "react-router-dom";
import { useClientAuth } from "../hooks/useClientAuth";

export const ClientProtectedRoute = () => {
    const { isClientAuthenticated, loading } = useClientAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-cream">
                <div className="text-sm text-gray-600">Checking client session...</div>
            </div>
        );
    }

    if (!isClientAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
};
