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

            {/* Waiting Room Banner (Step 1 UX clarity) */}
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="font-semibold">LOO Generator = Waiting Room</div>
                <div className="mt-1">
                    Sampel yang sudah diverifikasi oleh OM/LH akan muncul <b>di sini dulu</b>. Sampel baru akan pindah ke
                    halaman <b>Samples</b> setelah sampel tersebut sudah <b>dimaskkan ke LOO</b> (LOO dibuat).
                </div>
                <div className="mt-2 text-xs text-amber-800">
                    Setelah LOO dibuat, sampel yang masuk LOO akan hilang dari list ini, LOO tersimpan di <b>Reports</b>,
                    dan sampel baru muncul di <b>Samples</b>.
                </div>
            </div>

            <LooBatchGenerator roleLabel={roleLabel} />
        </div>
    );
}
