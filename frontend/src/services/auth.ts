// src/services/auth.ts
import { apiGet, apiPost } from "./api";

export const loginRequest = async (email: string, password: string) => {
    // -> /api/v1/auth/login
    return apiPost<{ user: any }>("/v1/auth/login", { email, password });
};

export const logoutRequest = async () => {
    // -> /api/v1/auth/logout
    return apiPost("/v1/auth/logout");
};

export const fetchProfile = async () => {
    // -> /api/v1/auth/me  (bukan /auth/profile)
    return apiGet<{ user: any }>("/v1/auth/me");
};
