/** 서버 인증 런타임 설정. SUPERVISOR 부트스트랩은 .env로 초기화 (참고: DocuGuard Runtime). */
import "server-only";

export const AuthConfig = {
  jwtSecret: process.env.JWT_SECRET ?? "change-me-in-prod",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  totpIssuer: process.env.TOTP_ISSUER ?? "MCP-Proxy",
  sqlitePath: process.env.SQLITE_PATH ?? "./var/app.db",
  // 기본관리자(SUPERVISOR) 초기 설정 — 둘 다 있으면 첫 부팅 시 1회 생성
  supervisorEmail: process.env.SUPERVISOR_EMAIL ?? "",
  supervisorPassword: process.env.SUPERVISOR_PASSWORD ?? "",
  // dev 테스트 계정 시드 (ad@x.com/ad1234 ADMIN, us@x.com/us1234 USER)
  seedTestAccounts: (process.env.SEED_TEST_ACCOUNTS ?? "").toLowerCase() === "true",
  // MCP 프록시 → 사용내역 보고용 공유 토큰 (헤드리스)
  usageToken: process.env.USAGE_TOKEN ?? "",
  // 앱 베이스 URL (초대 링크 생성)
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  // SMTP (초대 메일). host 미설정 시 메일 대신 링크 반환(dev 폴백)
  smtp: {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM ?? "no-reply@mcp-proxy.local",
    secure: (process.env.SMTP_SECURE ?? "").toLowerCase() === "true",
  },
};

export type Role = "SUPERVISOR" | "ADMIN" | "USER";
export const ROLES: Role[] = ["SUPERVISOR", "ADMIN", "USER"];
