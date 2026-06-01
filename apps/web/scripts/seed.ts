/**
 * 시드 CLI — `make seed` 진입점.
 * apps/web/seed/*.json(accounts·apidocs·usage)을 DB(SQLITE_PATH, 기본 ./var/app.db)에 멱등 적용.
 * 부팅 자동 시드(ensureSupervisor)와 동일 함수를 재사용 — 단, 프록시는 기동하지 않음(데이터만).
 * server-only 임포트는 scripts/tsconfig.json 의 paths 별칭으로 무력화(stub).
 */
import { getDb } from "../lib/server/db";
import { AuthConfig } from "../lib/server/config";
import { bootstrapSupervisor, seedTestAccounts, seedDemoUsage } from "../lib/server/bootstrap";

function count(db: ReturnType<typeof getDb>, table: string): number {
  return (db.prepare(`SELECT count(*) c FROM ${table}`).get() as { c: number }).c;
}

async function main() {
  const db = getDb();
  console.log(`[seed] DB: ${AuthConfig.sqlitePath}`);

  const sup = await bootstrapSupervisor(db, AuthConfig.supervisorEmail, AuthConfig.supervisorPassword);
  const accounts = await seedTestAccounts(db);
  const demo = seedDemoUsage(db);

  console.log(
    `[seed] supervisor ${sup ? "생성" : "skip(.env 미설정/존재)"} · ` +
    `accounts ${accounts ? "생성" : "이미 존재"} · demo ${demo ? "생성" : "이미 존재"}`,
  );
  console.log(`[seed] 완료 — users=${count(db, "users")}, api_docs=${count(db, "api_docs")}, api_usage=${count(db, "api_usage")}`);
}

main().catch((e) => {
  console.error("[seed] 실패:", e);
  process.exit(1);
});
