import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

type Role =
    | "ADMIN"
    | "LAB_HEAD"
    | "OPERATIONAL_MANAGER"
    | "OPERATOR"
    | string;

interface RoleGuardProps {
    allowed: Role[];
    children: ReactNode;
    redirectTo?: string;
}

export const RoleGuard = ({ allowed, children, redirectTo }: RoleGuardProps) => {
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

    if (!allowed.includes(user.role)) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-cream">
                <h1 className="text-2xl font-semibold text-primary mb-2">
                    403 – Access denied
                </h1>
                <p className="text-sm text-gray-600">
                    Your role{" "}
                    <span className="font-semibold">({user.role})</span> is not allowed to
                    access this page.
                </p>
            </div>
        );
    }

    return <>{children}</>;
};
