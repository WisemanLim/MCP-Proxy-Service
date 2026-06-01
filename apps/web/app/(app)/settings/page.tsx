"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getStoredUser, type SessionUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const inputCls = "rounded-md border bg-card px-3 py-2.5 text-sm";

export default function SettingsPage() {
  const [me, setMe] = useState<SessionUser | null>(getStoredUser());
  const [qr, setQr] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [code, setCode] = useState("");
  // 비밀번호 변경
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const m = await api.me();
      setMe(m);
      setEnabled(m.totpEnabled);
      if (!m.totpEnabled) setQr((await api.totpQr()).qrDataUrl);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try { await api.enableTotp(code); setEnabled(true); setQr(null); setMsg("TOTP 활성화됨"); }
    catch (err) { setError((err as Error).message); }
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(null); setPwMsg(null);
    try {
      await api.changePassword(curPw, newPw);
      setCurPw(""); setNewPw("");
      setPwMsg("비밀번호가 변경되었습니다.");
    } catch (err) { setPwErr((err as Error).message); }
  }

  return (
    <div className="mx-auto max-w-[460px] space-y-4">
      <h1 className="text-2xl font-bold">설정</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-chart-2">{msg}</p>}

      <Card>
        <CardHeader><CardTitle>계정 정보</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            이메일 <b>{me?.email}</b> · 역할 {me?.role} · 조직 {me?.orgName ?? "—"} · 상태 {me?.status}
          </p>
          <h3 className="mb-2 mt-4 text-sm font-medium">비밀번호 변경</h3>
          <form onSubmit={changePw} className="flex flex-col gap-2.5">
            <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="현재 비밀번호" required className={inputCls} />
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="새 비밀번호 (8자 이상)" required minLength={8} className={inputCls} />
            {pwErr && <span className="text-xs text-destructive">{pwErr}</span>}
            {pwMsg && <span className="text-xs text-chart-2">{pwMsg}</span>}
            <Button>비밀번호 변경</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>2단계 인증 (TOTP)</CardTitle></CardHeader>
        <CardContent>
          {enabled ? <p className="text-sm text-chart-2">TOTP가 활성화되어 있습니다.</p> : (
            <form onSubmit={enable} className="flex flex-col gap-2.5">
              <p className="text-sm">인증 앱으로 스캔 후 6자리 코드 입력:</p>
              {qr && <img src={qr} alt="TOTP QR" width={180} height={180} className="self-center" />}
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="6자리 코드" className={inputCls} />
              <Button>활성화</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
