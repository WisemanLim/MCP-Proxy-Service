"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ApiDoc, type ApiUsage, type UsageStats } from "@/lib/api";
import { storeSessionUser, type SessionUser } from "@/lib/auth";
import { Donut, Heatmap } from "@/components/charts";
import WorldMap from "@/components/WorldMap";
import NotificationsPopup from "@/components/NotificationsPopup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fmtTime } from "@/lib/utils";

const DOC_COLOR: Record<string, string> = { pending: "text-chart-3", approved: "text-chart-2", rejected: "text-destructive" };
const th = "px-2.5 py-2 text-xs font-medium text-muted-foreground";
const td = "px-2.5 py-2 text-sm align-top";

export default function DashboardPage() {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [docs, setDocs] = useState<ApiDoc[]>([]);
  const [usage, setUsageStats] = useState<UsageStats | null>(null);
  const [usageDoc, setUsageDoc] = useState<ApiDoc | null>(null); // 사용내역 팝업 대상
  const [heatOpen, setHeatOpen] = useState(false);
  const [hist, setHist] = useState<ApiUsage[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = me?.role === "ADMIN" || me?.role === "SUPERVISOR";

  // 열린 사용내역 팝업 doc id — 폴링 시 최신 갱신용 (closure stale 방지)
  const usageOpenRef = useRef<string | null>(null);
  usageOpenRef.current = usageDoc?.id ?? null;

  async function loadAll() {
    try {
      const m = await api.me(); setMe(m); storeSessionUser(m);
      // 서버(listDocsFor)가 이미 역할별 스코프 적용(USER 본인/ADMIN 조직/SUPERVISOR 전체).
      // 여기서 ownerId로 재필터하면 비소유자(ADMIN/SUPERVISOR)에게 문서가 사라져 사용내역 접근 불가 → 재필터 제거.
      setDocs((await api.listDocs()).items);
      if (m.status === "active") setUsageStats(await api.usageStats());
      const oid = usageOpenRef.current;
      if (oid) setHist((await api.usage(oid)).items);
    } catch (e) { setError((e as Error).message); }
  }
  // 최초 로드 + MCP 호출 등 외부 변경 자동 반영: 12초 폴링 + 탭 포커스 복귀 시 갱신
  useEffect(() => {
    loadAll();
    const t = setInterval(loadAll, 12000);
    const onVis = () => { if (!document.hidden) loadAll(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, []);

  async function notifyAccount() {
    setMsg(null); setError(null);
    try { await api.sendNotification({ type: "account_pending", message: `계정 승인 요청: ${me?.email}` }); setMsg("관리자에게 알림을 보냈습니다."); }
    catch (e) { setError((e as Error).message); }
  }
  async function notifyDoc(d: ApiDoc) {
    setMsg(null); setError(null);
    try { await api.sendNotification({ type: `api_${d.status}`, message: `API "${d.name}" 승인 요청`, refId: d.id }); setMsg(`"${d.name}" 알림 전송`); }
    catch (e) { setError((e as Error).message); }
  }
  async function openUsage(d: ApiDoc) {
    setUsageDoc(d); setHist([]);
    try { setHist((await api.usage(d.id)).items); } catch (e) { setError((e as Error).message); }
  }
  if (!me) return <p className="text-muted-foreground">로딩 중…</p>;

  return (
    <div className="mx-auto max-w-[778px] space-y-4">
      <h1 className="text-2xl font-bold">대시보드</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {msg && <p className="text-sm text-chart-2">{msg}</p>}

      <NotificationsPopup isAdmin={isAdmin} />

      {me.status !== "active" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-chart-3/40 bg-chart-3/10 px-4 py-3 text-sm text-chart-3">
          <span>승인 대기 중 — {me.role === "ADMIN" ? "SUPERVISOR" : "조직 관리자(ADMIN)"} 승인 필요.
            {me.rejectReason && <span className="text-destructive"> 반려: {me.rejectReason}</span>}</span>
          <Button size="sm" onClick={notifyAccount}>관리자에게 알림</Button>
        </div>
      )}

      {usage && (
        <>
          {/* 요약 도넛 4개 */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card><CardContent className="p-3"><Donut size={146} title="MCP 현황" data={[{ key: "성공", count: usage.ok }, { key: "실패", count: usage.total - usage.ok }]} /></CardContent></Card>
            <Card><CardContent className="p-3"><Donut size={146} title="API 요청/승인 현황" data={[{ key: "승인", count: usage.docStatus.approved ?? 0 }, { key: "대기", count: usage.docStatus.pending ?? 0 }, { key: "반려", count: usage.docStatus.rejected ?? 0 }]} /></CardContent></Card>
            <Card><CardContent className="p-3"><Donut size={146} title="조직 사용자" data={[{ key: "active", count: usage.userStatus.active ?? 0 }, { key: "pending", count: usage.userStatus.pending ?? 0 }]} /></CardContent></Card>
            <Card><CardContent className="p-3"><Donut size={146} title="로그인 (역할별)" data={[{ key: "USER", count: usage.loginByRole.USER ?? 0 }, { key: "ADMIN", count: usage.loginByRole.ADMIN ?? 0 }]} /></CardContent></Card>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card><CardContent className="relative p-3">
              <button onClick={() => setHeatOpen(true)} className="absolute right-3 top-3 z-10 text-xs text-primary hover:underline">시간대별</button>
              <Donut size={146} title="API(tool)별" data={usage.byTool} />
            </CardContent></Card>
            <Card><CardContent className="p-3"><Donut size={146} title="사용자(caller)별" data={usage.byCaller} /></CardContent></Card>
            <Card><CardContent className="p-3"><Donut size={146} title="문서 상태" data={Object.entries(usage.docStatus).map(([key, count]) => ({ key, count }))} /></CardContent></Card>
            <Card><CardContent className="p-3"><Donut size={146} title="지역별 호출" data={usage.byRegion} /></CardContent></Card>
          </div>

          <Card><CardContent className="p-3"><WorldMap title="요청 위치별 분포 (원 크기·색 = 빈도)" data={usage.byRegion} /></CardContent></Card>

          {heatOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setHeatOpen(false)}>
              <div className="max-h-[90vh] w-[760px] max-w-[95vw] overflow-auto rounded-xl border bg-card p-6" onClick={(e) => e.stopPropagation()}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-semibold">시간대별 호출 추이</h3>
                  <button onClick={() => setHeatOpen(false)} className="text-lg text-muted-foreground">✕</button>
                </div>
                <Heatmap title="가로: 호출 top7 · 세로: 시간" cols={usage.heatmap.cols} cells={usage.heatmap.cells} />
              </div>
            </div>
          )}
        </>
      )}

      {/* API 요청 내역 — 우측 상단 플로팅(스크롤 따라다님). 이름·tools만. row 클릭 → 사용내역 팝업 */}
      {docs.length > 0 && (
        <div className="fixed right-4 top-24 z-40 w-64 max-w-[80vw] overflow-hidden rounded-xl border bg-card shadow-xl">
          <div className="border-b bg-muted/60 px-3 py-2 text-sm font-semibold">API 요청 내역</div>
          <ul className="max-h-[60vh] list-none overflow-auto">
            {docs.map((d) => (
              <li key={d.id} onClick={() => openUsage(d)}
                className="flex cursor-pointer items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-accent">
                <span className="flex items-center gap-1.5 truncate">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.status === "approved" ? "bg-chart-2" : d.status === "rejected" ? "bg-destructive" : "bg-chart-3"}`} />
                  <span className="truncate">{d.name}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">tools {d.toolsCount ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 사용내역 팝업 */}
      {usageDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setUsageDoc(null)}>
          <div className="max-h-[85vh] w-[680px] max-w-[95vw] overflow-auto rounded-xl border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold">{usageDoc.name} · 사용내역 <span className={`ml-1 text-xs font-normal ${DOC_COLOR[usageDoc.status]}`}>{usageDoc.status}</span></h3>
              <button className="text-lg text-muted-foreground" onClick={() => setUsageDoc(null)}>✕</button>
            </div>
            {usageDoc.status !== "approved" && (
              <p className="mb-2 text-sm text-chart-3">
                승인 전 — 호출 내역 없음.{usageDoc.reason && <span className="text-destructive"> 반려: {usageDoc.reason}</span>}
                <Button variant="link" size="sm" className="ml-1" onClick={() => notifyDoc(usageDoc)}>관리자 알림</Button>
              </p>
            )}
            {hist.length === 0 ? (
              <p className="text-sm text-muted-foreground">호출 기록 없음</p>
            ) : (
              <table className="w-full border-collapse">
                <thead><tr className="border-b bg-muted text-left"><th className={th}>시각</th><th className={th}>tool</th><th className={th}>지역</th><th className={th}>결과</th><th className={th}>caller</th></tr></thead>
                <tbody>{hist.map((u) => <tr key={u.id} className="border-b"><td className={td}>{fmtTime(u.at)}</td><td className={td}><code>{u.tool}</code></td><td className={td}>{u.region ?? "—"}</td><td className={td}>{u.ok ? "OK" : "ERR"}</td><td className={td}>{u.caller}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
