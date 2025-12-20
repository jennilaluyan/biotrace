// src/hooks/useSamples.ts
import { useEffect, useState } from "react";
import {
    sampleService,
    Sample,
    SampleStatusEnum,
    PaginationMeta,
} from "../services/samples";

type UseSamplesArgs = {
    page: number;
    clientId?: number;
    statusEnum?: SampleStatusEnum;
    from?: string; // YYYY-MM-DD
    to?: string;   // YYYY-MM-DD
    reloadTick?: number;
};

export function useSamples({
    page,
    clientId,
    statusEnum,
    from,
    to,
    reloadTick = 0,
}: UseSamplesArgs) {
    const [items, setItems] = useState<Sample[]>([]);
    const [meta, setMeta] = useState<PaginationMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                setLoading(true);
                setError(null);

                const res = await sampleService.getAll({
                    page,
                    client_id: clientId,
                    status_enum: statusEnum,
                    from,
                    to,
                });

                if (cancelled) return;
                setItems(res.data ?? []);
                setMeta(res.meta ?? null);
            } catch (err: any) {
                if (cancelled) return;
                const msg =
                    err?.data?.message ??
                    err?.data?.error ??
                    "Failed to load samples list.";
                setError(msg);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, [page, clientId, statusEnum, from, to, reloadTick]);

    return { items, meta, loading, error };
}
