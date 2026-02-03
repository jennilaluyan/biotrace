import { useAuth } from "../../hooks/useAuth";
import { getUserRoleLabel } from "../../utils/roles";
import LooBatchGenerator from "../../components/loo/LooBatchGenerator";

function InfoIcon() {
    return (
        <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
        </svg>
    );
}

export function LooGeneratorPage() {
    const { user } = useAuth();
    const roleLabel = getUserRoleLabel(user);

    return (
        <div className="min-h-[60vh] space-y-4">
            {/* Breadcrumb */}
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

            {/* Page header / guidance (keeps users oriented) */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-gray-100 bg-white flex flex-col md:flex-row gap-3 md:items-start md:justify-between">
                    <div>
                        <div className="text-lg font-bold text-gray-900">LOO Generator</div>
                        <div className="mt-1 text-xs text-gray-500 max-w-3xl">
                            Halaman ini adalah <b>ruang tunggu</b> sebelum sampel masuk ke LOO. Setiap sampel perlu
                            persetujuan <b>OM</b> dan <b>LH</b>. Sistem hanya akan memasukkan sampel yang{" "}
                            <b>Ready</b> (OM ✅ dan LH ✅) ke LOO.
                        </div>
                    </div>

                    <div className="text-xs text-gray-600">
                        <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1">
                            <span className="text-gray-500">Role:</span>
                            <span className="font-semibold text-gray-900">{roleLabel}</span>
                        </div>
                    </div>
                </div>

                <div className="px-4 md:px-6 py-3 bg-gray-50 border-t border-gray-100">
                    <div className="flex flex-col md:flex-row md:items-center gap-2 text-sm text-gray-800">
                        <div className="inline-flex items-start gap-2">
                            <span className="mt-0.5 text-gray-500">
                                <InfoIcon />
                            </span>
                            <div className="text-xs text-gray-700">
                                <b>Tips alur cepat:</b> OM & LH setujui sampel yang sama → status menjadi <b>Ready</b> →
                                pilih parameter uji → <b>Generate LOO</b>. Setelah LOO berhasil dibuat, sampel yang ikut
                                LOO akan hilang dari ruang tunggu.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main component */}
            <LooBatchGenerator roleLabel={roleLabel} />
        </div>
    );
}
