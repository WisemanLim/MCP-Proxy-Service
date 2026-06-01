import "server-only";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createServer } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import type { OpenAPISpec } from "@mcp-proxy/converter";
import { listUsedProxyPorts } from "./db";
import { AuthConfig } from "./config";

/**
 * 승인된 API 문서 → 프록시(MCP HTTP) 프로세스 자동 기동/중지.
 * - 승인 시 20000~59999 범위의 **빈 포트를 임의 할당**(DB 영속화) → spec.json·manifest.json 기록 후
 *   `node apps/api/dist/main.js` 를 TRANSPORT=http 로 spawn.
 * - 반려/수정/삭제 시 중지. 부팅 시 승인 문서 재기동(reconcile, 저장 포트 재사용).
 * - 포트 충돌 회피: DB 할당 목록 + 실행 중 맵 + OS 바인드 검사로 제외.
 */

const PORT_MIN = 20000;
const PORT_MAX = 60000; // 미만

export function slugFor(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "api";
}

type Proc = { proc: ChildProcess; port: number; baseUrl: string; startedAt: number };
// HMR/리로드에도 살아남도록 globalThis 에 보관
const g = globalThis as unknown as { __mcpProxies?: Map<string, Proc> };
const procs: Map<string, Proc> = (g.__mcpProxies ??= new Map());

/** 포트가 비어 있는지 OS 바인드로 확인 (127.0.0.1). */
function isPortFree(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = createServer();
    s.once("error", () => res(false));
    s.once("listening", () => s.close(() => res(true)));
    s.listen(port, "127.0.0.1");
  });
}

/** 의사난수 정수 [min,max). Date 의존 없이 crypto 미사용 단순 난수. */
function randPort(): number {
  return PORT_MIN + Math.floor(Math.random() * (PORT_MAX - PORT_MIN));
}

/**
 * 승인 시 빈 프록시 포트 할당. DB 할당분·실행 중 포트·OS 사용분 제외.
 * 200회 시도 내 미발견 시 throw.
 */
export async function allocateProxyPort(db: DatabaseSync): Promise<number> {
  const used = new Set<number>([...listUsedProxyPorts(db), ...[...procs.values()].map((p) => p.port)]);
  for (let i = 0; i < 200; i++) {
    const port = randPort();
    if (used.has(port)) continue;
    if (await isPortFree(port)) return port;
    used.add(port);
  }
  throw new Error("no_free_proxy_port");
}

/** apps/api/dist/main.js 절대경로 탐색 (apps/web cwd 기준 상위 탐색). */
function mainJsPath(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const cand = resolve(dir, "apps/api/dist/main.js");
    if (existsSync(cand)) return cand;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const sibling = resolve(process.cwd(), "../api/dist/main.js");
  return existsSync(sibling) ? sibling : null;
}

function runtimeDir(docId: string): string {
  const d = resolve(process.cwd(), "var/proxies", docId);
  mkdirSync(d, { recursive: true });
  return d;
}

export type ProxyStatus = { running: boolean; port: number | null; url: string | null; startedAt?: number; error?: string };

export function proxyStatus(docId: string, assignedPort: number | null): ProxyStatus {
  const p = procs.get(docId);
  const port = p?.port ?? assignedPort ?? null;
  const url = port ? `http://localhost:${port}/mcp` : null;
  if (p && p.proc.exitCode === null && !p.proc.killed) return { running: true, port, url, startedAt: p.startedAt };
  return { running: false, port, url };
}

export function stopProxy(docId: string): void {
  const p = procs.get(docId);
  if (p) { try { p.proc.kill("SIGTERM"); } catch { /* noop */ } procs.delete(docId); }
}

/** 해당 포트를 점유한 프로세스 강제 종료 — 이전 웹 인스턴스의 고아 프록시(옛 dist) 정리. 포트는 숫자라 안전. */
function freePort(port: number): void {
  try { execSync(`lsof -ti tcp:${port} | xargs kill -9`, { stdio: "ignore", shell: "/bin/sh" }); } catch { /* 점유 없음 */ }
}

/** 추적 중인 프록시 전부 종료 + 맵 초기화 (reconcile 직전). 포트 점유 고아는 startProxy의 freePort가 처리. */
export function killAllProxies(): void {
  for (const [, p] of procs) { try { p.proc.kill("SIGTERM"); } catch { /* noop */ } }
  procs.clear();
}

/**
 * 프록시 기동(이미 실행 중이면 재시작). 할당된 포트(port)로 spec/manifest 기록 후 spawn.
 * main.js 미빌드면 error 반환(가이드 수동 실행 폴백).
 */
export function startProxy(opts: {
  docId: string; name: string; baseUrl: string | null; spec: OpenAPISpec; port: number;
}): ProxyStatus {
  const { docId, name, port } = opts;
  const baseUrl = opts.baseUrl ?? opts.spec.servers?.[0]?.url ?? "https://example.com";
  const url = `http://localhost:${port}/mcp`;

  const main = mainJsPath();
  if (!main) return { running: false, port, url, error: "apps/api 미빌드 — `pnpm --filter @mcp-proxy/api build` 후 자동 기동" };

  stopProxy(docId); // 추적 중인 동일 docId 프록시 종료
  freePort(port);   // 포트 점유 고아 프로세스(이전 인스턴스·옛 dist) 정리 후 바인드

  const dir = runtimeDir(docId);
  const specPath = resolve(dir, "spec.json");
  const manifestPath = resolve(dir, "manifest.json");
  writeFileSync(specPath, JSON.stringify(opts.spec, null, 2));
  writeFileSync(manifestPath, JSON.stringify(
    { name: slugFor(name), baseUrl, fieldsPolicy: { defaultLimit: 20, truncateBytes: 2048, maxDepth: 4 } },
    null, 2,
  ));

  // 사용내역 보고 → 플랫폼 ingest 엔드포인트(docId별). 토큰은 공유 USAGE_TOKEN.
  const usageUrl = `${AuthConfig.appBaseUrl.replace(/\/$/, "")}/api/apidocs/${docId}/usage`;
  const proc = spawn(process.execPath, [main], {
    env: {
      ...process.env,
      TRANSPORT: "http", PORT: String(port), SPEC_PATH: specPath, MANIFEST_PATH: manifestPath,
      USAGE_REPORT_URL: usageUrl, USAGE_TOKEN: AuthConfig.usageToken,
    },
    stdio: "ignore",
    detached: false,
  });
  proc.on("exit", (code) => {
    const cur = procs.get(docId);
    if (cur && cur.proc === proc) procs.delete(docId);
    if (code) console.warn(`[proxy] ${docId} exited code=${code} (port ${port})`);
  });
  procs.set(docId, { proc, port, baseUrl, startedAt: Date.now() });
  return { running: true, port, url, startedAt: Date.now() };
}
