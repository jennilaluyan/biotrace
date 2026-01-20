import { Link } from "react-router-dom";

const ClientDashboardPage = () => {
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow p-6 border border-black/5">
                <h1 className="text-2xl font-semibold text-primary">
                    Dashboard
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                    Welcome to your client portal. From here, you can create and track sample requests.
                </p>

                <div className="mt-5 flex flex-wrap gap-3">
                    <Link
                        to="/portal/requests"
                        className="lims-btn-primary inline-flex items-center"
                    >
                        Go to Sample Requests
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl shadow p-6 border border-black/5">
                    <h2 className="text-base font-semibold text-gray-800">
                        What happens next?
                    </h2>
                    <p className="text-sm text-gray-600 mt-2">
                        Create a request, submit it, wait for admin review, then deliver the physical sample when the status says it’s ready.
                    </p>
                </div>

                <div className="bg-white rounded-2xl shadow p-6 border border-black/5">
                    <h2 className="text-base font-semibold text-gray-800">
                        Need to revise?
                    </h2>
                    <p className="text-sm text-gray-600 mt-2">
                        If admin returns your request, you can edit it and submit again.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ClientDashboardPage;
