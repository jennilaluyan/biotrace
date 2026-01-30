import { useAuth } from "../../hooks/useAuth";
import { getUserRoleLabel } from "../../utils/roles";
import LooBatchGenerator from "../../components/loo/LooBatchGenerator";

export function LooGeneratorPage() {
    const { user } = useAuth();
    const roleLabel = getUserRoleLabel(user);

    return (
        <div className="min-h-[60vh] space-y-4">
            <div className="px-0 py-2">
                <nav className="lims-breadcrumb">
                    <span className="lims-breadcrumb-icon">
                        <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <path d="M4 12h9" />
                            <path d="M11 9l3 3-3 3" />
                            <path d="M4 6v12" />
                        </svg>
                    </span>
                    <span className="lims-breadcrumb-current">LOO Generator</span>
                </nav>
            </div>

            <LooBatchGenerator roleLabel={roleLabel} />
        </div>
    );
}
