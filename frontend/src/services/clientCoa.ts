import { apiGetBlob } from "./api";

export async function openClientCoaPdf(sampleId: number, filename?: string) {
    const blob = await apiGetBlob(`/v1/client/samples/${sampleId}/coa`);

    // Optional safety: if server returns non-PDF (e.g., JSON error), block it
    const ct = String((blob as any)?.type ?? "").toLowerCase();
    if (ct && !ct.includes("application/pdf")) {
        const text = await blob.text();
        throw new Error(text || "Server returned non-PDF response.");
    }

    const url = window.URL.createObjectURL(blob);

    // Open in new tab (PDF viewer)
    const win = window.open(url, "_blank");

    // Fallback if popup blocked
    if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename ?? `COA_${sampleId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // Cleanup
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}