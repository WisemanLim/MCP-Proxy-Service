"use client";

import { useEffect, useState } from "react";
import { api, type ApiDoc, type ProxyStatus } from "@/lib/api";

/** 승인된 API 문서 → MCP client/agent 등록 가이드 (복사·붙여넣기). */
export default function McpGuide({ doc, onClose }: { doc: ApiDoc; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [proxy, setProxy] = useState<ProxyStatus | null>(null);
  const [restarting, setRestarting] = useState(false);

  // 승인 시 프록시 자동 기동 — 실제 실행 상태 폴링
  useEffect(() => {
    let alive = true;
    const tick = () => api.proxyStatus(doc.id).then((s) => { if (alive) setProxy(s); }).catch(() => { /* noop */ });
    tick();
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [doc.id]);

  async function restartProxy() {
    setRestarting(true);
    try { setProxy(await api.restartProxy(doc.id)); } catch (e) { setErr((e as Error).message); }
    finally { setRestarting(false); }
  }

  const slug = doc.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "api";
  const baseUrl = doc.baseUrl || "https://your-api.example.com";

  // 프록시 포트 = 승인 시 자동 할당된 포트(≥20000). 상태 API에서 동적으로 가져온다.
  const proxyPort = proxy?.port ?? null;
  const portTxt = proxyPort ?? "<승인 시 자동 할당>";
  const proxyUrl = proxy?.url ?? `http://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:${portTxt}/mcp`;

  const manifest = JSON.stringify(
    { name: slug, baseUrl, specUrl: undefined, fieldsPolicy: { defaultLimit: 20, truncateBytes: 2048, maxDepth: 4 } },
    (k, v) => (v === undefined ? undefined : v),
    2,
  );

  const stdioConfig = JSON.stringify(
    {
      mcpServers: {
        [slug]: {
          command: "node",
          args: ["/ABS/PATH/MCP-Proxy-Service/apps/api/dist/main.js"],
          env: { TRANSPORT: "stdio", MANIFEST_PATH: "/ABS/PATH/manifest.json", SPEC_PATH: "/ABS/PATH/openapi.json" },
        },
      },
    },
    null,
    2,
  );

  const httpRun = `TRANSPORT=http PORT=${portTxt} \\\n  SPEC_PATH=./openapi.json MANIFEST_PATH=./manifest.json \\\n  node apps/api/dist/main.js`;

  // Claude Desktop은 {url} 직접 미지원 → mcp-remote 브리지를 stdio command로 사용.
  const isHttp = proxyUrl.startsWith("http://");
  const mcpRemoteArgs = isHttp ? ["mcp-remote", proxyUrl, "--allow-http"] : ["mcp-remote", proxyUrl];
  const httpConfig = JSON.stringify({ mcpServers: { [slug]: { command: "npx", args: mcpRemoteArgs } } }, null, 2);
  // Cursor 등 HTTP 전송 지원 클라이언트용 (직접 url)
  const httpConfigDirect = JSON.stringify({ mcpServers: { [slug]: { url: proxyUrl } } }, null, 2);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setErr("클립보드 복사 실패 — 수동 선택하세요");
    }
  }

  async function downloadSpec() {
    setErr(null);
    try {
      const spec = await api.getOpenApi(doc.id);
      const blob = new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "openapi.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const Block = ({ id, title, code }: { id: string; title: string; code: string }) => (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-1 flex items-center justify-between">
        <strong className="text-[13px]">{title}</strong>
        <button className="rounded-md border px-2.5 py-1 text-xs" onClick={() => copy(id, code)}>{copied === id ? "복사됨 ✓" : "복사"}</button>
      </div>
      <pre className="m-0 overflow-auto whitespace-pre rounded-lg bg-slate-900 p-3 text-xs text-slate-200">{code}</pre>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45" onClick={onClose}>
      <div className="max-h-[86vh] w-[640px] overflow-auto rounded-lg border bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">MCP 등록 가이드 — {doc.name}</h3>
          <button className="rounded-md border px-2.5 py-1 text-xs" onClick={onClose}>닫기</button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          승인된 API를 MCP client(Claude Desktop·Cursor) 또는 agent에 등록합니다. 아래 순서대로 진행하세요.
        </p>
        {err && <p className="text-[13px] text-destructive">{err}</p>}

        <ol className="list-decimal pl-5 text-[13px]">
          <li>스펙 파일 다운로드 → <code>openapi.json</code> <button className="ml-1.5 rounded-md bg-chart-2 px-2 py-0.5 text-xs text-white" onClick={downloadSpec}>스펙 다운로드</button></li>
          <li><code>manifest.json</code> 저장 (아래 복사)</li>
          <li>프록시 런타임 빌드: <code>pnpm --filter @mcp-proxy/api build</code></li>
          <li>MCP client 설정에 붙여넣기 (stdio 또는 HTTP)</li>
        </ol>

        {proxy?.running ? (
          <div className="mt-3 flex items-start justify-between gap-2 rounded-md border border-chart-2/40 bg-chart-2/10 p-3 text-xs text-chart-2">
            <span>✓ <b>프록시 자동 실행 중</b> — 포트 :{proxy.port} (<code>{proxy.url}</code>). 아래 ④ 설정을 MCP 클라이언트에 붙여넣으세요. <b>사용내역이 안 잡히면 코드 갱신 후 "프록시 재시작"</b>을 누르세요.</span>
            <button className="shrink-0 rounded-md border border-chart-2/50 px-2 py-1" disabled={restarting} onClick={restartProxy}>{restarting ? "재시작 중…" : "프록시 재시작"}</button>
          </div>
        ) : (
          <div className="mt-3 flex items-start justify-between gap-2 rounded-md border border-chart-3/40 bg-chart-3/10 p-3 text-xs text-chart-3">
            <span>⚠ <b>프록시 미실행</b>{proxy?.error ? ` — ${proxy.error}` : ""}. MCP 클라이언트는 <b>업스트림({baseUrl.replace(/^https?:\/\//, "")})이 아니라 프록시 포트 :{portTxt}</b>(<code>{proxyUrl}</code>)로 접속합니다.</span>
            <button className="shrink-0 rounded-md border border-chart-3/50 px-2 py-1" disabled={restarting} onClick={restartProxy}>{restarting ? "재시작 중…" : "프록시 재시작"}</button>
          </div>
        )}

        <div className="mt-3">
          <Block id="manifest" title="① manifest.json" code={manifest} />
          <Block id="stdio" title="② Claude Desktop / Cursor — stdio (mcp.json). 절대경로 /ABS/PATH 교체" code={stdioConfig} />
          <Block id="httprun" title={`③ HTTP/SSE 모드 실행 (프록시 :${portTxt})`} code={httpRun} />
          <Block id="httpcfg" title="④ HTTP client 설정 — Claude Desktop (mcp-remote 브리지, npx 필요)" code={httpConfig} />
          <Block id="httpcfgdirect" title="④-b HTTP client 설정 — Cursor 등 HTTP 직접 지원 클라이언트" code={httpConfigDirect} />
        </div>

        <p className="text-xs text-muted-foreground">
          업스트림 API = <code>{baseUrl}</code> (manifest.baseUrl). 프록시는 별도 프로세스로 <code>:{portTxt}</code>에서 <code>/mcp</code> 제공
          (포트는 <b>승인 시 20000+ 빈 포트 자동 할당</b> — 중복·사용 중 제외).
          stdio: 로컬 호스트(Claude Desktop ~/Library/Application Support/Claude/claude_desktop_config.json, Cursor ~/.cursor/mcp.json).
          인증 비밀은 manifest의 <code>{"${ENV}"}</code>/<code>secretRef</code>로 주입(평문 금지).
        </p>
      </div>
    </div>
  );
}
