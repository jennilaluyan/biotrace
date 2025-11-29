import { Routes, Route, Navigate } from "react-router-dom";

import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { ClientsPage } from "../pages/clients/ClientsPage";
import { ClientDetailPage } from "../pages/clients/ClientDetailPage";
import { NotFoundPage } from "../pages/NotFoundPage";

import { ProtectedRoute } from "../guards/ProtectedRoute";
import { AppLayout } from "../components/layout/AppLayout";

import { RoleGuard } from "../guards/RoleGuard";
import { ROLE_ID } from "../utils/roles";

export const AppRouter = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    <Route
                        path="/clients"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.LAB_HEAD,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                ]}
                            >
                                <ClientsPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/clients/:slug"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.LAB_HEAD,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                ]}
                            >
                                <ClientDetailPage />
                            </RoleGuard>
                        }
                    />

                </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};
