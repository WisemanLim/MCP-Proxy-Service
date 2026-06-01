"use client";

import { useEffect, useState } from "react";
import { api, type ApiDoc, type DocPreview } from "@/lib/api";
import type { SessionUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const th = "px-3 py-2.5 text-xs font-medium text-muted-foreground";
const td = "px-3 py-2.5 text-sm";

export default function ApprovalsPage() {
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [docs, setDocs] = useState<ApiDoc[]>([]);
  const [preview, setPreview] = useState<{ id: string; data: DocPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [u, d] = await Promise.all([api.listUsers(), api.listDocs()]);
      setUsers(u.items.filter((x) => x.status === "pending"));
      setDocs(d.items.filter((x) => x.status === "pending"));
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError((e as Error).message); }
  }
  async function doPreview(id: string) {
    setError(null);
    try { setPreview({ id, data: await api.previewDoc(id) }); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">승인 처리</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader><CardTitle>사용자 승인 대기 ({users.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b bg-muted text-left"><th className={th}>이메일</th><th className={th}>역할</th><th className={th}>조직</th><th className={th}>작업</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b">
                  <td className={td}>{u.email}</td><td className={td}>{u.role}</td><td className={td}>{u.orgName ?? "—"}</td>
                  <td className={`${td} space-x-1.5`}>
                    <Button size="sm" className="bg-chart-2 hover:bg-chart-2/90" onClick={() => act(() => api.approveUser(u.id))}>승인</Button>
                    <Button size="sm" variant="destructive" onClick={() => { const r = prompt("반려 사유"); if (r != null) act(() => api.rejectUser(u.id, r)); }}>반려</Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td className={td} colSpan={4}>대기 없음</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>API 문서 승인 대기 ({docs.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead><tr className="border-b bg-muted text-left"><th className={th}>이름</th><th className={th}>URL</th><th className={th}>작업</th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b">
                  <td className={td}>{d.name}</td>
                  <td className={`${td} max-w-[260px] truncate`}>{d.sourceRef}</td>
                  <td className={`${td} space-x-1.5`}>
                    <Button size="sm" variant="outline" onClick={() => doPreview(d.id)}>요청 확인</Button>
                    <Button size="sm" className="bg-chart-2 hover:bg-chart-2/90" onClick={() => act(() => api.approveDoc(d.id))}>승인</Button>
                    <Button size="sm" variant="destructive" onClick={() => { const r = prompt("반려 사유"); if (r != null) act(() => api.rejectDoc(d.id, r)); }}>반려</Button>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && <tr><td className={td} colSpan={3}>대기 없음</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPreview(null)}>
          <div className="max-h-[80vh] w-[520px] overflow-auto rounded-lg border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold">요청 확인 (URL 응답·변환 결과)</h3>
            {preview.data.ok ? (
              <div className="text-sm">
                {preview.data.upstream?.reachable
                  ? <p className="text-chart-2">✓ 정상 — 변환 가능 · 대상 API 서버 가동 중</p>
                  : <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">✗ 통신 오류 — 대상 API 서버에 연결할 수 없습니다 ({preview.data.upstream?.error ?? "응답 없음"}). 서버 구동 확인 후 승인하세요.</p>}
                <p><b>baseUrl</b> {preview.data.metadata?.baseUrl}</p>
                <p><b>endpoint</b> {preview.data.metadata?.endpointCount} · <b>품질</b> {preview.data.metadata?.qualityScore}/100 · <b>인증</b> {preview.data.metadata?.authSchemes.join(", ") || "—"}</p>
                <p><b>노출 tools ({preview.data.tools?.length})</b></p>
                <ul className="max-h-40 overflow-auto">
                  {preview.data.tools?.map((t) => <li key={t.name}><code>{t.method.toUpperCase()} {t.path}</code> → {t.name}</li>)}
                </ul>
                {!!preview.data.excluded?.length && <>
                  <p className="mb-1 text-chart-3"><b>제외 {preview.data.excluded.length}건 (위험/필터)</b></p>
                  <ul className="mt-0 max-h-36 overflow-auto text-chart-3">
                    {preview.data.excluded.map((x) => (
                      <li key={x.operationId + x.path}><code>{x.method.toUpperCase()} {x.path}</code> ({x.operationId}) — {x.reason}</li>
                    ))}
                  </ul>
                </>}
              </div>
            ) : <p className="text-destructive">✗ 비정상 — {preview.data.error}</p>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="bg-chart-2 hover:bg-chart-2/90" onClick={() => act(() => api.approveDoc(preview.id)).then(() => setPreview(null))}>승인</Button>
              <Button size="sm" variant="destructive" onClick={() => { const r = prompt("반려 사유"); if (r != null) act(() => api.rejectDoc(preview.id, r)).then(() => setPreview(null)); }}>반려</Button>
              <Button size="sm" variant="outline" onClick={() => setPreview(null)}>닫기</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
