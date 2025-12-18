import { useEffect, useState } from "react";
import { sampleService, Sample } from "../services/samples";

export function useSample(sampleId?: number) {
    const [data, setData] = useState<Sample | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!sampleId) return;

        let cancelled = false;

        const load = async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await sampleService.getById(sampleId);
                if (cancelled) return;

                setData(res);
            } catch (err: any) {
                if (cancelled) return;
                const msg =
                    err?.data?.message ??
                    err?.data?.error ??
                    "Failed to load sample detail.";
                setError(msg);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [sampleId]);

    return { data, loading, error };
}
