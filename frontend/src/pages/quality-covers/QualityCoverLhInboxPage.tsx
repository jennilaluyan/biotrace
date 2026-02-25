import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { QualityCoverInboxWorkspace } from "./QualityCoverInboxWorkspace";

export function QualityCoverLhInboxPage() {
    const location = useLocation();

    const preselectId = useMemo(() => {
        const st = (location.state as any) ?? {};
        const n = Number(st?.preselectId ?? st?.selectedId ?? 0);
        return Number.isFinite(n) && n > 0 ? n : null;
    }, [location.state]);

    const initialFlash = useMemo(() => {
        const st = (location.state as any) ?? {};
        const f = st?.flash;
        return f && typeof f.message === "string" ? f : null;
    }, [location.state]);

    return <QualityCoverInboxWorkspace mode="lh" initialSelectedId={preselectId} initialFlash={initialFlash} />;
}