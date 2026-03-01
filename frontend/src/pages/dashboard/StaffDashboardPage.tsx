import AdminDashboardPage from "./AdminDashboardPage";
import SampleCollectorDashboardPage from "./SampleCollectorDashboardPage";
import AnalystDashboardPage from "./AnalystDashboardPage";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";

export default function StaffDashboardPage() {
    const { user } = useAuth();
    const roleId = getUserRoleId(user);

    if (roleId === ROLE_ID.ADMIN) return <AdminDashboardPage />;
    if (roleId === ROLE_ID.SAMPLE_COLLECTOR) return <SampleCollectorDashboardPage />;
    if (roleId === ROLE_ID.ANALYST) return <AnalystDashboardPage />;

    // OM/LH: sementara fallback aman (nanti bisa dibuat dashboard khusus)
    return <AdminDashboardPage />;
}