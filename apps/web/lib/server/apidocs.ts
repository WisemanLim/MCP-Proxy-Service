import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { loadSpecFromString, loadSpecInline, convert, type OpenAPISpec } from "@mcp-proxy/converter";
import { extractSpecFromHtml } from "../html-spec-extractor";
import { parseManifest } from "@mcp-proxy/manifest";
import type { JwtClaims } from "./auth-server";
import { AuthError } from "./auth-server";
import { startProxy, stopProxy, allocateProxyPort, killAllProxies, isPortFree, PORT_MIN, PORT_MAX } from "./proxy-runtime";
import { setApiDocProxyPort, findDocIdByProxyPort } from "./db";
import {
  type ApiDocRow,
  type DocSource,
  type EndpointRow,
  findApiDocById,
  insertApiDoc,
  listAllApiDocs,
  listApiDocsByOrg,
  listApiDocsByOwner,
  setApiDocStatus,
  updateApiDoc,
  deleteApiDoc,
  insertEndpoint,
  listEndpoints,
  findEndpoint,
  deleteEndpoint,
} from "./db";

/** API 문서(OpenAPI URL/inline) 워크플로 — PRD §4.1 A1 + Part A 승인. */

export function toPublicDoc(d: ApiDocRow) {
  return {
    id: d.id,
    name: d.name,
    sourceType: d.source_type,
    sourceRef: d.source_ref,
    baseUrl: d.base_url,
    status: d.status,
    reason: d.reason,
    toolsCount: d.tools_count,
    ownerId: d.owner_id,
    orgId: d.org_id,
    proxyPort: d.proxy_port,
    updatedAt: d.updated_at,
  };
}

/**
 * 사용자 지정 프록시 포트 검증 — 범위·중복(다른 문서)·OS 점유.
 * excludeId: 수정 시 자기 자신은 중복 검사에서 제외.
 * 위반 시 AuthError(400) throw → 등록/수정 거부, 사용자에게 다른 포트 유도.
 */
async function validateProxyPort(db: DatabaseSync, port: number, excludeId?: string): Promise<void> {
  if (!Number.isInteger(port) || port < PORT_MIN || port >= PORT_MAX) {
    throw new AuthError(`port_out_of_range: ${PORT_MIN}~${PORT_MAX - 1} 범위의 정수만 가능`, 400);
  }
  const owner = findDocIdByProxyPort(db, port);
  if (owner && owner !== excludeId) {
    throw new AuthError(`port_in_use: 포트 ${port} 은 다른 문서가 사용 중 — 다른 포트를 지정하세요`, 400);
  }
  if (!(await isPortFree(port))) {
    throw new AuthError(`port_occupied: 포트 ${port} 이 이미 점유됨 — 다른 포트를 지정하세요`, 400);
  }
}

/** USER: 본인 / ADMIN: 같은 조직 / SUPERVISOR: 전체. */
export function listDocsFor(db: DatabaseSync, actor: JwtClaims): ApiDocRow[] {
  if (actor.role === "SUPERVISOR") return listAllApiDocs(db);
  if (actor.role === "ADMIN") return actor.orgId ? listApiDocsByOrg(db, actor.orgId) : [];
  return listApiDocsByOwner(db, actor.sub);
}

/**
 * 문서 생성 — 2가지 모드 (PRD A1).
 * - url: 스키마 링크(openapi.json / v3/api-docs)
 * - endpoints: 개별 REST API 등록(이후 addEndpoint로 추가) — baseUrl 필수
 * - inline: 스펙 JSON 직접(주로 테스트)
 */
export async function createDoc(
  db: DatabaseSync,
  actor: JwtClaims,
  input: { name: string; sourceType: DocSource; sourceRef?: string; specInline?: string; baseUrl?: string; proxyPort?: number },
): Promise<ApiDocRow> {
  if (!input.name) throw new AuthError("name_required", 400);
  if (input.sourceType === "url" && !input.sourceRef) throw new AuthError("url_required", 400);
  if (input.sourceType === "inline" && !input.specInline) throw new AuthError("spec_required", 400);
  if (input.sourceType === "endpoints" && !input.baseUrl) throw new AuthError("base_url_required", 400);
  if (input.proxyPort != null) await validateProxyPort(db, input.proxyPort);
  return insertApiDoc(db, {
    ownerId: actor.sub,
    orgId: actor.orgId,
    name: input.name,
    sourceType: input.sourceType,
    proxyPort: input.proxyPort ?? null,
    sourceRef: input.sourceRef ?? null,
    specInline: input.specInline ?? null,
    baseUrl: input.baseUrl ?? null,
  });
}

/** 대상(upstream) API 서버 도달성 확인 — 연결 자체가 안 되면 통신오류. 응답코드는 무관(404여도 살아있음). */
export async function probeUpstream(baseUrl: string | null): Promise<{ reachable: boolean; status?: number; error?: string }> {
  if (!baseUrl) return { reachable: false, error: "baseUrl 미설정" };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const res = await fetch(baseUrl, { method: "GET", signal: ctrl.signal });
    return { reachable: true, status: res.status };
  } catch (e) {
    return { reachable: false, error: (e as Error).name === "AbortError" ? "timeout (3s)" : (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

/** path의 {token} → path 파라미터 자동 합성. */
function pathParams(path: string) {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
    name: m[1], in: "path" as const, required: true, schema: { type: "string" },
  }));
}

/** 개별 endpoint 목록 → OpenAPI 스펙 합성 (모드 endpoints). */
export function synthesizeSpec(doc: ApiDocRow, endpoints: EndpointRow[]): OpenAPISpec {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const ep of endpoints) {
    const item = (paths[ep.path] ??= {});
    item[ep.method] = {
      summary: ep.summary ?? `${ep.method.toUpperCase()} ${ep.path}`,
      parameters: pathParams(ep.path),
      responses: { "200": { description: "ok" } },
    };
  }
  return {
    openapi: "3.0.0",
    info: { title: doc.name, version: "1.0.0" },
    servers: [{ url: doc.base_url ?? "https://example.com" }],
    paths,
  } as OpenAPISpec;
}

// ───── 개별 endpoint 관리 (소유자, 변경 시 pending 재설정) ─────
export function addEndpoint(db: DatabaseSync, actor: JwtClaims, docId: string, method: string, path: string, summary?: string): EndpointRow {
  const doc = findApiDocById(db, docId);
  if (!doc) throw new AuthError("not_found", 404);
  ownerOnly(actor, doc);
  if (doc.source_type !== "endpoints") throw new AuthError("not_endpoints_mode", 400);
  if (!path.startsWith("/")) throw new AuthError("path_must_start_slash", 400);
  const ep = insertEndpoint(db, docId, method, path, summary ?? null);
  setApiDocStatus(db, docId, "pending", null, null);
  stopProxy(docId);
  return ep;
}
export function listDocEndpoints(db: DatabaseSync, actor: JwtClaims, docId: string): EndpointRow[] {
  const doc = findApiDocById(db, docId);
  if (!doc) throw new AuthError("not_found", 404);
  // 소유자 또는 검토자(같은 조직 ADMIN/SUPERVISOR)
  if (doc.owner_id !== actor.sub && !canReview(actor, doc)) throw new AuthError("forbidden", 403);
  return listEndpoints(db, docId);
}
export function removeEndpoint(db: DatabaseSync, actor: JwtClaims, endpointId: string): void {
  const ep = findEndpoint(db, endpointId);
  if (!ep) throw new AuthError("not_found", 404);
  const doc = findApiDocById(db, ep.doc_id);
  if (!doc) throw new AuthError("not_found", 404);
  ownerOnly(actor, doc);
  deleteEndpoint(db, endpointId);
  setApiDocStatus(db, ep.doc_id, "pending", null, null);
  stopProxy(ep.doc_id);
}

function ownerOnly(actor: JwtClaims, doc: ApiDocRow) {
  if (doc.owner_id !== actor.sub) throw new AuthError("forbidden", 403);
}

export async function editDoc(db: DatabaseSync, actor: JwtClaims, id: string, patch: { name?: string; sourceRef?: string; specInline?: string; baseUrl?: string; proxyPort?: number }): Promise<ApiDocRow> {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  ownerOnly(actor, doc);
  if (patch.proxyPort != null && patch.proxyPort !== doc.proxy_port) await validateProxyPort(db, patch.proxyPort, id);
  updateApiDoc(db, id, patch); // status → pending 재설정
  stopProxy(id); // 변경되면 재승인 필요 → 기존 프록시 중지
  return findApiDocById(db, id)!;
}

export function removeDoc(db: DatabaseSync, actor: JwtClaims, id: string): void {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  ownerOnly(actor, doc);
  stopProxy(id);
  deleteApiDoc(db, id);
}

/** 검토 권한: SUPERVISOR=전체, ADMIN=같은 조직. */
function canReview(actor: JwtClaims, doc: ApiDocRow): boolean {
  if (actor.role === "SUPERVISOR") return true;
  if (actor.role === "ADMIN") return actor.orgId != null && actor.orgId === doc.org_id;
  return false;
}

async function loadSpec(db: DatabaseSync, doc: ApiDocRow): Promise<OpenAPISpec> {
  if (doc.source_type === "endpoints") {
    const eps = listEndpoints(db, doc.id);
    if (eps.length === 0) throw new AuthError("no_endpoints", 400);
    return synthesizeSpec(doc, eps);
  }
  if (doc.source_type === "inline" && doc.spec_inline) return loadSpecInline(JSON.parse(doc.spec_inline));
  if (doc.source_type === "url" && doc.source_ref) {
    const res = await fetch(doc.source_ref);
    if (!res.ok) throw new AuthError(`upstream_fetch_failed_${res.status}`, 502);
    const text = await res.text();
    if (text.trimStart().startsWith("<")) {
      try { return await extractSpecFromHtml(text, doc.source_ref); }
      catch (e) { throw new AuthError((e as Error).message, 400); }
    }
    return loadSpecFromString(text);
  }
  throw new AuthError("no_spec_source", 400);
}

/** ADMIN/SUPERVISOR 미리보기: URL fetch + 변환 → 정상/비정상 판단 자료 (Part A 4). */
export async function previewDoc(db: DatabaseSync, actor: JwtClaims, id: string) {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  if (!canReview(actor, doc)) throw new AuthError("forbidden", 403);
  try {
    const spec = await loadSpec(db, doc);
    const effectiveBaseUrl = doc.base_url ?? spec.servers?.[0]?.url ?? "https://example.com";
    const r = convert(spec, parseManifest({ baseUrl: effectiveBaseUrl }));
    const upstream = await probeUpstream(effectiveBaseUrl);
    return {
      ok: true,
      metadata: r.metadata,
      tools: r.plan.tools.map((t) => ({ name: t.name, method: t.method, path: t.path })),
      excluded: r.plan.excluded,
      upstream,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function approveDoc(db: DatabaseSync, actor: JwtClaims, id: string): Promise<ApiDocRow> {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  if (!canReview(actor, doc)) throw new AuthError("forbidden", 403);
  // 승인 시 변환 검증으로 tools_count 기록
  let toolsCount: number | null = null;
  let spec;
  try {
    spec = await loadSpec(db, doc);
    toolsCount = convert(spec, parseManifest({ baseUrl: doc.base_url ?? spec.servers?.[0]?.url ?? "https://example.com" })).plan.tools.length;
  } catch (e) {
    throw new AuthError(`cannot_approve_invalid_spec: ${(e as Error).message}`, 400);
  }
  setApiDocStatus(db, id, "approved", null, toolsCount);
  // 승인 즉시 프록시(MCP HTTP) 자동 기동 — 실패해도 승인은 유지(가이드 self-heal 폴백).
  try { await ensureProxyRunning(db, findApiDocById(db, id)!); }
  catch (e) { console.warn(`[approve] proxy start failed: ${(e as Error).message}`); }
  return findApiDocById(db, id)!;
}

/**
 * 문서 시험·확인 — 소유자 또는 검토자 누구나(USER/ADMIN/SUPERVISOR). 가시 범위면 가능.
 * approved 포함 모든 상태에서 호출 가능(스펙 fetch/합성 + 변환 결과 반환).
 */
export async function testDoc(db: DatabaseSync, actor: JwtClaims, id: string) {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  if (doc.owner_id !== actor.sub && !canReview(actor, doc)) throw new AuthError("forbidden", 403);
  try {
    const spec = await loadSpec(db, doc);
    const effectiveBaseUrl = doc.base_url ?? spec.servers?.[0]?.url ?? "https://example.com";
    const r = convert(spec, parseManifest({ baseUrl: effectiveBaseUrl }));
    const upstream = await probeUpstream(effectiveBaseUrl);
    return {
      ok: true,
      metadata: r.metadata,
      tools: r.plan.tools.map((t) => ({ name: t.name, method: t.method, path: t.path })),
      excluded: r.plan.excluded,
      upstream,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 승인된 문서의 OpenAPI 스펙 JSON 반환 (가이드/다운로드용). 소유자 또는 검토자. */
export async function getDocSpec(db: DatabaseSync, actor: JwtClaims, id: string): Promise<OpenAPISpec> {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  if (doc.owner_id !== actor.sub && !canReview(actor, doc)) throw new AuthError("forbidden", 403);
  if (doc.status !== "approved") throw new AuthError("not_approved", 400);
  return loadSpec(db, doc);
}

/** 승인 문서 프록시 기동(멱등) — 포트 미할당이면 할당·영속화 후 spawn. */
async function ensureProxyRunning(db: DatabaseSync, doc: ApiDocRow): Promise<void> {
  const spec = await loadSpec(db, doc);
  let port = doc.proxy_port;
  if (!port) { port = await allocateProxyPort(db); setApiDocProxyPort(db, doc.id, port); }
  startProxy({ docId: doc.id, name: doc.name, baseUrl: doc.base_url, spec, port });
}

/**
 * 가시 범위 사용자에게 프록시 상태 노출 (가이드·UI용).
 * self-heal: approved인데 미실행이면 자동 기동(웹 재시작·기동 실패 복구).
 */
export async function docProxyStatus(db: DatabaseSync, actor: JwtClaims, id: string) {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  if (doc.owner_id !== actor.sub && !canReview(actor, doc)) throw new AuthError("forbidden", 403);
  const { proxyStatus } = await import("./proxy-runtime");
  let st = proxyStatus(id, doc.proxy_port);
  if (!st.running && doc.status === "approved") {
    try { await ensureProxyRunning(db, doc); st = proxyStatus(id, findApiDocById(db, id)!.proxy_port); }
    catch (e) { return { ...st, error: (e as Error).message }; }
  }
  return st;
}

/** 프록시 강제 재시작 — 현재 코드/dist로 stopProxy + 재spawn (옛 바이너리·env 드리프트 복구). */
export async function restartDocProxy(db: DatabaseSync, actor: JwtClaims, id: string) {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  if (doc.owner_id !== actor.sub && !canReview(actor, doc)) throw new AuthError("forbidden", 403);
  if (doc.status !== "approved") throw new AuthError("not_approved", 400);
  stopProxy(id);
  await ensureProxyRunning(db, doc);
  const { proxyStatus } = await import("./proxy-runtime");
  return proxyStatus(id, findApiDocById(db, id)!.proxy_port);
}

/** 부팅 시 승인된 문서의 프록시 재기동 (멱등 — 저장 포트 재사용, 없으면 할당). */
export async function reconcileProxies(db: DatabaseSync): Promise<number> {
  killAllProxies(); // 이전 인스턴스 고아 프록시(옛 dist·포트 점유) 정리 후 최신 dist로 재기동
  let started = 0;
  for (const doc of listAllApiDocs(db)) {
    if (doc.status !== "approved") continue;
    try { await ensureProxyRunning(db, doc); started++; }
    catch (e) { console.warn(`[reconcile] ${doc.id} skip: ${(e as Error).message}`); }
  }
  return started;
}

export function rejectDoc(db: DatabaseSync, actor: JwtClaims, id: string, reason: string): ApiDocRow {
  const doc = findApiDocById(db, id);
  if (!doc) throw new AuthError("not_found", 404);
  if (!canReview(actor, doc)) throw new AuthError("forbidden", 403);
  setApiDocStatus(db, id, "rejected", reason || "rejected", null);
  stopProxy(id);
  return findApiDocById(db, id)!;
}
