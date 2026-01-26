export type LoaAssignmentGate = {
    blocked: boolean;
    message: string;
    status?: string | null;
};

function pickStatus(sample: any): string | null {
    return (
        sample?.loa_status ??
        sample?.loaStatus ??
        sample?.loa?.status ??
        sample?.loa?.state ??
        null
    );
}

function isLockedByFields(sample: any): boolean {
    const loa = sample?.loa;

    // boolean flags
    if (sample?.loa_locked === true || sample?.loaLocked === true) return true;
    if (loa?.is_locked === true || loa?.locked === true) return true;

    // timestamps
    if (sample?.loa_locked_at || sample?.loaLockedAt) return true;
    if (loa?.locked_at || loa?.lockedAt) return true;

    // status strings
    const st = pickStatus(sample);
    if (!st) return false;

    const s = String(st).toLowerCase();
    return ["locked", "final", "finalized", "completed", "done"].includes(s);
}

/**
 * Gate assigning sample tests until LoA is locked.
 * If payload doesn't carry LoA info, UI can still rely on backend fallback.
 */
export function getLoaAssignmentGate(sample: any): LoaAssignmentGate {
    const status = pickStatus(sample);
    const locked = isLockedByFields(sample);

    if (locked) {
        return { blocked: false, message: "", status: status ?? "locked" };
    }

    const hasAnyLoaSignal =
        sample?.loa ||
        sample?.loa_id ||
        sample?.loaId ||
        status ||
        sample?.loa_locked === false ||
        sample?.loaLocked === false;

    if (!hasAnyLoaSignal) {
        return {
            blocked: true,
            status: null,
            message:
                "Test assignment dikunci sampai Letter of Order (LoA) dibuat & dikunci. Generate LoA, sign, kirim ke client, lalu client sign sampai status LoA = locked.",
        };
    }

    const normalized = status ? String(status).toLowerCase() : null;

    if (normalized && ["draft", "generated", "created"].includes(normalized)) {
        return {
            blocked: true,
            status,
            message:
                "LoA sudah dibuat tapi belum dikunci. Selesaikan sign internal & kirim ke client, lalu minta client sign sampai LoA = locked.",
        };
    }

    if (normalized && ["sent", "pending_client_sign"].includes(normalized)) {
        return {
            blocked: true,
            status,
            message:
                "LoA sudah dikirim tapi belum ditandatangani client. Test assignment akan terbuka setelah client sign dan LoA berstatus locked.",
        };
    }

    return {
        blocked: true,
        status,
        message:
            "Test assignment dikunci sampai LoA berstatus locked. Selesaikan workflow LoA dulu (generate → sign internal → send → client sign).",
    };
}

/**
 * Fallback detector: if FE can't infer LoA state, backend may reply 403/422.
 * We treat those as "LoA not locked" errors when message hints so.
 */
export function isLoaLockError(err: any): boolean {
    const status = err?.status ?? err?.response?.status;
    const msg =
        err?.data?.message ??
        err?.data?.error ??
        err?.message ??
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        "";

    const text = String(msg).toLowerCase();

    const looksLikeLoa =
        text.includes("loa") ||
        text.includes("letter of order") ||
        text.includes("berita acara");

    const looksLikeLocked =
        text.includes("lock") ||
        text.includes("locked") ||
        text.includes("not locked") ||
        text.includes("must be locked") ||
        text.includes("dikunci") ||
        text.includes("belum");

    if ((status === 403 || status === 422) && looksLikeLoa && looksLikeLocked) {
        return true;
    }

    if ((status === 403 || status === 422) && looksLikeLoa) return true;

    return false;
}
