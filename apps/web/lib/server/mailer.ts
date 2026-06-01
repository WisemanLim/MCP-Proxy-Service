import "server-only";
import { createRequire } from "node:module";
import { AuthConfig } from "./config";

// nodemailer 런타임 require (번들러 정적분석 회피)
const require = createRequire(import.meta.url);

export function smtpConfigured(): boolean {
  return !!AuthConfig.smtp.host;
}

/** Claude 스타일 초대 메일 HTML (첨부 이메일 템플릿 참고). */
export function inviteEmailHtml(opts: { link: string; org: string; role: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f1efe9;font-family:system-ui,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;padding:48px 40px;text-align:center">
      <tr><td style="font-weight:700;color:#b45309;font-size:18px;padding-bottom:24px">MCP Proxy</td></tr>
      <tr><td style="font-size:28px;font-weight:800;color:#111;padding-bottom:8px">팀에 초대되었습니다</td></tr>
      <tr><td style="color:#475569;font-size:15px;padding-bottom:28px">조직 <b>${opts.org}</b> · 역할 <b>${opts.role}</b><br/>아래 버튼으로 가입을 완료하세요. (링크 30분 유효)</td></tr>
      <tr><td style="padding-bottom:28px">
        <a href="${opts.link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700">가입 완료하기</a>
      </td></tr>
      <tr><td style="color:#94a3b8;font-size:12px">본 메일을 요청하지 않았다면 무시하셔도 됩니다.<br/>${opts.link}</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/** 초대 메일 발송. SMTP 미설정 시 false (호출측이 링크 반환 폴백). */
export async function sendInviteEmail(to: string, link: string, org: string, role: string): Promise<boolean> {
  if (!smtpConfigured()) return false;
  const nodemailer = require("nodemailer") as typeof import("nodemailer");
  const t = nodemailer.createTransport({
    host: AuthConfig.smtp.host,
    port: AuthConfig.smtp.port,
    secure: AuthConfig.smtp.secure,
    auth: AuthConfig.smtp.user ? { user: AuthConfig.smtp.user, pass: AuthConfig.smtp.pass } : undefined,
  });
  await t.sendMail({
    from: AuthConfig.smtp.from,
    to,
    subject: `[MCP Proxy] ${org} 팀 초대`,
    html: inviteEmailHtml({ link, org, role }),
  });
  return true;
}
