"use client";

import { clearSession, getToken, type SessionUser } from "./auth";

/** 동일 출처 API 클라이언트 (참고: DocuGuard lib/api). */

async function call<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  if (res.status === 401 && token) {
    clearSession();
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      location.assign("/login?reason=expired");
    }
    throw new Error("unauthorized");
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data as T;
}

interface TotpInfo { otpauth: string; secret: string; qrDataUrl: string }
interface RegisterResp { user: SessionUser; totp: TotpInfo }
interface LoginResp { token: string; tokenType: string; user: SessionUser }

export interface ProxyStatus { running: boolean; port: number; url: string; startedAt?: number; error?: string }

export interface ApiDoc {
  id: string; name: string; sourceType: "url" | "inline" | "endpoints"; sourceRef: string | null;
  baseUrl: string | null; status: "pending" | "approved" | "rejected"; reason: string | null;
  toolsCount: number | null; ownerId: string; orgId: string | null; updatedAt: string;
}
export interface Endpoint { id: string; doc_id: string; method: string; path: string; summary: string | null }
export interface DocPreview {
  ok: boolean; error?: string;
  metadata?: { baseUrl: string | null; endpointCount: number; authSchemes: string[]; riskyEndpoints: { path: string; reason: string }[]; qualityScore: number };
  tools?: { name: string; method: string; path: string }[];
  excluded?: { operationId: string; method: string; path: string; reason: string }[];
  upstream?: { reachable: boolean; status?: number; error?: string };
}

export const api = {
  // 인증
  register: (body: { email: string; password: string; role: "USER" | "ADMIN"; orgName?: string; orgId?: string }) =>
    call<RegisterResp>("/api/auth/register", { body }),
  login: (email: string, password: string, totp?: string) =>
    call<LoginResp>("/api/auth/login", { body: { email, password, totp } }),
  me: () => call<SessionUser>("/api/auth/me"),
  totpQr: () => call<{ otpauth: string; qrDataUrl: string; enabled: boolean }>("/api/auth/totp/qr"),
  enableTotp: (code: string) => call<{ enabled: boolean }>("/api/auth/totp/enable", { body: { code } }),
  // 조직
  checkOrg: (name: string) => call<{ name: string; available: boolean }>(`/api/orgs/check?name=${encodeURIComponent(name)}`),
  searchOrgs: (q: string) => call<{ items: { id: string; name: string }[] }>(`/api/orgs/search?q=${encodeURIComponent(q)}`),
  // 사용자 관리
  listUsers: () => call<{ items: SessionUser[] }>("/api/users"),
  approveUser: (id: string) => call<SessionUser>(`/api/users/${id}/approve`, { body: {} }),
  rejectUser: (id: string, reason: string) => call<SessionUser>(`/api/users/${id}/reject`, { body: { reason } }),
  changeUser: (id: string, patch: { role?: string; status?: string }) => call<SessionUser>(`/api/users/${id}`, { method: "PATCH", body: patch }),
  resetPassword: (id: string, newPassword: string) => call<{ ok: boolean }>(`/api/users/${id}/reset-password`, { body: { newPassword } }),
  // 본인 비밀번호 변경
  changePassword: (currentPassword: string, newPassword: string) =>
    call<{ ok: boolean }>("/api/auth/password", { body: { currentPassword, newPassword } }),
  // API 문서
  listDocs: () => call<{ items: ApiDoc[] }>("/api/apidocs"),
  createDoc: (body: { name: string; sourceType: "url" | "inline" | "endpoints"; sourceRef?: string; specInline?: string; baseUrl?: string }) =>
    call<ApiDoc>("/api/apidocs", { body }),
  editDoc: (id: string, body: { name?: string; sourceRef?: string; baseUrl?: string }) =>
    call<ApiDoc>(`/api/apidocs/${id}`, { method: "PATCH", body }),
  deleteDoc: (id: string) => call<{ ok: boolean }>(`/api/apidocs/${id}`, { method: "DELETE" }),
  previewDoc: (id: string) => call<DocPreview>(`/api/apidocs/${id}/preview`),
  testDoc: (id: string) => call<DocPreview>(`/api/apidocs/${id}/test`),
  approveDoc: (id: string) => call<ApiDoc>(`/api/apidocs/${id}/approve`, { body: {} }),
  rejectDoc: (id: string, reason: string) => call<ApiDoc>(`/api/apidocs/${id}/reject`, { body: { reason } }),
  // 개별 endpoint (endpoints 모드)
  listEndpoints: (id: string) => call<{ items: Endpoint[] }>(`/api/apidocs/${id}/endpoints`),
  addEndpoint: (id: string, body: { method: string; path: string; summary?: string }) =>
    call<Endpoint>(`/api/apidocs/${id}/endpoints`, { body }),
  deleteEndpoint: (id: string, eid: string) =>
    call<{ ok: boolean }>(`/api/apidocs/${id}/endpoints/${eid}`, { method: "DELETE" }),
  // 승인 문서 OpenAPI 스펙 (가이드 다운로드)
  getOpenApi: (id: string) => call<Record<string, unknown>>(`/api/apidocs/${id}/openapi.json`),
  proxyStatus: (id: string) => call<ProxyStatus>(`/api/apidocs/${id}/proxy`),
  restartProxy: (id: string) => call<ProxyStatus>(`/api/apidocs/${id}/proxy`, { body: {} }),
  // 사용(MCP 호출) 내역
  usage: (id: string) => call<{ items: ApiUsage[] }>(`/api/apidocs/${id}/usage`),
  // 알림
  listNotifications: () => call<{ items: Notification[] }>("/api/notifications"),
  sendNotification: (body: { type: string; message: string; refId?: string }) =>
    call<Notification>("/api/notifications", { body }),
  readNotification: (id: string) => call<{ ok: boolean }>(`/api/notifications/${id}/read`, { body: {} }),
  // 통계
  loginStats: () => call<{ items: { email: string; count: number; last: string }[] }>("/api/stats/logins"),
  orgStats: () => call<{ items: OrgSummary[] }>("/api/stats/orgs"),
  usageStats: () => call<UsageStats>("/api/stats/usage"),
  // 멤버 초대
  createInvite: (body: { mode: "email" | "link"; email?: string; role: string; orgId?: string; orgName?: string; allowedDomain?: string }) =>
    call<InviteResult>("/api/invites", { body }),
  getInvite: (token: string) => call<InviteInfo>(`/api/invites/${token}`),
  acceptInvite: (token: string, password: string, email?: string) =>
    call<{ token: string; user: SessionUser }>("/api/invites/accept", { body: { token, password, email } }),
};

export interface InviteResult { token: string; type: string; link: string; emailSent: boolean; smtpConfigured: boolean; expiresAt: string }
export interface InviteInfo { type: "email" | "link"; email: string | null; role: string; orgName: string | null; allowedDomain: string | null }

export interface UsageStats {
  total: number; ok: number;
  byTool: { key: string; count: number }[];
  byRegion: { key: string; count: number }[];
  byCaller: { key: string; count: number }[];
  byHour: { hour: number; count: number }[];
  docStatus: Record<string, number>;
  userStatus: Record<string, number>;
  loginByRole: Record<string, number>;
  heatmap: { cols: string[]; cells: number[][] };
}

export interface ApiUsage { id: string; doc_id: string; tool: string; region: string | null; ok: number; caller: string | null; at: string }
export interface Notification { id: string; from_email: string; to_scope: string; type: string; message: string; ref_id: string | null; read: number; created_at: string }
export interface OrgSummary { id: string; name: string; users: Record<string, number>; docs: Record<string, number> }
