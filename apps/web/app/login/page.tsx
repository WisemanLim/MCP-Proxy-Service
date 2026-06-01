"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { storeSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const input = "rounded-md border bg-card px-3 py-2.5 text-sm";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      const r = await api.login(email, password, totp || undefined);
      storeSession(r.token, r.user);
      router.replace("/dashboard");
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <form onSubmit={submit} className="flex w-80 flex-col gap-3 rounded-lg border bg-card p-7 shadow-sm">
        <h1 className="text-xl font-bold">로그인</h1>
        <input className={input} type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className={input} type="password" placeholder="비밀번호" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <input className={input} inputMode="numeric" placeholder="TOTP 코드 (활성 시)" value={totp} onChange={(e) => setTotp(e.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button disabled={loading}>{loading ? "처리 중…" : "로그인"}</Button>
        <p className="text-sm">계정이 없으신가요? <Link href="/register" className="text-primary underline-offset-4 hover:underline">회원가입</Link></p>
      </form>
    </main>
  );
}
