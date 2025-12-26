// src/services/auth.ts
import { staffHttp, clientHttp, apiGet, apiPost } from "./api";

// ===== STAFF =====
export const staffLoginRequest = async (email: string, password: string) => {
    return apiPost<{ user: any; token: string }>(staffHttp, "/v1/auth/login", {
        email,
        password,
        device_name: "staff_web",
    });
};

export const staffMeRequest = async () => {
    return apiGet<{ user: any }>(staffHttp, "/v1/auth/me");
};

export const staffLogoutRequest = async () => {
    return apiPost(staffHttp, "/v1/auth/logout");
};

export const registerStaffRequest = async (payload: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    role_id: number;
}) => {
    return apiPost(staffHttp, "/v1/staffs/register", payload);
};

// ===== CLIENT =====
export const clientRegisterRequest = async (payload: any) => {
    return apiPost(clientHttp, "/v1/clients/register", payload);
};

export const clientLoginRequest = async (email: string, password: string) => {
    return apiPost<{ client: any; token: string }>(clientHttp, "/v1/clients/login", {
        email,
        password,
        device_name: "client_web",
    });
};

export const clientMeRequest = async () => {
    return apiGet<{ client: any }>(clientHttp, "/v1/clients/me");
};

export const clientLogoutRequest = async () => {
    return apiPost(clientHttp, "/v1/clients/logout");
};

// ===== GENERIC (TOPBAR) =====
// Dipakai Topbar biar tidak perlu tahu ini staff/client.
export const logoutRequest = async () => {
    // prioritas: staff
    if (localStorage.getItem("staff_token")) {
        return staffLogoutRequest();
    }

    // kalau portal/client yang login
    if (localStorage.getItem("client_token")) {
        return clientLogoutRequest();
    }

    // tidak ada token -> tidak perlu call backend
    return Promise.resolve();
};
