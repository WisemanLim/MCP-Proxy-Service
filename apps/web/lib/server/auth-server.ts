import "server-only";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { SignJWT, jwtVerify } from "jose";
import type { DatabaseSync } from "node:sqlite";
import { AuthConfig, type Role } from "./config";
import {
  type AccountStatus,
  findOrgById,
  findOrgByName,
  findUserByEmail,
  findUserById,
  insertLoginEvent,
  insertOrg,
  insertUser,
  setTotpEnabled,
  touchLastLogin,
  updateUserPassword,
  updateUserRole,
  updateUserStatus,
  type UserRow,
} from "./db";

/** 인증 코어: bcrypt + otplib(TOTP) + jose(JWT) + 역할/조직/승인 워크플로. */

const secretKey = () => new TextEncoder().encode(AuthConfig.jwtSecret);

export interface JwtClaims {
  sub: string;
  email: string;
  role: Role;
  status: AccountStatus;
  orgId: string | null;
}

export async function signToken(c: JwtClaims): Promise<string> {
  return new SignJWT({ email: c.email, role: c.role, status: c.status, orgId: c.orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(c.sub)
    .setIssuedAt()
    .setExpirationTime(AuthConfig.jwtExpiresIn)
    .sign(secretKey());
}

export async function verifyToken(token: string): Promise<JwtClaims> {
  const { payload } = await jwtVerify(token, secretKey());
  return {
    sub: payload.sub as string,
    email: payload.email as string,
    role: payload.role as Role,
    status: payload.status as AccountStatus,
    orgId: (payload.orgId as string | null) ?? null,
  };
}

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  status: AccountStatus;
  orgId: string | null;
  orgName: string | null;
  totpEnabled: boolean;
  rejectReason: string | null;
}

export function toPublic(db: DatabaseSync, u: UserRow): PublicUser {
  const org = u.org_id ? findOrgById(db, u.org_id) : undefined;
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    orgId: u.org_id,
    orgName: org?.name ?? null,
    totpEnabled: !!u.totp_enabled,
    rejectReason: u.reject_reason,
  };
}

/**
 * 회원가입 (PRD Part B).
 * - ADMIN: orgName 필수 → 조직 생성(중복검사) → status=pending (SUPERVISOR 승인 대기)
 * - USER:  orgId 필수(조직 검색 선택) → status=pending (해당 조직 ADMIN 승인 대기)
 * - SUPERVISOR 가입 불가 (부트스트랩 전용)
 */
export async function registerUser(
  db: DatabaseSync,
  input: { email: string; password: string; role: Role; orgName?: string; orgId?: string },
): Promise<{ user: PublicUser; totp: { otpauth: string; secret: string; qrDataUrl: string } }> {
  const { email, password, role } = input;
  if (role === "SUPERVISOR") throw new AuthError("supervisor_signup_forbidden", 403);
  if (findUserByEmail(db, email)) throw new AuthError("email_already_registered", 400);
  if (password.length < 8) throw new AuthError("password_too_short", 400);

  let orgId: string;
  if (role === "ADMIN") {
    const name = (input.orgName ?? "").trim();
    if (!name) throw new AuthError("org_name_required", 400);
    if (findOrgByName(db, name)) throw new AuthError("org_name_taken", 409);
    // 조직 먼저 생성 후 admin 연결
    const hashTmp = await bcrypt.hash(password, AuthConfig.bcryptRounds);
    const secret = authenticator.generateSecret();
    const pre = insertUser(db, { email, passwordHash: hashTmp, totpSecret: secret, role, status: "pending", orgId: null });
    const org = insertOrg(db, name, pre.id);
    updateUserStatusInternal(db, pre.id, { orgId: org.id });
    const u = findUserById(db, pre.id)!;
    return finishRegister(db, u, secret, email);
  }

  // USER
  const oid = input.orgId ?? "";
  if (!oid || !findOrgById(db, oid)) throw new AuthError("org_required", 400);
  orgId = oid;
  const hash = await bcrypt.hash(password, AuthConfig.bcryptRounds);
  const secret = authenticator.generateSecret();
  const u = insertUser(db, { email, passwordHash: hash, totpSecret: secret, role: "USER", status: "pending", orgId });
  return finishRegister(db, u, secret, email);
}

function updateUserStatusInternal(db: DatabaseSync, id: string, patch: { orgId?: string }) {
  if (patch.orgId) db.prepare("UPDATE users SET org_id = ? WHERE id = ?").run(patch.orgId, id);
}

async function finishRegister(db: DatabaseSync, u: UserRow, secret: string, email: string) {
  const otpauth = authenticator.keyuri(email, AuthConfig.totpIssuer, secret);
  return { user: toPublic(db, u), totp: { otpauth, secret, qrDataUrl: await QRCode.toDataURL(otpauth) } };
}

export interface LoginResult {
  token: string;
  tokenType: "Bearer";
  user: PublicUser;
}

/** 로그인. disabled/rejected는 차단, pending/active는 허용(토큰에 status 포함 → 대기화면). */
export async function loginUser(db: DatabaseSync, email: string, password: string, totp?: string): Promise<LoginResult> {
  const u = findUserByEmail(db, email);
  if (!u) throw new AuthError("invalid_credentials", 401);
  if (u.status === "disabled") throw new AuthError("account_disabled", 403);
  if (u.status === "rejected") throw new AuthError("account_rejected", 403);
  if (!(await bcrypt.compare(password, u.password_hash))) throw new AuthError("invalid_credentials", 401);
  if (u.totp_enabled) {
    if (!totp) throw new AuthError("totp_required", 401);
    if (!u.totp_secret || !authenticator.check(totp, u.totp_secret)) throw new AuthError("invalid_totp", 401);
  }
  touchLastLogin(db, u.id);
  insertLoginEvent(db, u.id, u.email, u.org_id); // 로그인 빈도 통계용
  const token = await signToken({ sub: u.id, email: u.email, role: u.role, status: u.status, orgId: u.org_id });
  return { token, tokenType: "Bearer", user: toPublic(db, u) };
}

export async function getTotpQr(db: DatabaseSync, userId: string) {
  const u = findUserById(db, userId);
  if (!u || !u.totp_secret) throw new AuthError("totp_not_enrolled", 400);
  const otpauth = authenticator.keyuri(u.email, AuthConfig.totpIssuer, u.totp_secret);
  return { otpauth, qrDataUrl: await QRCode.toDataURL(otpauth), enabled: !!u.totp_enabled };
}

export function enableTotp(db: DatabaseSync, userId: string, code: string): { enabled: true } {
  const u = findUserById(db, userId);
  if (!u || !u.totp_secret) throw new AuthError("totp_not_enrolled", 400);
  if (!authenticator.check(code, u.totp_secret)) throw new AuthError("invalid_totp", 401);
  setTotpEnabled(db, userId, true);
  return { enabled: true };
}

// ───────── 승인 워크플로 (Part B 3·4) ─────────

/** 승인 권한: SUPERVISOR=누구나, ADMIN=같은 조직 USER만. */
export function canApprove(actor: JwtClaims, target: UserRow): boolean {
  if (actor.role === "SUPERVISOR") return true;
  if (actor.role === "ADMIN" && target.role === "USER") return actor.orgId != null && actor.orgId === target.org_id;
  return false;
}

export function approveUser(db: DatabaseSync, actor: JwtClaims, targetId: string): PublicUser {
  const t = findUserById(db, targetId);
  if (!t) throw new AuthError("not_found", 404);
  if (!canApprove(actor, t)) throw new AuthError("forbidden", 403);
  updateUserStatus(db, targetId, "active", null);
  return toPublic(db, findUserById(db, targetId)!);
}

export function rejectUser(db: DatabaseSync, actor: JwtClaims, targetId: string, reason: string): PublicUser {
  const t = findUserById(db, targetId);
  if (!t) throw new AuthError("not_found", 404);
  if (!canApprove(actor, t)) throw new AuthError("forbidden", 403);
  updateUserStatus(db, targetId, "rejected", reason || "rejected");
  return toPublic(db, findUserById(db, targetId)!);
}

/**
 * 역할/상태 변경 (Part B 1).
 * - SUPERVISOR: 누구나 역할·상태 변경.
 * - ADMIN: 같은 조직 USER의 **상태만** 변경 (역할 변경 불가).
 */
export function changeUser(db: DatabaseSync, actor: JwtClaims, targetId: string, patch: { role?: Role; status?: AccountStatus }): PublicUser {
  const t = findUserById(db, targetId);
  if (!t) throw new AuthError("not_found", 404);

  if (actor.role === "SUPERVISOR") {
    if (patch.role) updateUserRole(db, targetId, patch.role);
    if (patch.status) updateUserStatus(db, targetId, patch.status, patch.status === "rejected" ? "changed by supervisor" : null);
  } else if (actor.role === "ADMIN") {
    // 같은 조직 USER 상태만
    if (t.role !== "USER" || actor.orgId == null || actor.orgId !== t.org_id) throw new AuthError("forbidden", 403);
    if (patch.role) throw new AuthError("admin_cannot_change_role", 403);
    if (patch.status) updateUserStatus(db, targetId, patch.status, patch.status === "rejected" ? "changed by admin" : null);
  } else {
    throw new AuthError("forbidden", 403);
  }
  return toPublic(db, findUserById(db, targetId)!);
}

/** 본인 비밀번호 변경 — 현재 비밀번호 검증 후 교체. */
export async function changePassword(db: DatabaseSync, userId: string, currentPw: string, newPw: string): Promise<void> {
  const u = findUserById(db, userId);
  if (!u) throw new AuthError("not_found", 404);
  if (!(await bcrypt.compare(currentPw, u.password_hash))) throw new AuthError("invalid_credentials", 401);
  if (newPw.length < 8) throw new AuthError("password_too_short", 400);
  updateUserPassword(db, userId, await bcrypt.hash(newPw, AuthConfig.bcryptRounds));
}

/** 비밀번호 초기화 — SUPERVISOR(누구나) / ADMIN(같은 조직 USER). 현재 비밀번호 불필요. */
export async function resetPassword(db: DatabaseSync, actor: JwtClaims, targetId: string, newPw: string): Promise<void> {
  const t = findUserById(db, targetId);
  if (!t) throw new AuthError("not_found", 404);
  const allowed =
    actor.role === "SUPERVISOR" ||
    (actor.role === "ADMIN" && t.role === "USER" && actor.orgId != null && actor.orgId === t.org_id);
  if (!allowed) throw new AuthError("forbidden", 403);
  if (newPw.length < 8) throw new AuthError("password_too_short", 400);
  updateUserPassword(db, targetId, await bcrypt.hash(newPw, AuthConfig.bcryptRounds));
}

export class AuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "AuthError";
  }
}
