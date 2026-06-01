import { db, jsonError, requireActive } from "@/lib/server/context";
import { changeUser } from "@/lib/server/auth-server";
import { ROLES, type Role } from "@/lib/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["pending", "active", "rejected", "disabled"] as const;

/** 역할/상태 변경 — SUPERVISOR(역할+상태) / ADMIN(같은 조직 USER 상태). Part B 1. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActive(req, "SUPERVISOR", "ADMIN");
    const { id } = await params;
    const { role, status } = await req.json();
    const patch: { role?: Role; status?: (typeof STATUSES)[number] } = {};
    if (role && ROLES.includes(role)) patch.role = role;
    if (status && STATUSES.includes(status)) patch.status = status;
    return Response.json(changeUser(await db(), actor, id, patch));
  } catch (e) {
    return jsonError(e);
  }
}
