import {
    getStaffAuthToken,
    setStaffAuthToken,
    getClientAuthToken,
    setClientAuthToken,
} from "../services/api";

/**
 * Single source of truth:
 * - Staff token key: biotrace_staff_token (managed by services/api.ts)
 * - Client token key: biotrace_client_token (managed by services/api.ts)
 *
 * This wrapper exists only for backward compatibility with old imports.
 */
export const tokenStore = {
    getStaff() {
        return getStaffAuthToken();
    },
    setStaff(token: string) {
        setStaffAuthToken(token);
    },
    clearStaff() {
        setStaffAuthToken(null);
    },

    getClient() {
        return getClientAuthToken();
    },
    setClient(token: string) {
        setClientAuthToken(token);
    },
    clearClient() {
        setClientAuthToken(null);
    },
};
