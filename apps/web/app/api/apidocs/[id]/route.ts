import { db, jsonError, requireActive } from "@/lib/server/context";
import { editDoc, removeDoc, toPublicDoc } from "@/lib/server/apidocs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** 수정 — 소유자(USER). 수정 시 재검토(pending)로 전환. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const actor = await requireActive(req);
    const { id } = await params;
    const { name, sourceRef, specInline, baseUrl, proxyPort } = await req.json();
    const doc = await editDoc(await db(), actor, id, {
      name: name ? String(name) : undefined,
      sourceRef: sourceRef !== undefined ? String(sourceRef) : undefined,
      specInline: specInline !== undefined ? (typeof specInline === "string" ? specInline : JSON.stringify(specInline)) : undefined,
      baseUrl: baseUrl !== undefined ? String(baseUrl) : undefined,
      proxyPort: proxyPort != null && proxyPort !== "" ? Number(proxyPort) : undefined,
    });
    return Response.json(toPublicDoc(doc));
  } catch (e) {
    return jsonError(e);
  }
}

/** 삭제 — 소유자(USER). */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const actor = await requireActive(req);
    const { id } = await params;
    removeDoc(await db(), actor, id);
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
