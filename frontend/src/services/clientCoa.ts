export function openClientCoaPdf(sampleId: number) {
    // Cookie-based auth will still be sent in a new tab.
    window.open(`/api/v1/client/samples/${sampleId}/coa`, "_blank", "noopener,noreferrer");
}