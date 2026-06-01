"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type InviteInfo } from "@/lib/api";
import { storeSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getInvite(token).then((i) => { setInfo(i); if (i.email) setEmail(i.email); }).catch((e) => setError((e as Error).message));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const r = await api.acceptInvite(token, password, info?.type === "link" ? email : undefined);
      storeSession(r.token, r.user);
      router.replace("/dashboard");
    } catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-[360px] rounded-lg border bg-card p-7 shadow-sm">
        <h1 className="mb-1 text-xl font-bold">초대 수락</h1>
        {!info && !error && <p>불러오는 중…</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && (
          <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              조직 <b>{info.orgName}</b> · 역할 <b>{info.role}</b>
              {info.type === "link" && info.allowedDomain && <><br />허용 도메인: <b>@{info.allowedDomain}</b></>}
            </p>
            <input className={input} type="email" placeholder="이메일" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={info.type === "email"} />
            <input className={input} type="password" placeholder="비밀번호 (8자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            <Button disabled={loading}>{loading ? "처리 중…" : "가입 완료"}</Button>
          </form>
        )}
      </div>
    </main>
  );
}

const input = "rounded-md border bg-card px-3 py-2.5 text-sm disabled:opacity-60";
