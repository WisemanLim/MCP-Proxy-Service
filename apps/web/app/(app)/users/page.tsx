"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getStoredUser, type SessionUser } from "@/lib/auth";
import InviteModal from "@/components/InviteModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const ROLES = ["USER", "ADMIN", "SUPERVISOR"];
const STATUSES = ["pending", "active", "rejected", "disabled"];
const STATUS_COLOR: Record<string, string> = { pending: "text-chart-3", active: "text-chart-2", rejected: "text-destructive", disabled: "text-muted-foreground" };
const th = "px-3 py-2.5 text-xs font-medium text-muted-foreground";
const td = "px-3 py-2.5 text-sm";
const sel = "rounded-md border bg-card px-2 py-1 text-sm";

export default function UsersPage() {
  const me = getStoredUser();
  const isSupervisor = me?.role === "SUPERVISOR";
  const [items, setItems] = useState<SessionUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [invite, setInvite] = useState(false);

  async function load() {
    try { setItems((await api.listUsers()).items); } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function change(id: string, patch: { role?: string; status?: string }) {
    setError(null);
    try { await api.changeUser(id, patch); await load(); } catch (e) { setError((e as Error).message); }
  }
  function canReset(u: SessionUser) { return isSupervisor || (me?.role === "ADMIN" && u.role === "USER"); }
  async function resetPw(u: SessionUser) {
    setError(null); setMsg(null);
    const pw = prompt(`${u.email} 의 새 비밀번호 (8자 이상)`);
    if (pw == null) return;
    if (pw.length < 8) { setError("비밀번호는 8자 이상"); return; }
    try { await api.resetPassword(u.id, pw); setMsg(`${u.email} 비밀번호 초기화 완료`); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">사용자 관리 {isSupervisor ? "(SUPERVISOR — 전체)" : "(ADMIN — 조직)"}</h1>
        <Button onClick={() => setInvite(true)}>+ 멤버 초대</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-chart-2">{msg}</p>}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full border-collapse">
            <thead><tr className="border-b bg-muted text-left"><th className={th}>이메일</th><th className={th}>역할</th><th className={th}>조직</th><th className={th}>상태</th><th className={th}>TOTP</th><th className={th}>작업</th></tr></thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className={td}>{u.email}</td>
                  <td className={td}>
                    {isSupervisor ? (
                      <select value={u.role} onChange={(e) => change(u.id, { role: e.target.value })} className={sel}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : u.role}
                  </td>
                  <td className={td}>{u.orgName ?? "—"}</td>
                  <td className={td}>
                    {isSupervisor || (me?.role === "ADMIN" && u.role === "USER") ? (
                      <select value={u.status} onChange={(e) => change(u.id, { status: e.target.value })} className={`${sel} ${STATUS_COLOR[u.status]}`}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span className={STATUS_COLOR[u.status]}>{u.status}</span>}
                  </td>
                  <td className={td}>{u.totpEnabled ? "✓" : "—"}</td>
                  <td className={td}>{canReset(u) && <Button variant="outline" size="sm" onClick={() => resetPw(u)}>비밀번호 초기화</Button>}</td>
                </tr>
              ))}
              {items.length === 0 && <tr><td className={td} colSpan={6}>사용자 없음</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {!isSupervisor && <p className="text-xs text-muted-foreground">ADMIN은 같은 조직 USER의 상태만 변경 가능합니다(역할 변경은 SUPERVISOR). 가입 승인/반려는 “승인 처리” 화면에서.</p>}
      {invite && <InviteModal orgId={me?.orgId ?? undefined} orgName={me?.orgName ?? undefined} onClose={() => { setInvite(false); load(); }} />}
    </div>
  );
}
