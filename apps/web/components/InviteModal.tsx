"use client";

import { useState } from "react";
import { api, type InviteResult } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type Mode = "email" | "link";

/** 멤버 초대 모달 — 이메일 발송 / 초대 링크 (첨부 디자인 참고). */
export default function InviteModal({ orgId, orgName, onClose }: { orgId?: string; orgName?: string; onClose: () => void }) {
  const me = getStoredUser();
  const isSup = me?.role === "SUPERVISOR";
  const [mode, setMode] = useState<Mode>("email");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(isSup ? "USER" : "USER");
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // SUPERVISOR는 조직 지정 필요 — orgId prop 없으면 입력
  const [orgInput, setOrgInput] = useState(orgId ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setResult(null); setLoading(true);
    try {
      const r = await api.createInvite({
        mode, role,
        email: mode === "email" ? email : undefined,
        allowedDomain: mode === "link" ? domain : undefined,
        orgId: isSup ? orgInput : undefined,
        orgName,
      });
      setResult(r);
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  async function copy() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* noop */ }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[480px] max-w-[92vw] rounded-xl border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">멤버 추가</h3>
          <button className="text-lg text-muted-foreground" onClick={onClose}>✕</button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">이메일로 초대 메일을 보내거나, 허용 도메인 기반 초대 링크(30분)를 공유하세요.</p>

        <div className="mb-3.5 flex gap-2">
          {(["email", "link"] as Mode[]).map((m) => (
            <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} onClick={() => { setMode(m); setResult(null); }}>
              {m === "email" ? "이메일로" : "초대 링크로"}
            </Button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2.5">
          {isSup && <input className={input} placeholder="조직 ID (org_...)" value={orgInput} onChange={(e) => setOrgInput(e.target.value)} required />}
          <div className="flex items-center gap-2">
            <label className="text-sm">역할</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className={`${input} flex-1`}>
              <option value="USER">사용자(USER)</option>
              {isSup && <option value="ADMIN">관리자(ADMIN)</option>}
            </select>
          </div>
          {mode === "email" ? (
            <input className={input} type="email" placeholder="초대할 이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
          ) : (
            <input className={input} placeholder="허용 이메일 도메인 (예: edentns.com)" value={domain} onChange={(e) => setDomain(e.target.value)} required />
          )}
          {error && <span className="text-xs text-destructive">{error}</span>}
          <Button disabled={loading}>{loading ? "처리 중…" : mode === "email" ? "멤버 추가 (메일 발송)" : "초대 링크 생성"}</Button>
        </form>

        {result && (
          <div className="mt-3.5 rounded-md bg-muted p-3">
            {result.type === "email" && (
              <p className={`mb-2 text-xs ${result.emailSent ? "text-chart-2" : "text-chart-3"}`}>
                {result.emailSent ? "✓ 초대 메일을 발송했습니다." : "SMTP 미설정 — 아래 링크를 직접 전달하세요."}
              </p>
            )}
            <div className="flex gap-1.5">
              <input readOnly value={result.link} className={`${input} flex-1 text-xs`} />
              <Button type="button" variant="outline" size="sm" onClick={copy}>{copied ? "복사됨 ✓" : "복사"}</Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">만료: {result.expiresAt} (30분)</p>
          </div>
        )}
      </div>
    </div>
  );
}

const input = "rounded-md border bg-card px-3 py-2 text-sm";
