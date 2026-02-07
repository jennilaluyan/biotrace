import { Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { getLastRoute, setLastRoute } from "../utils/lastRoute";
import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProtectedRoute } from "../guards/ProtectedRoute";
import { ClientProtectedRoute } from "../guards/ClientProtectedRoute";
import { RoleGuard } from "../guards/RoleGuard";
import { AppLayout } from "../components/layout/AppLayout";
import { PortalLayout } from "../components/layout/PortalLayout";
import { ROLE_ID } from "../utils/roles";
import { getTenant } from "../utils/tenant";
import { useAuth } from "../hooks/useAuth";
import { useClientAuth } from "../hooks/useClientAuth";

import { ClientsPage } from "../pages/clients/ClientsPage";
import { ClientDetailPage } from "../pages/clients/ClientDetailPage";
import { ClientApprovalsPage } from "../pages/clients/ClientApprovalsPage";
import { SamplesPage } from "../pages/samples/SamplesPage";
import { SampleDetailPage } from "../pages/samples/SampleDetailPage";
import SampleRequestsQueuePage from "../pages/samples/SampleRequestsQueuePage";
import SampleRequestDetailPage from "../pages/samples/SampleRequestDetailPage";
import { LooGeneratorPage } from "../pages/loo/LooGeneratorPage";
import { StaffApprovalsPage } from "../pages/staff/StaffApprovalsPage";
import { AuditLogsPage } from "../pages/audit/AuditLogsPage";
import { ReportsPage } from "../pages/reports/ReportsPage";
import { QualityCoverOmInboxPage } from "../pages/quality-covers/QualityCoverOmInboxPage";
import { QualityCoverLhInboxPage } from "../pages/quality-covers/QualityCoverLhInboxPage";
import ReagentRequestBuilderPage from "../pages/reagents/ReagentRequestBuilderPage";
import ReagentApprovalInboxPage from "../pages/reagents/ReagentApprovalInboxPage";
import ReagentApprovalDetailPage from "../pages/reagents/ReagentApprovalDetailPage";
import { QualityCoverOmDetailPage } from "../pages/quality-covers/QualityCoverOmDetailPage";
import { QualityCoverLhDetailPage } from "../pages/quality-covers/QualityCoverLhDetailPage";
import ClientDashboardPage from "../pages/portal/ClientDashboardPage";
import ClientRequestsPage from "../pages/portal/ClientRequestsPage";
import ClientRequestDetailPage from "../pages/portal/ClientRequestDetailPage";

/**
 * Smart default landing (restore last route per actor):
 * - backoffice + staff authenticated => last staff route (fallback /samples)
 * - portal + client authenticated => last client route (fallback /portal)
 * - otherwise => /login
 */
const StaffLastRouteTracker = () => {
    const loc = useLocation();
    const staff = useAuth();

    // simpan hanya kalau sudah login & punya user id
    const staffId = (staff as any)?.user?.id;

    // store path + query
    const path = `${loc.pathname}${loc.search ?? ""}`;

    // jangan simpan "/" (root) dan jangan simpan kalau belum authenticated
    if (staff?.isAuthenticated && staffId && path !== "/") {
        setLastRoute("staff", path, staffId);
    }

    return <Outlet />;
};

const ClientLastRouteTracker = () => {
    const loc = useLocation();
    const client = useClientAuth() as any;

    const clientId = client?.client?.id;
    const path = `${loc.pathname}${loc.search ?? ""}`;

    if (client?.isClientAuthenticated && clientId && path !== "/") {
        setLastRoute("client", path, clientId);
    }

    return <Outlet />;
};

const HomeRedirect = () => {
    const tenant = getTenant();
    const staff = useAuth();
    const client = useClientAuth() as any;

    if (tenant === "portal") {
        if (client?.loading) return null;

        if (client?.isClientAuthenticated) {
            const clientId = client?.client?.id;
            const last = getLastRoute("client", clientId);
            return <Navigate to={last ?? "/portal"} replace />;
        }

        return <Navigate to="/login" replace />;
    }

    // backoffice
    if (staff.loading) return null;

    if (staff.isAuthenticated) {
        const staffId = (staff as any)?.user?.id;
        const last = getLastRoute("staff", staffId);
        return <Navigate to={last ?? "/samples"} replace />;
    }

    return <Navigate to="/login" replace />;
};

export const AppRouter = () => {
    return (
        <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* STAFF / BACKOFFICE */}
            <Route element={<ProtectedRoute />}>
                <Route element={<StaffLastRouteTracker />}>
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
                            path="/quality-covers/inbox/om"
                            element={
                                <RoleGuard allowedRoleIds={[ROLE_ID.OPERATIONAL_MANAGER]}>
                                    <QualityCoverOmInboxPage />
                                </RoleGuard>
                            }
                        />

                        <Route
                            path="/quality-covers/inbox/lh"
                            element={
                                <RoleGuard allowedRoleIds={[ROLE_ID.LAB_HEAD]}>
                                    <QualityCoverLhInboxPage />
                                </RoleGuard>
                            }
                        />

                        <Route
                            path="/quality-covers/om/:qualityCoverId"
                            element={
                                <RoleGuard allowedRoleIds={[ROLE_ID.OPERATIONAL_MANAGER]}>
                                    <QualityCoverOmDetailPage />
                                </RoleGuard>
                            }
                        />

                        <Route
                            path="/quality-covers/lh/:qualityCoverId"
                            element={
                                <RoleGuard allowedRoleIds={[ROLE_ID.LAB_HEAD]}>
                                    <QualityCoverLhDetailPage />
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
                            path="/reagents/requests/loo/:loId"
                            element={
                                <RoleGuard allowedRoleIds={[ROLE_ID.ANALYST]}>
                                    <ReagentRequestBuilderPage />
                                </RoleGuard>
                            }
                        />
                        <Route
                            path="/reagents/approvals"
                            element={
                                <RoleGuard
                                    allowedRoleIds={[ROLE_ID.OPERATIONAL_MANAGER, ROLE_ID.LAB_HEAD]}
                                >
                                    <ReagentApprovalInboxPage />
                                </RoleGuard>
                            }
                        />
                        <Route
                            path="/reagents/approvals/loo/:loId"
                            element={
                                <RoleGuard
                                    allowedRoleIds={[ROLE_ID.OPERATIONAL_MANAGER, ROLE_ID.LAB_HEAD]}
                                >
                                    <ReagentApprovalDetailPage />
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
                                    allowedRoleIds={[ROLE_ID.OPERATIONAL_MANAGER, ROLE_ID.LAB_HEAD]}
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
            </Route>

            {/* CLIENT / PORTAL */}
            <Route element={<ClientProtectedRoute />}>
                <Route element={<ClientLastRouteTracker />}>
                    <Route element={<PortalLayout />}>
                        <Route path="/portal" element={<ClientDashboardPage />} />
                        <Route path="/portal/requests" element={<ClientRequestsPage />} />
                        <Route path="/portal/requests/:id" element={<ClientRequestDetailPage />} />
                    </Route>
                </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};
