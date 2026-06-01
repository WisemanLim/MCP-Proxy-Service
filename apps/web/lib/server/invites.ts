import "server-only";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import type { DatabaseSync } from "node:sqlite";
import { AuthConfig, type Role } from "./config";
import { AuthError, signToken, toPublic, type JwtClaims, type LoginResult } from "./auth-server";
import {
  findInvitationByToken,
  findOrgById,
  findUserByEmail,
  insertInvitation,
  insertUser,
  isInvitationExpired,
  markInvitationAccepted,
  type InvitationRow,
} from "./db";

const TTL_MINUTES = 30;

function genToken(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, "") + globalThis.crypto.randomUUID().replace(/-/g, "");
}

export interface CreateInviteInput {
  mode: "email" | "link";
  email?: string;        // email 모드
  role: Role;            // ADMIN | USER (SUPERVISOR 초대 불가)
  orgId?: string;        // SUPERVISOR는 지정, ADMIN은 자기 조직 강제
  allowedDomain?: string; // link 모드
}

/** 초대 생성 — ADMIN(자기 조직, role=USER) / SUPERVISOR(임의 조직, role USER|ADMIN). */
export function createInvite(db: DatabaseSync, actor: JwtClaims, input: CreateInviteInput): { invite: InvitationRow; link: string } {
  if (input.role === "SUPERVISOR" as Role) throw new AuthError("cannot_invite_supervisor", 400);
  const role: Role = input.role === "ADMIN" ? "ADMIN" : "USER";

  let orgId: string;
  if (actor.role === "ADMIN") {
    if (!actor.orgId) throw new AuthError("admin_without_org", 400);
    orgId = actor.orgId;
    if (role !== "USER") throw new AuthError("admin_can_invite_user_only", 403);
  } else if (actor.role === "SUPERVISOR") {
    if (!input.orgId || !findOrgById(db, input.orgId)) throw new AuthError("org_required", 400);
    orgId = input.orgId;
  } else {
    throw new AuthError("forbidden", 403);
  }

  if (input.mode === "email") {
    const email = (input.email ?? "").trim().toLowerCase();
    if (!email) throw new AuthError("email_required", 400);
    if (findUserByEmail(db, email)) throw new AuthError("email_already_registered", 400);
    const invite = insertInvitation(db, { token: genToken(), type: "email", email, role, orgId, allowedDomain: null, createdBy: actor.sub, ttlMinutes: TTL_MINUTES });
    return { invite, link: inviteLink(invite.token) };
  }
  // link
  const domain = (input.allowedDomain ?? "").trim().toLowerCase().replace(/^@/, "");
  if (!domain) throw new AuthError("allowed_domain_required", 400);
  const invite = insertInvitation(db, { token: genToken(), type: "link", email: null, role, orgId, allowedDomain: domain, createdBy: actor.sub, ttlMinutes: TTL_MINUTES });
  return { invite, link: inviteLink(invite.token) };
}

export function inviteLink(token: string): string {
  return `${AuthConfig.appBaseUrl.replace(/\/$/, "")}/invite/${token}`;
}

/** 수락 페이지용 정보. 만료/사용 검증. */
export function getInviteInfo(db: DatabaseSync, token: string) {
  const inv = findInvitationByToken(db, token);
  if (!inv) throw new AuthError("invite_not_found", 404);
  if (inv.type === "email" && inv.accepted) throw new AuthError("invite_used", 410);
  if (isInvitationExpired(db, token)) throw new AuthError("invite_expired", 410);
  const org = findOrgById(db, inv.org_id);
  return {
    type: inv.type,
    email: inv.email,
    role: inv.role,
    orgName: org?.name ?? null,
    allowedDomain: inv.allowed_domain,
  };
}

/** 초대 수락 → 계정 생성(active) + 자동 로그인 토큰. */
export async function acceptInvite(db: DatabaseSync, token: string, input: { email?: string; password: string }): Promise<LoginResult> {
  const inv = findInvitationByToken(db, token);
  if (!inv) throw new AuthError("invite_not_found", 404);
  if (inv.type === "email" && inv.accepted) throw new AuthError("invite_used", 410);
  if (isInvitationExpired(db, token)) throw new AuthError("invite_expired", 410);
  if ((input.password ?? "").length < 8) throw new AuthError("password_too_short", 400);

  let email: string;
  if (inv.type === "email") {
    email = inv.email!;
  } else {
    email = (input.email ?? "").trim().toLowerCase();
    if (!email) throw new AuthError("email_required", 400);
    if (inv.allowed_domain && !email.endsWith("@" + inv.allowed_domain)) throw new AuthError("email_domain_not_allowed", 403);
  }
  if (findUserByEmail(db, email)) throw new AuthError("email_already_registered", 400);

  const hash = await bcrypt.hash(input.password, AuthConfig.bcryptRounds);
  const u = insertUser(db, { email, passwordHash: hash, totpSecret: authenticator.generateSecret(), role: inv.role, status: "active", orgId: inv.org_id });
  if (inv.type === "email") markInvitationAccepted(db, inv.id);

  const tok = await signToken({ sub: u.id, email: u.email, role: u.role, status: u.status, orgId: u.org_id });
  return { token: tok, tokenType: "Bearer", user: toPublic(db, u) };
}
