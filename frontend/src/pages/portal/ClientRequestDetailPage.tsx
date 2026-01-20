import React from "react";
import { useParams } from "react-router-dom";

export default function ClientRequestDetailPage() {
    const { id } = useParams();

    return (
        <div className="p-4">
            <h1 className="text-xl font-semibold">Request Detail</h1>
            <p className="text-sm opacity-80 mt-1">Placeholder (Step 2).</p>
            <div className="mt-4 text-sm">
                <span className="opacity-70">Sample ID:</span> <span className="font-mono">{id}</span>
            </div>
        </div>
    );
}
