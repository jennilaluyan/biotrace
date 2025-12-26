import { Routes, Route, Navigate } from "react-router-dom";

// Auth
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";

// Clients
import { ClientsPage } from "../pages/clients/ClientsPage";
import { ClientDetailPage } from "../pages/clients/ClientDetailPage";
import { ClientApprovalsPage } from "../pages/clients/ClientApprovalsPage";

// Samples
import { SamplesPage } from "../pages/samples/SamplesPage";
import { SampleDetailPage } from "../pages/samples/SampleDetailPage";

// Staff
import { StaffApprovalsPage } from "../pages/staff/StaffApprovalsPage";

// Sample Requests (Step 9)
import { SampleRequestsPage } from "../pages/requests/SampleRequestsPage";
import { SampleRequestDetailPage } from "../pages/requests/SampleRequestDetailPage";

// Client Portal (Step 9)
import { MyRequestsPage } from "../pages/portal/MyRequestsPage";

import { NotFoundPage } from "../pages/NotFoundPage";
import { ProtectedRoute } from "../guards/ProtectedRoute";
import { AppLayout } from "../components/layout/AppLayout";
import { RoleGuard } from "../guards/RoleGuard";
import { ROLE_ID } from "../utils/roles";
import { ProtectedClientRoute } from "../guards/ProtectedClientRoute";
import { AuthPage } from "../pages/auth/AuthPage";

export const AppRouter = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />

            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/portal/login" element={<AuthPage initialMode="login" tenant="portal" />} />
            <Route path="/portal/register" element={<AuthPage initialMode="register" tenant="portal" />} />

            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                    {/* Admin - client approvals */}
                    <Route
                        path="/clients/approvals"
                        element={
                            <RoleGuard allowedRoleIds={[ROLE_ID.ADMIN]}>
                                <ClientApprovalsPage />
                            </RoleGuard>
                        }
                    />

                    {/* Clients module */}
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

                    {/* Samples module */}
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

                    {/* Staff approvals */}
                    <Route
                        path="/staff/approvals"
                        element={
                            <RoleGuard allowedRoleIds={[ROLE_ID.LAB_HEAD]}>
                                <StaffApprovalsPage />
                            </RoleGuard>
                        }
                    />

                    {/* ✅ Step 9 — STAFF queue (sample requests) */}
                    <Route
                        path="/sample-requests"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.LAB_HEAD,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                    ROLE_ID.ANALYST,
                                ]}
                            >
                                <SampleRequestsPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/sample-requests/:id"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.LAB_HEAD,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                    ROLE_ID.ANALYST,
                                ]}
                            >
                                <SampleRequestDetailPage />
                            </RoleGuard>
                        }
                    />
                </Route>
            </Route>

            <Route element={<ProtectedClientRoute />}>
                <Route path="/portal" element={<Navigate to="/portal/my-requests" replace />} />
                <Route path="/portal/my-requests" element={<MyRequestsPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};
