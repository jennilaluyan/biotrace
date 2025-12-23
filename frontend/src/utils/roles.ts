// src/utils/roles.ts

// Mapping role_id sesuai seed database kamu
export const ROLE_ID = {
    CLIENT: 1,
    ADMIN: 2,
    SAMPLE_COLLECTOR: 3,
    ANALYST: 4,
    OPERATIONAL_MANAGER: 5,
    LAB_HEAD: 6,
} as const;

// Helper kecil: normalisasi string role
function normalizeRoleLabel(label: string | null | undefined): string | null {
    if (!label) return null;
    return label.trim().toLowerCase();
}

// Ambil role_id dari berbagai bentuk payload user
export function getUserRoleId(user: any): number | null {
    if (!user) return null;

    // 1) Kasus ideal: backend sudah kirim role_id langsung
    if (typeof user.role_id === "number") {
        return user.role_id;
    }

    // 2) Kalau backend kirim nested role object { role: { role_id / id / name ... } }
    const role = (user as any).role;
    if (role && typeof role === "object") {
        if (typeof role.role_id === "number") return role.role_id;
        if (typeof role.id === "number") return role.id;
    }

    // 3) Fallback: derive dari nama role (Administrator, Laboratory Head, dst)
    let label: string | null = null;

    if (typeof (user as any).role_name === "string") {
        label = (user as any).role_name;
    } else if (role && typeof role.name === "string") {
        label = role.name;
    } else if (typeof (user as any).role === "string") {
        // Misal `role: "ADMIN"` atau `role: "Administrator"`
        label = (user as any).role;
    }

    const norm = normalizeRoleLabel(label);
    if (!norm) return null;

    // Mapping longgar berdasarkan kata kunci di label
    if (norm.includes("administrator")) return ROLE_ID.ADMIN;
    if (norm.includes("laboratory head")) return ROLE_ID.LAB_HEAD;
    if (norm.includes("operational manager")) return ROLE_ID.OPERATIONAL_MANAGER;
    if (norm.includes("analyst")) return ROLE_ID.ANALYST;
    if (norm.includes("sample collector")) return ROLE_ID.SAMPLE_COLLECTOR;
    if (norm.includes("client")) return ROLE_ID.CLIENT;

    return null;
}

// Ambil label untuk ditampilkan di UI (Administrator, Laboratory Head, dll.)
export function getUserRoleLabel(user: any): string {
    if (!user) return "UNKNOWN";

    if (typeof user.role_name === "string") return user.role_name;

    const role = (user as any).role;
    if (role && typeof role === "object") {
        if (typeof role.name === "string") return role.name;
        if (typeof role.code === "string") return role.code;
    }

    if (typeof (user as any).role === "string") {
        return (user as any).role;
    }

    return "UNKNOWN";
}

// Ambil label role dari role_id (untuk list approvals, dsb.)
export const ROLE_LABEL_BY_ID: Record<number, string> = {
    [ROLE_ID.CLIENT]: "Client",
    [ROLE_ID.ADMIN]: "Administrator",
    [ROLE_ID.SAMPLE_COLLECTOR]: "Sample Collector",
    [ROLE_ID.ANALYST]: "Analyst",
    [ROLE_ID.OPERATIONAL_MANAGER]: "Operational Manager",
    [ROLE_ID.LAB_HEAD]: "Laboratory Head",
};

export function getRoleLabelById(roleId: number | null | undefined): string | null {
    if (roleId == null) return null;
    return ROLE_LABEL_BY_ID[roleId] ?? null;
}
