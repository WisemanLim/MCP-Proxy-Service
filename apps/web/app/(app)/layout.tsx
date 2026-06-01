"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, FileText, CheckCircle2, Users, Settings, PanelLeftClose, PanelLeft, LogOut } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import ThemeCycle from "@/components/ThemeCycle";
import { Button } from "@/components/ui/button";
import { clearSession, getStoredUser } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "대시보드", Icon: LayoutDashboard, admin: false },
  { href: "/apidocs", label: "API 문서", Icon: FileText, admin: false },
  { href: "/approvals", label: "승인 처리", Icon: CheckCircle2, admin: true },
  { href: "/users", label: "사용자 관리", Icon: Users, admin: true },
  { href: "/settings", label: "설정", Icon: Settings, admin: false },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = getStoredUser();
  const isAdmin = user?.role === "SUPERVISOR" || user?.role === "ADMIN";
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setCollapsed(localStorage.getItem("mcpproxy_nav_collapsed") === "1"); }, []);
  function toggle() {
    setCollapsed((c) => { const n = !c; localStorage.setItem("mcpproxy_nav_collapsed", n ? "1" : "0"); return n; });
  }
  function logout() { clearSession(); router.replace("/login"); }

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className={cnNav(collapsed)}>
          <div className={`mb-2 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
            {!collapsed && <strong className="text-[15px] font-bold text-foreground">MCP Proxy</strong>}
            <Button variant="secondary" size="icon" className="h-7 w-7" onClick={toggle} title="접기/펼치기">
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          </div>
          {NAV.filter((n) => !n.admin || isAdmin).map(({ href, label, Icon }) => (
            <Link key={href} href={href} title={label}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground ${collapsed ? "justify-center" : ""}`}>
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{label}</span>}
            </Link>
          ))}
          <div className="mt-auto">
            <div className={`mb-2 flex items-center gap-2 ${collapsed ? "justify-center" : "justify-between"}`}>
              {!collapsed && <div className="min-w-0 truncate text-xs text-muted-foreground">{user?.email}<br />({user?.role})</div>}
              <ThemeCycle />
            </div>
            <Button variant="secondary" className="w-full" onClick={logout} title="로그아웃">
              <LogOut className="h-4 w-4" />{!collapsed && <span>로그아웃</span>}
            </Button>
          </div>
        </aside>
        <main className="min-w-0 flex-1 bg-background p-8">{children}</main>
      </div>
    </AuthGuard>
  );
}

function cnNav(collapsed: boolean) {
  return `flex flex-col gap-2 border-r bg-sidebar text-sidebar-foreground transition-all ${collapsed ? "w-[60px] p-2 pt-4" : "w-[200px] p-5"}`;
}
