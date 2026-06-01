import "server-only";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import type { DatabaseSync } from "node:sqlite";
import { AuthConfig, type Role } from "./config";
import {
  findOrgByName,
  findUserByEmail,
  insertApiDoc,
  insertApiUsageAt,
  insertOrg,
  insertUser,
  setApiDocStatus,
  type AccountStatus,
  type DocSource,
  type DocStatus,
} from "./db";
// 시드 데이터(계정·문서·사용내역)는 코드가 아닌 apps/web/seed/*.json 으로 분리. CLI는 scripts/seed.ts.
import accountsSeed from "../../seed/accounts.json";
import apiDocsSeed from "../../seed/apidocs.json";
import usageSeed from "../../seed/usage.json";

/**
 * 기본관리자(SUPERVISOR) 초기 설정 — .env(SUPERVISOR_EMAIL/PASSWORD)로 1회 생성.
 * 멱등: 이미 존재하면 skip. 첫 DB 접근 시 호출 (참고: DocuGuard onModuleInit).
 */
/** 멱등 부트스트랩(순수) — 이미 존재하면 false. 테스트 가능. */
export async function bootstrapSupervisor(
  db: DatabaseSync,
  email: string,
  password: string,
  rounds = AuthConfig.bcryptRounds,
): Promise<boolean> {
  if (!email || !password) return false;
  if (findUserByEmail(db, email)) return false;
  const hash = await bcrypt.hash(password, rounds);
  const secret = authenticator.generateSecret();
  insertUser(db, { email, passwordHash: hash, totpSecret: secret, role: "SUPERVISOR", status: "active" });
  return true;
}

/**
 * dev 테스트 계정 시드 (멱등). 데이터: apps/web/seed/accounts.json.
 * 기본값: ADMIN ad@x.com/ad1234, USER us@x.com/us1234 — 조직 'demo-org', 둘 다 active.
 * @returns 하나라도 새로 만들었으면 true, 모두 이미 존재하면 false.
 */
export async function seedTestAccounts(db: DatabaseSync, rounds = AuthConfig.bcryptRounds): Promise<boolean> {
  const org = findOrgByName(db, accountsSeed.org) ?? insertOrg(db, accountsSeed.org, "seed");
  let created = false;
  for (const u of accountsSeed.users) {
    if (findUserByEmail(db, u.email)) continue;
    const hash = await bcrypt.hash(u.password, rounds);
    insertUser(db, {
      email: u.email,
      passwordHash: hash,
      totpSecret: authenticator.generateSecret(),
      role: u.role as Role,
      status: u.status as AccountStatus,
      orgId: org.id,
    });
    created = true;
  }
  return created;
}

/**
 * dev 데모: 승인된 API 문서 + 다양한 tool/region/hour/caller 사용내역 시드 (그래픽 대시보드용).
 * 데이터: apps/web/seed/apidocs.json(문서·스펙) + apps/web/seed/usage.json(분포 설정).
 * 멱등: 데모 문서가 이미 있으면 false(사용내역 재생성 안 함).
 *
 * 주의: createItem/updateItem 스펙에 requestBody(ItemIn: name 필수·price)가 있어야 프록시가 body 전달 →
 * 없으면 빈 POST/PUT → upstream 422 → MCP 호출 실패. updateItem은 id path 파라미터 필수.
 */
export function seedDemoUsage(db: DatabaseSync): boolean {
  let created = false;
  for (const d of apiDocsSeed) {
    const owner = findUserByEmail(db, d.ownerEmail);
    if (!owner) continue;
    const existing = db.prepare("SELECT id FROM api_docs WHERE owner_id=? AND name=?").get(owner.id, d.name) as { id: string } | undefined;
    if (existing) continue;
    const doc = insertApiDoc(db, {
      ownerId: owner.id,
      orgId: owner.org_id,
      name: d.name,
      sourceType: d.sourceType as DocSource,
      specInline: JSON.stringify(d.spec),
      baseUrl: d.baseUrl,
    });
    if (d.status && d.status !== "pending") setApiDocStatus(db, doc.id, d.status as DocStatus, null, d.toolsCount ?? null);
    created = true;
  }
  if (!created) return false;

  // 사용내역: usage.json 의 결정적 분포(지역 가중치 × 시간/도구/호출자 순환)로 차트용 데이터 생성.
  const doc = db.prepare("SELECT id, org_id FROM api_docs WHERE name=?").get(usageSeed.docName) as { id: string; org_id: string | null } | undefined;
  if (doc) {
    let n = 0;
    for (let ri = 0; ri < usageSeed.regions.length; ri++) {
      const reps = usageSeed.regionWeight[ri] * 2;
      for (let k = 0; k < reps; k++) {
        const tool = usageSeed.tools[(ri + k) % usageSeed.tools.length];
        const caller = usageSeed.callers[(ri + k) % usageSeed.callers.length];
        const hoursAgo = (ri * 7 + k * 3) % usageSeed.hoursWindow;
        const ok = n % usageSeed.failEvery !== 0; // 일부 실패
        insertApiUsageAt(db, { docId: doc.id, orgId: doc.org_id, caller, tool, region: usageSeed.regions[ri], ok, hoursAgo });
        n++;
      }
    }
  }
  return true;
}

// 부트스트랩 1회 가드 — globalThis 공유(Next dev의 라우트별 모듈 인스턴스에서도 단일).
// 모듈 스코프 let이면 라우트마다 재실행 → reconcile 반복 → 프록시 kill/respawn churn → MCP 보고 유실.
const G = globalThis as unknown as { __mcpBootstrapped?: boolean };

/** 프로덕션 경로 — .env 기반, 1회만. 첫 DB 접근 시 호출. dev면 테스트 계정·데모 사용내역도 시드. */
export async function ensureSupervisor(db: DatabaseSync): Promise<void> {
  if (G.__mcpBootstrapped) return;
  G.__mcpBootstrapped = true;
  const created = await bootstrapSupervisor(db, AuthConfig.supervisorEmail, AuthConfig.supervisorPassword);
  if (created) {
    console.warn(`[auth] SUPERVISOR bootstrapped: ${AuthConfig.supervisorEmail} (TOTP 미활성 — /settings에서 등록)`);
  }
  if (AuthConfig.seedTestAccounts) {
    if (await seedTestAccounts(db)) {
      console.warn("[auth] 테스트 계정 시드: ad@x.com/ad1234 (ADMIN), us@x.com/us1234 (USER), org=demo-org");
    }
    if (seedDemoUsage(db)) console.warn("[auth] 데모 사용내역 시드 (대시보드 차트용)");
  }
  // 승인된 API 문서의 프록시(MCP HTTP) 자동 재기동
  try {
    const { reconcileProxies } = await import("./apidocs");
    const n = await reconcileProxies(db);
    if (n) console.warn(`[proxy] 승인 문서 ${n}개 프록시 자동 기동`);
  } catch (e) { console.warn(`[proxy] reconcile 실패: ${(e as Error).message}`); }
}
