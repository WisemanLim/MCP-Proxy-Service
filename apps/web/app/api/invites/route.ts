import { db, jsonError, requireActive } from "@/lib/server/context";
import { createInvite } from "@/lib/server/invites";
import { sendInviteEmail, smtpConfigured } from "@/lib/server/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 멤버 초대 생성 — SUPERVISOR/ADMIN.
 * mode=email: 해당 이메일로 메일 발송(SMTP) — 미설정 시 link 반환.
 * mode=link: 조직+허용 도메인 정의한 30분 링크 반환.
 */
export async function POST(req: Request) {
  try {
    const actor = await requireActive(req, "SUPERVISOR", "ADMIN");
    const body = await req.json();
    const d = await db();
    const { invite, link } = createInvite(d, actor, {
      mode: body.mode === "link" ? "link" : "email",
      email: body.email,
      role: body.role === "ADMIN" ? "ADMIN" : "USER",
      orgId: body.orgId,
      allowedDomain: body.allowedDomain,
    });

    let sent = false;
    if (invite.type === "email") {
      const org = body.orgName ?? invite.org_id;
      sent = await sendInviteEmail(invite.email!, link, String(org), invite.role);
    }
    return Response.json({
      token: invite.token,
      type: invite.type,
      link,                 // dev/표시용 (메일 미발송 시 직접 전달)
      emailSent: sent,
      smtpConfigured: smtpConfigured(),
      expiresAt: invite.expires_at,
    }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
