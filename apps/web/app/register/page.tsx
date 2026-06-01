"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { storeSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

type Role = "USER" | "ADMIN";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("USER");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ADMIN: 조직 생성
  const [orgName, setOrgName] = useState("");
  const [orgCheck, setOrgCheck] = useState<null | boolean>(null);
  // USER: 조직 검색
  const [orgQuery, setOrgQuery] = useState("");
  const [orgResults, setOrgResults] = useState<{ id: string; name: string }[]>([]);
  const [orgId, setOrgId] = useState("");
  const [orgIdName, setOrgIdName] = useState("");

  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function checkOrg() {
    setError(null);
    if (!orgName.trim()) return;
    try {
      const r = await api.checkOrg(orgName.trim());
      setOrgCheck(r.available);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function searchOrg(q: string) {
    setOrgQuery(q);
    setOrgId("");
    setOrgIdName("");
    if (!q.trim()) return setOrgResults([]);
    try {
      const r = await api.searchOrgs(q.trim());
      setOrgResults(r.items);
    } catch {
      setOrgResults([]);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (role === "ADMIN" && orgCheck !== true) return setError("조직명 중복확인 필요");
    if (role === "USER" && !orgId) return setError("조직 검색·선택 필요");
    setLoading(true);
    try {
      await api.register({
        email,
        password,
        role,
        orgName: role === "ADMIN" ? orgName.trim() : undefined,
        orgId: role === "USER" ? orgId : undefined,
      });
      // 가입 후 자동 로그인(pending) → 토큰 확보 → TOTP 등록은 설정에서. 대시보드 이동.
      const login = await api.login(email, password);
      storeSession(login.token, login.user);
      const who = role === "ADMIN" ? "SUPERVISOR" : "조직 관리자(ADMIN)";
      setDone(`가입 완료. ${who} 승인 후 정상 이용 가능합니다.`);
      setTimeout(() => router.replace("/dashboard"), 1200);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={submit} className="flex w-[360px] flex-col gap-3 rounded-lg border bg-card p-7 shadow-sm">
        <h1 className="text-xl font-bold">회원가입</h1>

        <div className="flex gap-2">
          {(["USER", "ADMIN"] as Role[]).map((r) => (
            <label key={r} className={`flex-1 cursor-pointer rounded-md border px-2 py-2 text-center text-sm ${role === r ? "border-primary bg-primary text-primary-foreground" : ""}`}>
              <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="hidden" />
              {r === "USER" ? "사용자(USER)" : "관리자(ADMIN)"}
            </label>
          ))}
        </div>

        <input className={input} type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="비밀번호 (8자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />

        {role === "ADMIN" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <input className={`${input} flex-1`} placeholder="조직명(Organization)" value={orgName} onChange={(e) => { setOrgName(e.target.value); setOrgCheck(null); }} />
              <Button type="button" variant="outline" onClick={checkOrg}>중복확인</Button>
            </div>
            {orgCheck === true && <span className="text-xs text-chart-2">사용 가능한 조직명</span>}
            {orgCheck === false && <span className="text-xs text-destructive">이미 존재하는 조직명</span>}
          </div>
        )}

        {role === "USER" && (
          <div className="flex flex-col gap-1.5">
            <input className={input} placeholder="조직 검색 (텍스트 입력)" value={orgQuery} onChange={(e) => searchOrg(e.target.value)} />
            {orgResults.length > 0 && (
              <div className="max-h-36 overflow-auto rounded-md border">
                {orgResults.map((o) => (
                  <div key={o.id} onClick={() => { setOrgId(o.id); setOrgIdName(o.name); setOrgResults([]); setOrgQuery(o.name); }}
                    className="cursor-pointer px-3 py-2 text-sm hover:bg-accent">{o.name}</div>
                ))}
              </div>
            )}
            {orgId && <span className="text-xs text-chart-2">선택: {orgIdName}</span>}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {done && <p className="text-sm text-chart-2">{done}</p>}
        <Button disabled={loading}>{loading ? "처리 중…" : "가입 요청"}</Button>
        <p className="text-sm">이미 계정이 있으신가요? <Link href="/login" className="text-primary underline-offset-4 hover:underline">로그인</Link></p>
      </form>
    </main>
  );
}

const input = "rounded-md border bg-card px-3 py-2.5 text-sm";
