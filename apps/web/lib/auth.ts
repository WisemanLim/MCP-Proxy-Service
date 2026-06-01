"use client";

/** 클라이언트 세션 — localStorage 기반 (참고: DocuGuard lib/auth). */

const TOKEN_KEY = "mcpproxy_token";
const USER_KEY = "mcpproxy_user";

export interface SessionUser {
  id: string;
  email: string;
  role: "SUPERVISOR" | "ADMIN" | "USER";
  status: "pending" | "active" | "rejected" | "disabled";
  orgId: string | null;
  orgName: string | null;
  totpEnabled: boolean;
  rejectReason?: string | null;
}

export function storeSession(token: string, user: SessionUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function storeSessionUser(user: SessionUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
