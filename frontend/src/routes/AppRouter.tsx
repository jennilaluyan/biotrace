import { Routes, Route, Navigate } from "react-router-dom";

// Clients
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { ClientsPage } from "../pages/clients/ClientsPage";
import { ClientDetailPage } from "../pages/clients/ClientDetailPage";

// Samples
import { SamplesPage } from "../pages/samples/SamplesPage";
import { SampleDetailPage } from "../pages/samples/SampleDetailPage";

import { NotFoundPage } from "../pages/NotFoundPage";

import { ProtectedRoute } from "../guards/ProtectedRoute";
import { AppLayout } from "../components/layout/AppLayout";

import { RoleGuard } from "../guards/RoleGuard";
import { ROLE_ID } from "../utils/roles";
import { StaffApprovalsPage } from "../pages/staff/StaffApprovalsPage";
import { ClientApprovalsPage } from "../pages/clients/ClientApprovalsPage";

import { QAParametersPage } from "../pages/qa/QAParametersPage";

export const AppRouter = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    {/* ✅ CLIENT APPROVALS harus di atas /clients/:slug */}
                    <Route
                        path="/clients/approvals"
                        element={
                            <RoleGuard allowedRoleIds={[ROLE_ID.ADMIN]}>
                                <ClientApprovalsPage />
                            </RoleGuard>
                        }
                    />

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

                    <Route
                        path="/samples"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.LAB_HEAD,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.ANALYST,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                ]}
                            >
                                <SamplesPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/samples/:id"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.LAB_HEAD,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.ANALYST,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                ]}
                            >
                                <SampleDetailPage />
                            </RoleGuard>
                        }
                    />

                    {/* ✅ Staff approvals satu aja, konsisten */}
                    <Route
                        path="/staff/approvals"
                        element={
                            <RoleGuard allowedRoleIds={[ROLE_ID.LAB_HEAD]}>
                                <StaffApprovalsPage />
                            </RoleGuard>
                        }
                    />
                    <Route path="/qa/parameters" element={<QAParametersPage />} />
                </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};
