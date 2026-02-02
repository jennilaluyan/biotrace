import { Routes, Route, Navigate } from "react-router-dom";
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProtectedRoute } from "../guards/ProtectedRoute";
import { ClientProtectedRoute } from "../guards/ClientProtectedRoute";
import { RoleGuard } from "../guards/RoleGuard";
import { AppLayout } from "../components/layout/AppLayout";
import { PortalLayout } from "../components/layout/PortalLayout";
import { ROLE_ID } from "../utils/roles";

import { ClientsPage } from "../pages/clients/ClientsPage";
import { ClientDetailPage } from "../pages/clients/ClientDetailPage";
import { ClientApprovalsPage } from "../pages/clients/ClientApprovalsPage";

import { SamplesPage } from "../pages/samples/SamplesPage";
import { SampleDetailPage } from "../pages/samples/SampleDetailPage";
import SampleRequestsQueuePage from "../pages/samples/SampleRequestsQueuePage";
import SampleRequestDetailPage from "../pages/samples/SampleRequestDetailPage";
import { LooGeneratorPage } from "../pages/loo/LooGeneratorPage";

import { StaffApprovalsPage } from "../pages/staff/StaffApprovalsPage";
import { QAParametersPage } from "../pages/qa/QAParametersPage";
import { QAMethodsPage } from "../pages/qa/QAMethodsPage";
import { ConsumablesCatalogPage } from "../pages/qa/ConsumablesCatalogPage";
import { AuditLogsPage } from "../pages/audit/AuditLogsPage";
import { ReportsPage } from "../pages/reports/ReportsPage";

import ClientDashboardPage from "../pages/portal/ClientDashboardPage";
import ClientRequestsPage from "../pages/portal/ClientRequestsPage";
import ClientRequestDetailPage from "../pages/portal/ClientRequestDetailPage";

export const AppRouter = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* STAFF / BACKOFFICE */}
            <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
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

                    <Route
                        path="/staff/approvals"
                        element={
                            <RoleGuard allowedRoleIds={[ROLE_ID.LAB_HEAD]}>
                                <StaffApprovalsPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/qa/parameters"
                        element={
                            <RoleGuard allowedRoleIds={[ROLE_ID.ANALYST]}>
                                <QAParametersPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/qa/methods"
                        element={
                            <RoleGuard allowedRoleIds={[ROLE_ID.ANALYST]}>
                                <QAMethodsPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/qa/consumables-catalog"
                        element={
                            <RoleGuard allowedRoleIds={[ROLE_ID.ANALYST]}>
                                <ConsumablesCatalogPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/audit/logs"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                    ROLE_ID.ANALYST,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.LAB_HEAD,
                                ]}
                            >
                                <AuditLogsPage />
                            </RoleGuard>
                        }
                    />

                    {/* alias supaya menu /audit-logs tidak 404 */}
                    <Route
                        path="/audit-logs"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                    ROLE_ID.ANALYST,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.LAB_HEAD,
                                ]}
                            >
                                <AuditLogsPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/reports"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                    ROLE_ID.ANALYST,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.LAB_HEAD,
                                ]}
                            >
                                <ReportsPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/loo"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.LAB_HEAD,
                                ]}
                            >
                                <LooGeneratorPage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/samples/requests"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.LAB_HEAD,
                                ]}
                            >
                                <SampleRequestsQueuePage />
                            </RoleGuard>
                        }
                    />

                    <Route
                        path="/samples/requests/:id"
                        element={
                            <RoleGuard
                                allowedRoleIds={[
                                    ROLE_ID.ADMIN,
                                    ROLE_ID.SAMPLE_COLLECTOR,
                                    ROLE_ID.OPERATIONAL_MANAGER,
                                    ROLE_ID.LAB_HEAD,
                                ]}
                            >
                                <SampleRequestDetailPage />
                            </RoleGuard>
                        }
                    />
                </Route>
            </Route>

            {/* CLIENT / PORTAL */}
            <Route element={<ClientProtectedRoute />}>
                <Route element={<PortalLayout />}>
                    <Route path="/portal" element={<ClientDashboardPage />} />
                    <Route path="/portal/requests" element={<ClientRequestsPage />} />
                    <Route path="/portal/requests/:id" element={<ClientRequestDetailPage />} />
                </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};
