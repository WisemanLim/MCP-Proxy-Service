import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { AuthError, type JwtClaims } from "./auth-server";
import {
  findNotification,
  insertNotification,
  listAllApiDocs,
  listApiDocsByOrg,
  listApiDocsByOwner,
  listApiUsage,
  listNotificationsForAdmin,
  listNotificationsForSupervisor,
  listOrgs,
  listUsageScoped,
  loginCountByRole,
  loginStats,
  userStatusCounts,
  markNotificationRead,
  orgDocCounts,
  orgUserCounts,
  type ApiUsageRow,
  type NotificationRow,
} from "./db";

/** 대시보드: 알림(noti)·통계·사용내역 (역할별). */

/** 발신자 역할 → 수신 스코프. USER→조직 ADMIN, ADMIN→SUPERVISOR. */
function approverScope(actor: JwtClaims): "ADMIN" | "SUPERVISOR" {
  if (actor.role === "USER") return "ADMIN";
  if (actor.role === "ADMIN") return "SUPERVISOR";
  throw new AuthError("supervisor_has_no_approver", 400);
}

/** 알림 보내기 — 미승인 계정/API에 대해 관리자에게. */
export function sendNotification(db: DatabaseSync, actor: JwtClaims, input: { type: string; message: string; refId?: string }): NotificationRow {
  const toScope = approverScope(actor);
  return insertNotification(db, {
    fromUserId: actor.sub,
    fromEmail: actor.email,
    orgId: actor.orgId,
    toScope,
    type: input.type,
    message: input.message,
    refId: input.refId ?? null,
  });
}

/** 받은 알림 목록 — ADMIN(조직)/SUPERVISOR. */
export function listNotifications(db: DatabaseSync, actor: JwtClaims): NotificationRow[] {
  if (actor.role === "SUPERVISOR") return listNotificationsForSupervisor(db);
  if (actor.role === "ADMIN") return actor.orgId ? listNotificationsForAdmin(db, actor.orgId) : [];
  throw new AuthError("forbidden", 403);
}

/** 알림 읽음 처리 — 수신 권한 검사. */
export function readNotification(db: DatabaseSync, actor: JwtClaims, id: string): void {
  const n = findNotification(db, id);
  if (!n) throw new AuthError("not_found", 404);
  const ok =
    (actor.role === "SUPERVISOR" && n.to_scope === "SUPERVISOR") ||
    (actor.role === "ADMIN" && n.to_scope === "ADMIN" && n.org_id === actor.orgId);
  if (!ok) throw new AuthError("forbidden", 403);
  markNotificationRead(db, id);
}

/** 로그인 빈도 통계 — ADMIN 조직 / SUPERVISOR 전체. */
export function loginFrequency(db: DatabaseSync, actor: JwtClaims) {
  if (actor.role === "SUPERVISOR") return loginStats(db);
  if (actor.role === "ADMIN") return actor.orgId ? loginStats(db, actor.orgId) : [];
  throw new AuthError("forbidden", 403);
}

/** 조직별 현황 (SUPERVISOR) — 사용자/문서 status 집계. */
export function orgSummary(db: DatabaseSync, actor: JwtClaims) {
  if (actor.role !== "SUPERVISOR") throw new AuthError("forbidden", 403);
  const orgs = listOrgs(db);
  const uc = orgUserCounts(db);
  const dc = orgDocCounts(db);
  const group = (rows: Array<{ org_id: string; status: string; n: number }>, oid: string) =>
    Object.fromEntries(rows.filter((r) => r.org_id === oid).map((r) => [r.status, r.n]));
  return orgs.map((o) => ({ id: o.id, name: o.name, users: group(uc, o.id), docs: group(dc, o.id) }));
}

/** API 사용(MCP 호출) 내역. */
export function usageHistory(db: DatabaseSync, docId: string) {
  return listApiUsage(db, docId);
}

/** 범위 내 사용내역 행. USER=본인 문서 / ADMIN=조직 / SUPERVISOR=전체. */
function scopedUsage(db: DatabaseSync, actor: JwtClaims): ApiUsageRow[] {
  if (actor.role === "SUPERVISOR") return listUsageScoped(db, { all: true });
  if (actor.role === "ADMIN") return actor.orgId ? listUsageScoped(db, { orgId: actor.orgId }) : [];
  const ids = listApiDocsByOwner(db, actor.sub).map((d) => d.id);
  return listUsageScoped(db, { docIds: ids });
}

function tally(rows: ApiUsageRow[], key: (r: ApiUsageRow) => string): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) { const k = key(r); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
}

/** 그래픽 대시보드 집계: API별·시간대별·지역별·사용자별 + 문서 status. */
export function usageStats(db: DatabaseSync, actor: JwtClaims) {
  const rows = scopedUsage(db, actor);
  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const r of rows) {
    const h = Number((r.at ?? "").slice(11, 13)); // "YYYY-MM-DD HH:MM:SS"
    if (h >= 0 && h < 24) byHour[h].count++;
  }
  // 문서 status 집계 (범위)
  const docs = actor.role === "SUPERVISOR" ? listAllApiDocs(db)
    : actor.role === "ADMIN" ? (actor.orgId ? listApiDocsByOrg(db, actor.orgId) : [])
    : listApiDocsByOwner(db, actor.sub);
  const docStatus = { approved: 0, pending: 0, rejected: 0 } as Record<string, number>;
  for (const d of docs) docStatus[d.status] = (docStatus[d.status] ?? 0) + 1;

  // 히트맵: 호출 top7 tool(가로) × 시간 0–23(세로), 셀=빈도
  const toolTotals = tally(rows, (r) => r.tool);
  const cols = toolTotals.slice(0, 7).map((t) => t.key);
  const colIdx = new Map(cols.map((c, i) => [c, i]));
  const cells: number[][] = Array.from({ length: 24 }, () => Array(cols.length).fill(0));
  for (const r of rows) {
    const i = colIdx.get(r.tool);
    if (i === undefined) continue;
    const h = Number((r.at ?? "").slice(11, 13));
    if (h >= 0 && h < 24) cells[h][i]++;
  }

  // 사용자 status / 역할별 로그인 (조직 범위: SUPERVISOR=전체, ADMIN=조직)
  const scopeOrg = actor.role === "SUPERVISOR" ? undefined : (actor.orgId ?? "__none__");
  const us = { active: 0, pending: 0, rejected: 0, disabled: 0 } as Record<string, number>;
  for (const r of userStatusCounts(db, scopeOrg)) us[r.status] = r.count;
  const lbr = { USER: 0, ADMIN: 0, SUPERVISOR: 0 } as Record<string, number>;
  for (const r of loginCountByRole(db, scopeOrg)) lbr[r.role] = r.count;

  return {
    total: rows.length,
    ok: rows.filter((r) => r.ok).length,
    byTool: tally(rows, (r) => r.tool),
    byRegion: tally(rows, (r) => r.region ?? "unknown"),
    byCaller: tally(rows, (r) => r.caller ?? "unknown"),
    byHour,
    docStatus,
    userStatus: us,       // active/pending/rejected/disabled
    loginByRole: lbr,     // USER/ADMIN/SUPERVISOR 로그인 횟수
    heatmap: { cols, cells }, // cols: tool명, cells[hour][colIndex]
  };
}
