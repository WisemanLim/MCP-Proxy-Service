"use client";

import {
  Bar, BarChart, Cell, LabelList, Line as RLine, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { ChartTooltipContent } from "@/components/ui/chart";

const CHART = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--primary))"];

function Title({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-sm font-semibold text-foreground">{children}</div>;
}

/** 도넛 — recharts Pie. 범례 없음, 마우스오버 툴팁. */
export function Donut({ data, title, size = 180 }: { data: { key: string; count: number }[]; title?: string; size?: number }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div>
      {title && <Title>{title} <span className="font-normal text-xs text-muted-foreground">ⓘ</span></Title>}
      <div className="relative" style={{ height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="key" innerRadius="64%" outerRadius="94%" paddingAngle={2} strokeWidth={0}>
              {data.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltipContent />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-foreground">{total}</span>
          <span className="text-[11px] text-muted-foreground">total</span>
        </div>
      </div>
      {total === 0 && <div className="text-center text-xs text-muted-foreground">데이터 없음</div>}
    </div>
  );
}

/** 세로 막대 — recharts BarChart. */
export function Bars({ data, title, height = 200 }: { data: { label: string; count: number }[]; title?: string; height?: number }) {
  return (
    <div>
      {title && <Title>{title}</Title>}
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} />
          <YAxis tickLine={false} axisLine={false} fontSize={10} width={28} />
          <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Bar dataKey="count" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 라인/면적 — recharts LineChart. */
export function Line({ data, title, height = 200 }: { data: { label: string; count: number }[]; title?: string; height?: number }) {
  return (
    <div>
      {title && <Title>{title}</Title>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} interval={2} />
          <YAxis tickLine={false} axisLine={false} fontSize={10} width={28} />
          <Tooltip content={<ChartTooltipContent />} />
          <RLine type="monotone" dataKey="count" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 가로 막대(순위) — recharts horizontal BarChart. */
export function HBars({ data, title }: { data: { key: string; count: number }[]; title?: string }) {
  const h = Math.max(120, data.length * 30 + 20);
  return (
    <div>
      {title && <Title>{title}</Title>}
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="key" width={96} tickLine={false} axisLine={false} fontSize={11} />
          <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => <Cell key={i} fill={CHART[i % CHART.length]} />)}
            <LabelList dataKey="count" position="right" fontSize={11} fill="hsl(var(--muted-foreground))" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {data.length === 0 && <div className="text-xs text-muted-foreground">데이터 없음</div>}
    </div>
  );
}

/** 히트맵 — 가로 cols, 세로 시간(0–23h), 셀 색=빈도. tailwind 그리드. */
export function Heatmap({ cols, cells, title }: { cols: string[]; cells: number[][]; title?: string }) {
  const max = Math.max(1, ...cells.flat());
  if (cols.length === 0) return <div><Title>{title}</Title><div className="text-xs text-muted-foreground">데이터 없음</div></div>;
  return (
    <div>
      {title && <Title>{title}</Title>}
      <div className="flex gap-0.5 pl-8 mb-0.5">
        {cols.map((c) => <div key={c} className="flex-1 truncate text-center text-[10px] text-muted-foreground" title={c}>{c}</div>)}
      </div>
      <div className="space-y-0.5">
        {cells.map((row, h) => (
          <div key={h} className="flex items-center gap-0.5">
            <div className="w-8 pr-1 text-right text-[10px] text-muted-foreground">{h}시</div>
            {row.map((v, c) => (
              <div key={c} title={`${cols[c]} · ${h}시 · ${v}건`}
                className="flex h-[18px] flex-1 items-center justify-center rounded-sm text-[9px]"
                style={{ background: v === 0 ? "hsl(var(--muted))" : `hsl(var(--chart-1) / ${0.2 + (v / max) * 0.8})`, color: v / max > 0.55 ? "#fff" : "hsl(var(--muted-foreground))" }}>
                {v > 0 ? v : ""}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
