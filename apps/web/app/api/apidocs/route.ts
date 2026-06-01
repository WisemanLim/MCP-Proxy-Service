import { db, jsonError, requireActive } from "@/lib/server/context";
import { createDoc, listDocsFor, toPublicDoc } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 목록 — USER 본인 / ADMIN 조직 / SUPERVISOR 전체. */
export async function GET(req: Request) {
  try {
    const actor = await requireActive(req);
    const items = listDocsFor(await db(), actor).map(toPublicDoc);
    return Response.json({ items });
  } catch (e) {
    return jsonError(e);
  }
}

const SOURCES = ["url", "inline", "endpoints"] as const;

/** 등록 — active. 모드: url(스키마 링크) / endpoints(개별 등록) / inline. */
export async function POST(req: Request) {
  try {
    const actor = await requireActive(req, "USER", "ADMIN", "SUPERVISOR");
    const { name, sourceType, sourceRef, specInline, baseUrl } = await req.json();
    const st = SOURCES.includes(sourceType) ? sourceType : "url";
    const doc = createDoc(await db(), actor, {
      name: String(name ?? ""),
      sourceType: st,
      sourceRef: sourceRef ? String(sourceRef) : undefined,
      specInline: specInline ? (typeof specInline === "string" ? specInline : JSON.stringify(specInline)) : undefined,
      baseUrl: baseUrl ? String(baseUrl) : undefined,
    });
    return Response.json(toPublicDoc(doc), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
