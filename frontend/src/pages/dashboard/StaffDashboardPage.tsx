import AdminDashboardPage from "./AdminDashboardPage";
import SampleCollectorDashboardPage from "./SampleCollectorDashboardPage";

import { useAuth } from "../../hooks/useAuth";
import { ROLE_ID, getUserRoleId } from "../../utils/roles";

export default function StaffDashboardPage() {
    const { user } = useAuth();
    const roleId = getUserRoleId(user);

    if (roleId === ROLE_ID.ADMIN) return <AdminDashboardPage />;
    if (roleId === ROLE_ID.SAMPLE_COLLECTOR) return <SampleCollectorDashboardPage />;

    // Dashboards for other roles will be added later
    // For now: safe fallback (don’t 404, don’t blank)
    return <AdminDashboardPage />; // or return <Navigate to="/samples" replace /> if you prefer
}