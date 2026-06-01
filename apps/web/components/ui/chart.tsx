"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type ChartConfig = Record<string, { label?: string; color?: string }>;

/** shadcn 스타일 차트 컨테이너 — config의 color를 --color-<key> CSS 변수로 주입. */
export function ChartContainer({
  config,
  className,
  children,
}: {
  config: ChartConfig;
  className?: string;
  children: React.ReactNode;
}) {
  const vars: React.CSSProperties = {};
  for (const [k, v] of Object.entries(config)) {
    if (v.color) (vars as Record<string, string>)[`--color-${k}`] = v.color;
  }
  return (
    <div
      style={vars}
      className={cn(
        "w-full [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-text]:fill-muted-foreground [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground text-xs",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 간단 툴팁 컨텐츠 (recharts Tooltip content). */
export function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      {label != null && <div className="mb-1 font-medium">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {p.color && <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color }} />}
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-mono font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}
