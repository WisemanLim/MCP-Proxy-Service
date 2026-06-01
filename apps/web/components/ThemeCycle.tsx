"use client";

import { useEffect, useState } from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Mode = "system" | "light" | "dark";
const NEXT: Record<Mode, Mode> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Mode, string> = { system: "시스템", light: "라이트", dark: "다크" };

function apply(mode: Mode) {
  const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = mode === "system" ? sys : mode;
}

/** 아이콘 전용 순환 토글 — 시스템→라이트→다크→… */
export default function ThemeCycle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => { setMode((localStorage.getItem("mcpproxy_theme") as Mode) || "system"); }, []);
  function cycle() {
    const n = NEXT[mode];
    setMode(n);
    localStorage.setItem("mcpproxy_theme", n);
    apply(n);
  }
  const Icon = mode === "system" ? Monitor : mode === "light" ? Sun : Moon;
  return (
    <Button variant="secondary" size="icon" className="h-8 w-8 shrink-0" onClick={cycle} title={`화면 모드: ${LABEL[mode]} (클릭 전환)`}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
