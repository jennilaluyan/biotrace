// src/services/auth.ts
import { apiGet, apiPost } from "./api";

// STAFF
export const loginRequest = async (email: string, password: string) => {
    return apiPost<{ user: any }>("/v1/auth/login", { email, password });
};

export const logoutRequest = async () => {
    return apiPost("/v1/auth/logout");
};

export const fetchProfile = async () => {
    return apiGet<{ user: any }>("/v1/auth/me");
};

export const registerStaffRequest = async (payload: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    role_id: number;
}) => {
    return apiPost("/v1/staffs/register", payload);
};

// CLIENT ✅
export const clientRegisterRequest = async (payload: any) => {
    return apiPost("/v1/clients/register", payload);
};

export const clientLoginRequest = async (email: string, password: string) => {
    return apiPost("/v1/clients/login", { email, password });
};

export const clientMeRequest = async () => {
    return apiGet("/v1/clients/me");
};

export const clientLogoutRequest = async () => {
    return apiPost("/v1/clients/logout");
};
