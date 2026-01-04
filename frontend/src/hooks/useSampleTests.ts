// frontend/src/hooks/useSampleTests.ts
import { useCallback, useEffect, useState } from "react";
import { sampleTestService, type SampleTest, type Paginated } from "../services/sampleTests";

export function useSampleTests(sampleId?: number) {
    const [data, setData] = useState<Paginated<SampleTest> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!sampleId) return;
        try {
            setLoading(true);
            setError(null);
            const res = await sampleTestService.listBySample(sampleId, { per_page: 50, page: 1 });
            setData(res);
        } catch (e: any) {
            setError(e?.response?.data?.message || e?.message || "Failed to load sample tests");
        } finally {
            setLoading(false);
        }
    }, [sampleId]);

    useEffect(() => {
        load();
    }, [load]);

    return {
        data,
        items: data?.data ?? [],
        loading,
        error,
        reload: load,
    };
}
