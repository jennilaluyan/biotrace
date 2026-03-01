import AdminDashboardPage from "./AdminDashboardPage";
import SampleCollectorDashboardPage from "./SampleCollectorDashboardPage";
import AnalystDashboardPage from "./AnalystDashboardPage";
import OperationalManagerDashboardPage from "./OperationalManagerDashboardPage";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";

export default function StaffDashboardPage() {
    const { user } = useAuth();
    const roleId = getUserRoleId(user);

    if (roleId === ROLE_ID.ADMIN) return <AdminDashboardPage />;
    if (roleId === ROLE_ID.SAMPLE_COLLECTOR) return <SampleCollectorDashboardPage />;
    if (roleId === ROLE_ID.ANALYST) return <AnalystDashboardPage />;
    if (roleId === ROLE_ID.OPERATIONAL_MANAGER) return <OperationalManagerDashboardPage />;

    // LH: nanti dibuat dashboard khusus
    return <AdminDashboardPage />;
}