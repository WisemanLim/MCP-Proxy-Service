import "./globals.css";

export const metadata = {
  title: "MCP Proxy Service",
  description: "REST API → MCP 변환 플랫폼",
};

// 페인트 전 테마 적용 (플리커 방지). mode: system|light|dark → resolved light|dark
const THEME_INIT = `(function(){try{var m=localStorage.getItem('mcpproxy_theme')||'system';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=(m==='system'?sys:m);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
