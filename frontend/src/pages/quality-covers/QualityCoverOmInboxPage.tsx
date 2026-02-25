import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { QualityCoverInboxWorkspace } from "./QualityCoverInboxWorkspace";

export function QualityCoverOmInboxPage() {
    const location = useLocation();

    const preselectId = useMemo(() => {
        const st = (location.state as any) ?? {};
        const n = Number(st?.preselectId ?? st?.selectedId ?? 0);
        return Number.isFinite(n) && n > 0 ? n : null;
    }, [location.state]);

    return <QualityCoverInboxWorkspace mode="om" initialSelectedId={preselectId} />;
}