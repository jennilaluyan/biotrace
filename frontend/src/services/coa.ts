import { apiGetBlob } from "./api";

export async function openCoaPdfBySample(sampleId: number, filename?: string) {
    const blob = await apiGetBlob(`/v1/samples/${sampleId}/coa`);

    const url = window.URL.createObjectURL(blob);

    // buka di tab baru (inline PDF viewer)
    const win = window.open(url, "_blank");
    if (!win) {
        // fallback kalau popup diblok browser
        const a = document.createElement("a");
        a.href = url;
        a.download = filename ?? `COA_${sampleId}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // optional: cleanup setelah beberapa menit
    setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
}
