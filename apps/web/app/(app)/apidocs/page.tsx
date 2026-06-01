"use client";

import { Fragment, useEffect, useState } from "react";
import { api, type ApiDoc, type DocPreview, type Endpoint } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import McpGuide from "@/components/McpGuide";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const STATUS_COLOR: Record<string, string> = { pending: "text-chart-3", approved: "text-chart-2", rejected: "text-destructive" };
const METHODS = ["get", "post", "put", "delete", "patch"];
const METHOD_COLOR: Record<string, string> = { get: "bg-chart-1", post: "bg-chart-2", put: "bg-chart-3", delete: "bg-destructive", patch: "bg-chart-4" };
const th = "px-3 py-2.5 text-xs font-medium text-muted-foreground";
const td = "px-3 py-2.5 text-sm align-top";
const inp = "rounded-md border bg-card px-3 py-2 text-sm";

type Mode = "url" | "endpoints";

export default function ApiDocsPage() {
  const me = getStoredUser();
  const canCreate = me?.status === "active";
  const [items, setItems] = useState<ApiDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [guideDoc, setGuideDoc] = useState<ApiDoc | null>(null);
  const [test, setTest] = useState<{ name: string; data: DocPreview } | null>(null);
  const [eps, setEps] = useState<Endpoint[]>([]);
  const [epMethod, setEpMethod] = useState("get");
  const [epPath, setEpPath] = useState("");
  const [epSummary, setEpSummary] = useState("");

  async function load() {
    try { setItems((await api.listDocs()).items); } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  function resetForm() { setEditing(null); setName(""); setUrl(""); setBaseUrl(""); setMode("url"); }
  function startEdit(d: ApiDoc) {
    setEditing(d.id); setMode(d.sourceType === "endpoints" ? "endpoints" : "url");
    setName(d.name); setUrl(d.sourceRef ?? ""); setBaseUrl(d.baseUrl ?? "");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function create(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    try {
      if (editing) await api.editDoc(editing, { name, baseUrl: baseUrl || undefined, sourceRef: mode === "url" ? url : undefined });
      else if (mode === "url") await api.createDoc({ name, sourceType: "url", sourceRef: url, baseUrl: baseUrl || undefined });
      else await api.createDoc({ name, sourceType: "endpoints", baseUrl });
      resetForm(); await load();
    } catch (err) { setError((err as Error).message); }
  }
  async function del(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    try { await api.deleteDoc(id); if (openDoc === id) setOpenDoc(null); await load(); } catch (e) { setError((e as Error).message); }
  }
  async function doTest(d: ApiDoc) {
    setError(null);
    try { setTest({ name: d.name, data: await api.testDoc(d.id) }); } catch (e) { setError((e as Error).message); }
  }
  async function manage(id: string) {
    if (openDoc === id) return setOpenDoc(null);
    setOpenDoc(id);
    try { setEps((await api.listEndpoints(id)).items); } catch (e) { setError((e as Error).message); }
  }
  async function addEp(e: React.FormEvent) {
    e.preventDefault(); if (!openDoc) return; setError(null);
    try {
      await api.addEndpoint(openDoc, { method: epMethod, path: epPath, summary: epSummary || undefined });
      setEpPath(""); setEpSummary(""); setEps((await api.listEndpoints(openDoc)).items); await load();
    } catch (err) { setError((err as Error).message); }
  }
  async function delEp(eid: string) {
    if (!openDoc) return;
    try { await api.deleteEndpoint(openDoc, eid); setEps((await api.listEndpoints(openDoc)).items); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">API 문서 (OpenAPI)</h1>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!canCreate && <p className="text-sm text-chart-3">승인 완료(active) 후 등록할 수 있습니다.</p>}

      {canCreate && (
        <Card><CardContent className="pt-4">
          {editing && <p className="mb-2.5 font-semibold text-primary">수정 모드 — 저장 시 재검토(pending)로 전환됩니다.</p>}
          <div className="mb-3 flex gap-2">
            {(["url", "endpoints"] as Mode[]).map((m) => (
              <Button key={m} type="button" variant={mode === m ? "default" : "outline"} size="sm" disabled={!!editing} onClick={() => setMode(m)}>
                {m === "url" ? "① 스키마 링크" : "② 개별 등록"}
              </Button>
            ))}
          </div>
          <form onSubmit={create} className="flex flex-wrap items-center gap-2">
            <input className={inp} placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} required />
            {mode === "url" ? (
              <>
                <input className={`${inp} w-[340px]`} placeholder="OpenAPI URL (예: http://host:8080/v3/api-docs)" value={url} onChange={(e) => setUrl(e.target.value)} required />
                <input className={inp} placeholder="base URL (선택)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </>
            ) : (
              <input className={`${inp} w-[300px]`} placeholder="base URL (예: http://localhost:8000) — 필수" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
            )}
            <Button>{editing ? "저장" : "등록"}</Button>
            {editing && <Button type="button" variant="outline" onClick={resetForm}>취소</Button>}
          </form>
          {mode === "endpoints" && !editing && <p className="mt-2 text-xs text-muted-foreground">등록 후 “관리”에서 개별 REST API(메서드+경로)를 추가하세요. <code>{"{param}"}</code>은 자동 path 파라미터로 변환됩니다.</p>}
        </CardContent></Card>
      )}

      <Card><CardContent className="overflow-x-auto p-0">
        <table className="w-full border-collapse">
          <thead><tr className="border-b bg-muted text-left"><th className={th}>이름</th><th className={th}>모드</th><th className={th}>소스</th><th className={th}>상태</th><th className={th}>tools</th><th className={th}>작업</th></tr></thead>
          <tbody>
            {items.map((d) => (
              <Fragment key={d.id}>
                <tr className="border-b">
                  <td className={td}>{d.name}</td>
                  <td className={td}>{d.sourceType === "url" ? "스키마 링크" : d.sourceType === "endpoints" ? "개별 등록" : "inline"}</td>
                  <td className={`${td} max-w-[260px] truncate`}>{d.sourceType === "url" ? d.sourceRef : d.baseUrl}</td>
                  <td className={td}><span className={STATUS_COLOR[d.status]}>{d.status}</span>{d.reason && <div className="text-xs text-destructive">{d.reason}</div>}</td>
                  <td className={td}>{d.toolsCount ?? "—"}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    {d.status === "approved" && <Button variant="link" size="sm" onClick={() => doTest(d)}>확인</Button>}
                    {d.status === "approved" && <Button variant="link" size="sm" className="text-chart-2" onClick={() => setGuideDoc(d)}>가이드</Button>}
                    {d.ownerId === me?.id && <>
                      <Button variant="link" size="sm" onClick={() => startEdit(d)}>수정</Button>
                      {d.sourceType === "endpoints" && <Button variant="link" size="sm" onClick={() => manage(d.id)}>{openDoc === d.id ? "닫기" : "관리"}</Button>}
                      <Button variant="link" size="sm" className="text-destructive" onClick={() => del(d.id)}>삭제</Button>
                    </>}
                  </td>
                </tr>
                {openDoc === d.id && (
                  <tr><td colSpan={6} className="bg-muted/40 px-3 py-3">
                    <form onSubmit={addEp} className="mb-2.5 flex flex-wrap items-center gap-2">
                      <select value={epMethod} onChange={(e) => setEpMethod(e.target.value)} className={inp}>
                        {METHODS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                      </select>
                      <input className={`${inp} w-[300px]`} placeholder="/api/bookcollection/books/{isbn}" value={epPath} onChange={(e) => setEpPath(e.target.value)} required />
                      <input className={inp} placeholder="설명(선택)" value={epSummary} onChange={(e) => setEpSummary(e.target.value)} />
                      <Button size="sm">추가</Button>
                    </form>
                    {eps.length === 0 ? <span className="text-xs text-muted-foreground">등록된 endpoint 없음</span> :
                      eps.map((ep) => (
                        <div key={ep.id} className="mb-1.5 flex items-center gap-2.5 rounded-md border bg-card px-2 py-1.5">
                          <span className={`min-w-[56px] rounded px-2 py-0.5 text-center text-xs font-bold text-white ${METHOD_COLOR[ep.method] ?? "bg-muted-foreground"}`}>{ep.method.toUpperCase()}</span>
                          <code className="flex-1">{ep.path}</code>
                          <span className="text-xs text-muted-foreground">{ep.summary}</span>
                          <Button variant="link" size="sm" className="text-destructive" onClick={() => delEp(ep.id)}>삭제</Button>
                        </div>
                      ))}
                  </td></tr>
                )}
              </Fragment>
            ))}
            {items.length === 0 && <tr><td className={td} colSpan={6}>문서 없음</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>

      {guideDoc && <McpGuide doc={guideDoc} onClose={() => setGuideDoc(null)} />}

      {test && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setTest(null)}>
          <div className="max-h-[80vh] w-[520px] overflow-auto rounded-lg border bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-base font-semibold">시험·확인 — {test.name}</h3>
            {test.data.ok ? (
              <div className="text-sm">
                {test.data.upstream?.reachable
                  ? <p className="text-chart-2">✓ 정상 — 변환 가능 · 대상 API 서버 가동 중</p>
                  : <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">✗ 통신 오류 — 대상 API 서버에 연결할 수 없습니다 ({test.data.upstream?.error ?? "응답 없음"}). 변환은 가능하나 서버 구동 후 사용하세요.</p>}
                <p><b>baseUrl</b> {test.data.metadata?.baseUrl}</p>
                <p><b>endpoint</b> {test.data.metadata?.endpointCount} · <b>품질</b> {test.data.metadata?.qualityScore}/100 · <b>인증</b> {test.data.metadata?.authSchemes.join(", ") || "—"}</p>
                <p><b>노출 tools ({test.data.tools?.length})</b></p>
                <ul className="max-h-52 overflow-auto">
                  {test.data.tools?.map((t) => <li key={t.name}><code>{t.method.toUpperCase()} {t.path}</code> → {t.name}</li>)}
                </ul>
                {!!test.data.excluded?.length && <>
                  <p className="mb-1 text-chart-3"><b>제외 {test.data.excluded.length}건 (위험/필터)</b></p>
                  <ul className="mt-0 max-h-40 overflow-auto text-chart-3">
                    {test.data.excluded.map((x) => <li key={x.operationId + x.path}><code>{x.method.toUpperCase()} {x.path}</code> ({x.operationId}) — {x.reason}</li>)}
                  </ul>
                </>}
              </div>
            ) : <p className="text-destructive">✗ 비정상 — {test.data.error}</p>}
            <Button variant="link" size="sm" className="mt-2" onClick={() => setTest(null)}>닫기</Button>
          </div>
        </div>
      )}
    </div>
  );
}
