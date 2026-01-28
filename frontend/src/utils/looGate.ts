export type LooAssignmentGate = {
    blocked: boolean;
    message: string;
    status?: string | null;
};

function pickStatus(sample: any): string | null {
    return (
        sample?.loo_status ??
        sample?.looStatus ??
        sample?.loo?.status ??
        sample?.loo?.state ??
        sample?.loa_status ?? // fallback sementara kalau payload lama masih kirim loa_*
        null
    );
}

function isLockedByFields(sample: any): boolean {
    const loo = sample?.loo ?? sample?.loa; // fallback
    if (sample?.loo_locked === true || sample?.looLocked === true) return true;
    if (loo?.is_locked === true || loo?.locked === true) return true;

    if (sample?.loo_locked_at || sample?.looLockedAt) return true;
    if (loo?.locked_at || loo?.lockedAt) return true;

    const st = pickStatus(sample);
    if (!st) return false;
    const s = String(st).toLowerCase();
    return ["locked", "final", "finalized", "completed", "done"].includes(s);
}

export function getLooAssignmentGate(sample: any): LooAssignmentGate {
    const status = pickStatus(sample);
    const locked = isLockedByFields(sample);

    if (locked) return { blocked: false, message: "", status: status ?? "locked" };

    const hasAnySignal =
        sample?.loo ||
        sample?.loo_id ||
        sample?.looId ||
        status ||
        sample?.loo_locked === false ||
        sample?.looLocked === false ||
        // fallback legacy
        sample?.loa ||
        sample?.loa_id ||
        sample?.loaId;

    if (!hasAnySignal) {
        return {
            blocked: true,
            status: null,
            message:
                "Test assignment dikunci sampai Letter of Order (LoO) dibuat & dikunci. Generate LoO, sign internal, kirim ke client, lalu client sign sampai status LoO = locked.",
        };
    }

    const normalized = status ? String(status).toLowerCase() : null;

    if (normalized && ["draft", "generated", "created"].includes(normalized)) {
        return {
            blocked: true,
            status,
            message:
                "LoO sudah dibuat tapi belum dikunci. Selesaikan sign internal & kirim ke client, lalu minta client sign sampai LoO = locked.",
        };
    }

    if (normalized && ["sent", "pending_client_sign", "sent_to_client"].includes(normalized)) {
        return {
            blocked: true,
            status,
            message:
                "LoO sudah dikirim tapi belum ditandatangani client. Test assignment akan terbuka setelah client sign dan LoO berstatus locked.",
        };
    }

    return {
        blocked: true,
        status,
        message:
            "Test assignment dikunci sampai LoO berstatus locked. Selesaikan workflow LoO dulu (generate → sign internal → send → client sign).",
    };
}

export function isLooLockError(err: any): boolean {
    const status = err?.status ?? err?.response?.status;
    const msg =
        err?.data?.message ??
        err?.data?.error ??
        err?.message ??
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        "";

    const text = String(msg).toLowerCase();

    const looksLikeLoo =
        text.includes("loo") ||
        text.includes("letter of order") ||
        text.includes("surat perintah") ||
        // legacy fallback
        text.includes("loa");

    const looksLikeLocked =
        text.includes("lock") ||
        text.includes("locked") ||
        text.includes("not locked") ||
        text.includes("must be locked") ||
        text.includes("dikunci") ||
        text.includes("belum");

    if ((status === 403 || status === 422) && looksLikeLoo && looksLikeLocked) return true;
    if ((status === 403 || status === 422) && looksLikeLoo) return true;
    return false;
}
