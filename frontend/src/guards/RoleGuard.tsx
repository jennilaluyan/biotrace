import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getUserRoleId, getUserRoleLabel } from "../utils/roles";

interface RoleGuardProps {
    allowedRoleIds: number[];
    children: ReactNode;
    redirectTo?: string;
}

export const RoleGuard = ({
    allowedRoleIds,
    children,
    redirectTo,
}: RoleGuardProps) => {
    const { user, loading, isAuthenticated } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-cream">
                <div className="text-sm text-gray-600">Checking permission...</div>
            </div>
        );
    }

    if (!isAuthenticated || !user) {
        return <Navigate to={redirectTo ?? "/login"} replace />;
    }

    const roleId = getUserRoleId(user);
    const roleLabel = getUserRoleLabel(user);

    if (!roleId || !allowedRoleIds.includes(roleId)) {
        return (
            <div className="h-[95%] flex flex-col items-center justify-center bg-cream">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role{" "}
                    <span className="font-semibold">({roleLabel})</span> is not allowed
                    to access this page.
                </p>
            </div>
        );
    }

    return <>{children}</>;
};
