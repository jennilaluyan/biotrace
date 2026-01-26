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

// Ambil role_id dari berbagai bentuk payload user
export function getUserRoleId(user: any): number | null {
    if (!user) return null;

    // helper parse number-ish
    const asNumber = (v: any): number | null => {
        if (typeof v === "number" && !Number.isNaN(v)) return v;
        if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
        return null;
    };

    // 1) ideal: backend kirim role_id langsung
    const direct = asNumber(user.role_id ?? user.roleId);
    if (direct != null) return direct;

    // 2) nested: user.staff.role_id
    const staffRole = asNumber(user?.staff?.role_id ?? user?.staff?.roleId);
    if (staffRole != null) return staffRole;

    // 3) nested role object: { role: { role_id / id / name ... } }
    const role = user?.role;
    const nestedRoleId = asNumber(role?.role_id ?? role?.id);
    if (nestedRoleId != null) return nestedRoleId;

    // 4) fallback: derive dari nama role
    let label: string | null = null;

    if (typeof user?.role_name === "string") label = user.role_name;
    else if (typeof user?.roleName === "string") label = user.roleName;
    else if (role && typeof role?.name === "string") label = role.name;
    else if (typeof user?.role === "string") label = user.role; // misal "Administrator"

    const norm = normalizeRoleLabel(label);
    if (!norm) return null;

    if (norm.includes("administrator") || norm === "admin") return ROLE_ID.ADMIN;
    if (norm.includes("laboratory head") || norm === "lab head" || norm === "lh") return ROLE_ID.LAB_HEAD;
    if (norm.includes("operational manager") || norm.includes("operation manager") || norm === "om")
        return ROLE_ID.OPERATIONAL_MANAGER;
    if (norm.includes("analyst")) return ROLE_ID.ANALYST;
    if (norm.includes("sample collector") || norm.includes("collector")) return ROLE_ID.SAMPLE_COLLECTOR;
    if (norm.includes("client")) return ROLE_ID.CLIENT;

    return null;
}

export function getUserRoleLabel(user: any): string {
    if (user == null) return "UNKNOWN";

    if (typeof user === "number") {
        return getRoleLabelById(user) ?? "UNKNOWN";
    }
    if (typeof user === "string" && user.trim() !== "" && !Number.isNaN(Number(user))) {
        return getRoleLabelById(Number(user)) ?? "UNKNOWN";
    }

    // kalau ada role_name langsung
    if (typeof user.role_name === "string" && user.role_name.trim() !== "") return user.role_name;
    if (typeof user.roleName === "string" && user.roleName.trim() !== "") return user.roleName;

    // nested role object
    const role = user?.role;
    if (role && typeof role === "object") {
        if (typeof role.name === "string" && role.name.trim() !== "") return role.name;
    }

    // string role langsung
    if (typeof user.role === "string" && user.role.trim() !== "") return user.role;

    // fallback: coba dari role_id (kalau ada)
    const rid =
        user?.role_id ??
        user?.roleId ??
        user?.staff?.role_id ??
        user?.staff?.roleId ??
        role?.role_id ??
        role?.id;

    const labelById = getRoleLabelById(typeof rid === "string" ? Number(rid) : rid);
    return labelById ?? "UNKNOWN";
}
