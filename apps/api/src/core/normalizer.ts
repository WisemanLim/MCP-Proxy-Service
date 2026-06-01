import type { FieldsPolicy } from "@mcp-proxy/manifest";

/** C5/C6 응답 정규화: 필드 필터·페이지네이션·truncation·depth 제한 (PRD §4.3). */

export interface ControlParams {
  fields?: string; // comma-separated top-level 필드
  limit?: number;
  cursor?: number; // offset 기반 단순 커서
  sort?: string; // "field" 또는 "-field"
}

const TRUNCATED = "…[truncated]";
const DEPTH_LIMITED = "[depth-limited]";

function limitDepth(value: unknown, maxDepth: number, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth >= maxDepth) return Array.isArray(value) ? DEPTH_LIMITED : DEPTH_LIMITED;
  if (Array.isArray(value)) return value.map((v) => limitDepth(v, maxDepth, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, limitDepth(v, maxDepth, depth + 1)]),
  );
}

function truncateStrings(value: unknown, maxBytes: number): unknown {
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf-8") > maxBytes
      ? value.slice(0, maxBytes) + TRUNCATED
      : value;
  }
  if (Array.isArray(value)) return value.map((v) => truncateStrings(v, maxBytes));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, truncateStrings(v, maxBytes)]),
    );
  }
  return value;
}

/** allow-list 우선 + fields 요청 교집합으로 top-level 필드 projection (C5). */
function projectFields(obj: Record<string, unknown>, allow: string[], fields?: string[]): Record<string, unknown> {
  let keys = Object.keys(obj);
  if (allow.length > 0) keys = keys.filter((k) => allow.includes(k));
  if (fields && fields.length > 0) keys = keys.filter((k) => fields.includes(k));
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}

function applyProjection(value: unknown, allow: string[], fields?: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => applyProjection(v, allow, fields));
  if (value && typeof value === "object") return projectFields(value as Record<string, unknown>, allow, fields);
  return value;
}

export interface NormalizeMeta {
  fieldFiltered: boolean;
  paginated: boolean;
  returnedCount?: number;
  totalCount?: number;
  nextCursor?: number;
}

export function normalizeResponse(
  data: unknown,
  policy: FieldsPolicy,
  control: ControlParams = {},
): { data: unknown; meta: NormalizeMeta } {
  const meta: NormalizeMeta = { fieldFiltered: false, paginated: false };
  let out = data;

  // 1) 페이지네이션 (배열 응답에 강제, C6)
  if (Array.isArray(out)) {
    const total = out.length;
    let arr = out as unknown[];
    if (control.sort) {
      const desc = control.sort.startsWith("-");
      const key = desc ? control.sort.slice(1) : control.sort;
      arr = [...arr].sort((a, b) => {
        const av = (a as Record<string, unknown>)?.[key];
        const bv = (b as Record<string, unknown>)?.[key];
        const cmp = av! < bv! ? -1 : av! > bv! ? 1 : 0;
        return desc ? -cmp : cmp;
      });
    }
    const limit = control.limit ?? policy.defaultLimit;
    const offset = control.cursor ?? 0;
    const page = arr.slice(offset, offset + limit);
    meta.paginated = true;
    meta.totalCount = total;
    meta.returnedCount = page.length;
    if (offset + limit < total) meta.nextCursor = offset + limit;
    out = page;
  }

  // 2) 필드 필터 (allow-list + fields 요청, C5)
  const fields = control.fields ? control.fields.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  if (policy.allow.length > 0 || fields) {
    out = applyProjection(out, policy.allow, fields);
    meta.fieldFiltered = true;
  }

  // 3) depth 제한 + 4) string truncation (C6)
  out = limitDepth(out, policy.maxDepth);
  out = truncateStrings(out, policy.truncateBytes);

  return { data: out, meta };
}
