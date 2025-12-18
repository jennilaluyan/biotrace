import { useEffect, useState } from "react";
import { clientService, type Client } from "../services/clients";

export function useClients() {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await clientService.getAll();
                setClients(data);
            } catch (err: any) {
                const msg =
                    err?.data?.message ??
                    err?.data?.error ??
                    "Failed to load clients.";
                setError(msg);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, []);

    return { clients, loading, error };
}
