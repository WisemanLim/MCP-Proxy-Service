import "server-only";
import { getDb } from "./db";
import { ensureSupervisor } from "./bootstrap";
import { AuthError, verifyToken, type JwtClaims } from "./auth-server";
import type { Role } from "./config";

/** 라우트 핸들러 공용: DB 획득(+부트스트랩) 및 Bearer 토큰 추출. */

export async function db() {
  const d = getDb();
  await ensureSupervisor(d);
  return d;
}

export async function requireAuth(req: Request): Promise<JwtClaims> {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) throw new AuthError("missing_bearer_token", 401);
  try {
    return await verifyToken(m[1]);
  } catch {
    throw new AuthError("invalid_token", 401);
  }
}

export async function requireRole(req: Request, ...roles: Role[]): Promise<JwtClaims> {
  const claims = await requireAuth(req);
  if (!roles.includes(claims.role)) throw new AuthError("forbidden", 403);
  return claims;
}

/** 정상 이용 가능(active) 상태 + (선택) 역할 요구. */
export async function requireActive(req: Request, ...roles: Role[]): Promise<JwtClaims> {
  const claims = await requireAuth(req);
  if (claims.status !== "active") throw new AuthError("account_not_active", 403);
  if (roles.length && !roles.includes(claims.role)) throw new AuthError("forbidden", 403);
  return claims;
}

export function jsonError(e: unknown): Response {
  const status = e instanceof AuthError ? e.status : 500;
  const message = e instanceof Error ? e.message : "internal_error";
  return Response.json({ error: message }, { status });
}
