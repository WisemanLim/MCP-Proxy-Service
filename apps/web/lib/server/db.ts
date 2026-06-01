import "server-only";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import { AuthConfig, type Role } from "./config";

// node:sqlite (Node 22+ 빌트인) — 번들러 정적 분석 회피 위해 런타임 require.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSync = InstanceType<typeof DatabaseSync>;

/** node:sqlite 사용자/조직/API문서 저장소 (raw SQL). */

export type AccountStatus = "pending" | "active" | "rejected" | "disabled";
export type DocStatus = "pending" | "approved" | "rejected";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: number;
  role: Role;
  status: AccountStatus;
  org_id: string | null;
  reject_reason: string | null;
  created_at: string;
  last_login_at: string | null;
}

export interface OrgRow {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
}

export type DocSource = "url" | "inline" | "endpoints";

export interface ApiDocRow {
  id: string;
  owner_id: string;
  org_id: string | null;
  name: string;
  source_type: DocSource;
  source_ref: string | null; // url
  spec_inline: string | null; // JSON 문자열
  base_url: string | null;
  status: DocStatus;
  reason: string | null;
  tools_count: number | null;
  proxy_port: number | null; // 승인 시 할당된 MCP 프록시 리슨 포트 (≥20000)
  created_at: string;
  updated_at: string;
}

export interface EndpointRow {
  id: string;
  doc_id: string;
  method: string;
  path: string;
  summary: string | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  from_user_id: string;
  from_email: string;
  org_id: string | null;
  to_scope: "ADMIN" | "SUPERVISOR";
  type: string;
  message: string;
  ref_id: string | null;
  read: number;
  created_at: string;
}

export interface InvitationRow {
  id: string; token: string; type: "email" | "link"; email: string | null;
  role: "ADMIN" | "USER"; org_id: string; allowed_domain: string | null;
  created_by: string; accepted: number; expires_at: string; created_at: string;
}
export interface LoginEventRow { id: string; user_id: string; email: string; org_id: string | null; at: string }
export interface ApiUsageRow { id: string; doc_id: string; org_id: string | null; caller: string | null; tool: string; region: string | null; ok: number; at: string }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS organizations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret   TEXT,
  totp_enabled  INTEGER NOT NULL DEFAULT 0,
  role          TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('SUPERVISOR','ADMIN','USER')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected','disabled')),
  org_id        TEXT,
  reject_reason TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS api_docs (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  org_id      TEXT,
  name        TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('url','inline','endpoints')),
  source_ref  TEXT,
  spec_inline TEXT,
  base_url    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reason      TEXT,
  tools_count INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_endpoints (
  id         TEXT PRIMARY KEY,
  doc_id     TEXT NOT NULL,
  method     TEXT NOT NULL,
  path       TEXT NOT NULL,
  summary    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  from_email   TEXT NOT NULL,
  org_id       TEXT,
  to_scope     TEXT NOT NULL CHECK (to_scope IN ('ADMIN','SUPERVISOR')),
  type         TEXT NOT NULL,
  message      TEXT NOT NULL,
  ref_id       TEXT,
  read         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS login_events (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email   TEXT NOT NULL,
  org_id  TEXT,
  at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS invitations (
  id             TEXT PRIMARY KEY,
  token          TEXT NOT NULL UNIQUE,
  type           TEXT NOT NULL CHECK (type IN ('email','link')),
  email          TEXT,
  role           TEXT NOT NULL CHECK (role IN ('ADMIN','USER')),
  org_id         TEXT NOT NULL,
  allowed_domain TEXT,
  created_by     TEXT NOT NULL,
  accepted       INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_usage (
  id       TEXT PRIMARY KEY,
  doc_id   TEXT NOT NULL,
  org_id   TEXT,
  caller   TEXT,
  tool     TEXT NOT NULL,
  region   TEXT,
  ok       INTEGER NOT NULL DEFAULT 1,
  at       TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let _db: DatabaseSync | null = null;

/** 멱등 마이그레이션 — 기존 DB에 신규 컬럼 추가(중복 시 무시). */
function migrate(db: DatabaseSync): void {
  try { db.exec("ALTER TABLE api_docs ADD COLUMN proxy_port INTEGER"); } catch { /* 이미 존재 */ }
}

export function getDb(path: string = AuthConfig.sqlitePath): DatabaseSync {
  if (_db) return _db;
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  migrate(db);
  _db = db;
  return db;
}

export function createDb(path = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

function rid(prefix: string): string {
  return `${prefix}_` + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ───────── users ─────────
export function findUserByEmail(db: DatabaseSync, email: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
}
export function findUserById(db: DatabaseSync, id: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}
export function insertUser(
  db: DatabaseSync,
  opts: { email: string; passwordHash: string; totpSecret: string; role: Role; status: AccountStatus; orgId?: string | null },
): UserRow {
  const id = rid("usr");
  db.prepare(
    "INSERT INTO users (id,email,password_hash,totp_secret,totp_enabled,role,status,org_id) VALUES (?,?,?,?,0,?,?,?)",
  ).run(id, opts.email, opts.passwordHash, opts.totpSecret, opts.role, opts.status, opts.orgId ?? null);
  return findUserById(db, id)!;
}
export function setTotpEnabled(db: DatabaseSync, id: string, enabled: boolean): void {
  db.prepare("UPDATE users SET totp_enabled = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}
export function touchLastLogin(db: DatabaseSync, id: string): void {
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id);
}
export function listUsers(db: DatabaseSync): UserRow[] {
  return db.prepare("SELECT * FROM users ORDER BY created_at DESC").all() as UserRow[];
}
export function listUsersByOrg(db: DatabaseSync, orgId: string): UserRow[] {
  return db.prepare("SELECT * FROM users WHERE org_id = ? ORDER BY created_at DESC").all(orgId) as UserRow[];
}
export function updateUserStatus(db: DatabaseSync, id: string, status: AccountStatus, reason: string | null = null): void {
  db.prepare("UPDATE users SET status = ?, reject_reason = ? WHERE id = ?").run(status, reason, id);
}
export function updateUserRole(db: DatabaseSync, id: string, role: Role): void {
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}
export function updateUserPassword(db: DatabaseSync, id: string, passwordHash: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}

// ───────── organizations ─────────
export function findOrgByName(db: DatabaseSync, name: string): OrgRow | undefined {
  return db.prepare("SELECT * FROM organizations WHERE name = ?").get(name) as OrgRow | undefined;
}
export function findOrgById(db: DatabaseSync, id: string): OrgRow | undefined {
  return db.prepare("SELECT * FROM organizations WHERE id = ?").get(id) as OrgRow | undefined;
}
export function insertOrg(db: DatabaseSync, name: string, createdBy: string): OrgRow {
  const id = rid("org");
  db.prepare("INSERT INTO organizations (id,name,created_by) VALUES (?,?,?)").run(id, name, createdBy);
  return findOrgById(db, id)!;
}
export function searchOrgs(db: DatabaseSync, q: string): OrgRow[] {
  return db.prepare("SELECT * FROM organizations WHERE name LIKE ? ORDER BY name LIMIT 20").all(`%${q}%`) as OrgRow[];
}

// ───────── api_docs ─────────
export function insertApiDoc(
  db: DatabaseSync,
  opts: { ownerId: string; orgId: string | null; name: string; sourceType: DocSource; sourceRef?: string | null; specInline?: string | null; baseUrl?: string | null },
): ApiDocRow {
  const id = rid("doc");
  db.prepare(
    "INSERT INTO api_docs (id,owner_id,org_id,name,source_type,source_ref,spec_inline,base_url,status) VALUES (?,?,?,?,?,?,?,?,'pending')",
  ).run(id, opts.ownerId, opts.orgId, opts.name, opts.sourceType, opts.sourceRef ?? null, opts.specInline ?? null, opts.baseUrl ?? null);
  return findApiDocById(db, id)!;
}
export function findApiDocById(db: DatabaseSync, id: string): ApiDocRow | undefined {
  return db.prepare("SELECT * FROM api_docs WHERE id = ?").get(id) as ApiDocRow | undefined;
}
export function listApiDocsByOwner(db: DatabaseSync, ownerId: string): ApiDocRow[] {
  return db.prepare("SELECT * FROM api_docs WHERE owner_id = ? ORDER BY updated_at DESC").all(ownerId) as ApiDocRow[];
}
export function listApiDocsByOrg(db: DatabaseSync, orgId: string): ApiDocRow[] {
  return db.prepare("SELECT * FROM api_docs WHERE org_id = ? ORDER BY updated_at DESC").all(orgId) as ApiDocRow[];
}
export function listAllApiDocs(db: DatabaseSync): ApiDocRow[] {
  return db.prepare("SELECT * FROM api_docs ORDER BY updated_at DESC").all() as ApiDocRow[];
}
export function updateApiDoc(
  db: DatabaseSync,
  id: string,
  patch: { name?: string; sourceRef?: string | null; specInline?: string | null; baseUrl?: string | null },
): void {
  const cur = findApiDocById(db, id)!;
  db.prepare(
    "UPDATE api_docs SET name=?, source_ref=?, spec_inline=?, base_url=?, status='pending', reason=NULL, updated_at=datetime('now') WHERE id=?",
  ).run(
    patch.name ?? cur.name,
    patch.sourceRef !== undefined ? patch.sourceRef : cur.source_ref,
    patch.specInline !== undefined ? patch.specInline : cur.spec_inline,
    patch.baseUrl !== undefined ? patch.baseUrl : cur.base_url,
    id,
  );
}
export function setApiDocProxyPort(db: DatabaseSync, id: string, port: number | null): void {
  db.prepare("UPDATE api_docs SET proxy_port=? WHERE id=?").run(port, id);
}
export function listUsedProxyPorts(db: DatabaseSync): number[] {
  return (db.prepare("SELECT proxy_port FROM api_docs WHERE proxy_port IS NOT NULL").all() as Array<{ proxy_port: number }>).map((r) => r.proxy_port);
}
export function setApiDocStatus(db: DatabaseSync, id: string, status: DocStatus, reason: string | null, toolsCount: number | null): void {
  db.prepare("UPDATE api_docs SET status=?, reason=?, tools_count=?, updated_at=datetime('now') WHERE id=?")
    .run(status, reason, toolsCount, id);
}
export function deleteApiDoc(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM api_docs WHERE id = ?").run(id);
  db.prepare("DELETE FROM api_endpoints WHERE doc_id = ?").run(id);
}

// ───────── notifications ─────────
export function insertNotification(
  db: DatabaseSync,
  n: { fromUserId: string; fromEmail: string; orgId: string | null; toScope: "ADMIN" | "SUPERVISOR"; type: string; message: string; refId?: string | null },
): NotificationRow {
  const id = rid("ntf");
  db.prepare("INSERT INTO notifications (id,from_user_id,from_email,org_id,to_scope,type,message,ref_id) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, n.fromUserId, n.fromEmail, n.orgId, n.toScope, n.type, n.message, n.refId ?? null);
  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as NotificationRow;
}
export function findNotification(db: DatabaseSync, id: string): NotificationRow | undefined {
  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(id) as NotificationRow | undefined;
}
/** ADMIN: 같은 조직 + to_scope ADMIN / SUPERVISOR: to_scope SUPERVISOR. */
export function listNotificationsForAdmin(db: DatabaseSync, orgId: string): NotificationRow[] {
  return db.prepare("SELECT * FROM notifications WHERE to_scope='ADMIN' AND org_id=? ORDER BY created_at DESC").all(orgId) as NotificationRow[];
}
export function listNotificationsForSupervisor(db: DatabaseSync): NotificationRow[] {
  return db.prepare("SELECT * FROM notifications WHERE to_scope='SUPERVISOR' ORDER BY created_at DESC").all() as NotificationRow[];
}
export function markNotificationRead(db: DatabaseSync, id: string): void {
  db.prepare("UPDATE notifications SET read=1 WHERE id=?").run(id);
}

// ───────── login_events ─────────
export function insertLoginEvent(db: DatabaseSync, userId: string, email: string, orgId: string | null): void {
  db.prepare("INSERT INTO login_events (id,user_id,email,org_id) VALUES (?,?,?,?)").run(rid("lge"), userId, email, orgId);
}
/** 사용자별 로그인 횟수 + 최근 시각. orgId 지정 시 해당 조직만. */
export function loginStats(db: DatabaseSync, orgId?: string): Array<{ email: string; count: number; last: string }> {
  const sql = "SELECT email, COUNT(*) as count, MAX(at) as last FROM login_events"
    + (orgId ? " WHERE org_id=?" : "") + " GROUP BY email ORDER BY count DESC";
  return (orgId ? db.prepare(sql).all(orgId) : db.prepare(sql).all()) as Array<{ email: string; count: number; last: string }>;
}
/** 역할별 로그인 횟수 (login_events ⋈ users.role). orgId 지정 시 조직만. */
export function loginCountByRole(db: DatabaseSync, orgId?: string): Array<{ role: string; count: number }> {
  const sql = "SELECT u.role AS role, COUNT(*) AS count FROM login_events le JOIN users u ON le.user_id=u.id"
    + (orgId ? " WHERE u.org_id=?" : "") + " GROUP BY u.role";
  return (orgId ? db.prepare(sql).all(orgId) : db.prepare(sql).all()) as Array<{ role: string; count: number }>;
}
/** status별 사용자 수. orgId 지정 시 조직만. */
export function userStatusCounts(db: DatabaseSync, orgId?: string): Array<{ status: string; count: number }> {
  const sql = "SELECT status, COUNT(*) AS count FROM users" + (orgId ? " WHERE org_id=?" : "") + " GROUP BY status";
  return (orgId ? db.prepare(sql).all(orgId) : db.prepare(sql).all()) as Array<{ status: string; count: number }>;
}

// ───────── api_usage ─────────
export function insertApiUsage(db: DatabaseSync, u: { docId: string; orgId: string | null; caller: string | null; tool: string; region?: string | null; ok: boolean }): void {
  db.prepare("INSERT INTO api_usage (id,doc_id,org_id,caller,tool,region,ok) VALUES (?,?,?,?,?,?,?)")
    .run(rid("use"), u.docId, u.orgId, u.caller, u.tool, u.region ?? null, u.ok ? 1 : 0);
}
/** 시드용 — 명시적 시각 오프셋(시간 단위 과거). */
export function insertApiUsageAt(db: DatabaseSync, u: { docId: string; orgId: string | null; caller: string | null; tool: string; region: string | null; ok: boolean; hoursAgo: number }): void {
  db.prepare("INSERT INTO api_usage (id,doc_id,org_id,caller,tool,region,ok,at) VALUES (?,?,?,?,?,?,?, datetime('now', ?))")
    .run(rid("use"), u.docId, u.orgId, u.caller, u.tool, u.region, u.ok ? 1 : 0, `-${u.hoursAgo} hours`);
}
export function listApiUsage(db: DatabaseSync, docId: string, limit = 50): ApiUsageRow[] {
  return db.prepare("SELECT * FROM api_usage WHERE doc_id=? ORDER BY at DESC LIMIT ?").all(docId, limit) as ApiUsageRow[];
}
/** 범위 집계용 원시 행. orgId 또는 docIds로 스코프. */
export function listUsageScoped(db: DatabaseSync, scope: { orgId?: string; docIds?: string[]; all?: boolean }): ApiUsageRow[] {
  if (scope.all) return db.prepare("SELECT * FROM api_usage").all() as ApiUsageRow[];
  if (scope.orgId) return db.prepare("SELECT * FROM api_usage WHERE org_id=?").all(scope.orgId) as ApiUsageRow[];
  const ids = scope.docIds ?? [];
  if (ids.length === 0) return [];
  const ph = ids.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM api_usage WHERE doc_id IN (${ph})`).all(...ids) as ApiUsageRow[];
}

// ───────── invitations ─────────
export function insertInvitation(
  db: DatabaseSync,
  inv: { token: string; type: "email" | "link"; email: string | null; role: "ADMIN" | "USER"; orgId: string; allowedDomain: string | null; createdBy: string; ttlMinutes: number },
): InvitationRow {
  const id = rid("inv");
  db.prepare("INSERT INTO invitations (id,token,type,email,role,org_id,allowed_domain,created_by,expires_at) VALUES (?,?,?,?,?,?,?,?, datetime('now', ?))")
    .run(id, inv.token, inv.type, inv.email, inv.role, inv.orgId, inv.allowedDomain, inv.createdBy, `+${inv.ttlMinutes} minutes`);
  return db.prepare("SELECT * FROM invitations WHERE id = ?").get(id) as InvitationRow;
}
export function findInvitationByToken(db: DatabaseSync, token: string): InvitationRow | undefined {
  return db.prepare("SELECT * FROM invitations WHERE token = ?").get(token) as InvitationRow | undefined;
}
/** 만료 여부: expires_at < now. */
export function isInvitationExpired(db: DatabaseSync, token: string): boolean {
  const r = db.prepare("SELECT (expires_at < datetime('now')) AS expired FROM invitations WHERE token = ?").get(token) as { expired: number } | undefined;
  return !r || r.expired === 1;
}
export function markInvitationAccepted(db: DatabaseSync, id: string): void {
  db.prepare("UPDATE invitations SET accepted = 1 WHERE id = ?").run(id);
}

// ───────── org summary (SUPERVISOR) ─────────
export function listOrgs(db: DatabaseSync): OrgRow[] {
  return db.prepare("SELECT * FROM organizations ORDER BY name").all() as OrgRow[];
}
export function orgUserCounts(db: DatabaseSync): Array<{ org_id: string; status: string; n: number }> {
  return db.prepare("SELECT org_id, status, COUNT(*) n FROM users WHERE org_id IS NOT NULL GROUP BY org_id, status").all() as Array<{ org_id: string; status: string; n: number }>;
}
export function orgDocCounts(db: DatabaseSync): Array<{ org_id: string; status: string; n: number }> {
  return db.prepare("SELECT org_id, status, COUNT(*) n FROM api_docs WHERE org_id IS NOT NULL GROUP BY org_id, status").all() as Array<{ org_id: string; status: string; n: number }>;
}

// ───────── api_endpoints (개별 등록 모드) ─────────
export function insertEndpoint(db: DatabaseSync, docId: string, method: string, path: string, summary: string | null): EndpointRow {
  const id = rid("ep");
  db.prepare("INSERT INTO api_endpoints (id,doc_id,method,path,summary) VALUES (?,?,?,?,?)")
    .run(id, docId, method.toLowerCase(), path, summary);
  return db.prepare("SELECT * FROM api_endpoints WHERE id = ?").get(id) as EndpointRow;
}
export function listEndpoints(db: DatabaseSync, docId: string): EndpointRow[] {
  return db.prepare("SELECT * FROM api_endpoints WHERE doc_id = ? ORDER BY created_at").all(docId) as EndpointRow[];
}
export function findEndpoint(db: DatabaseSync, id: string): EndpointRow | undefined {
  return db.prepare("SELECT * FROM api_endpoints WHERE id = ?").get(id) as EndpointRow | undefined;
}
export function deleteEndpoint(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM api_endpoints WHERE id = ?").run(id);
}
