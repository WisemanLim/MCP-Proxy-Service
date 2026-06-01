"use client";

import { useState } from "react";

/**
 * 세계지도 위 요청 위치 분포.
 * - 지도 이미지: static 로컬 (public/world-map.png) — 사용자가 저장한 회색 라벨 세계지도
 * - 마커: 해당 지도에 맞춘 수동 % 좌표(비-equirectangular). 빈도에 따라 원 크기·색
 * - 마우스오버: 지역·수치 툴팁 / 클릭: 전체화면 줌
 */
const MAP_SRC = "/world-map.png";
const MAP_RATIO = "1179 / 666"; // 첨부 지도 종횡비 (필요 시 조정)

// 지역 → 지도상 % 좌표 (left/top). 이미지 교체 시 미세조정.
// 좌표 = world-map.png 육지 픽셀에서 직접 측정 (이 지도는 정거원통도법 아님 — 동아시아 압축).
const GEO: Record<string, { left: number; top: number; label: string }> = {
  "KR-Seoul": { left: 74, top: 47.5, label: "서울" },
  "KR-Busan": { left: 74.5, top: 50, label: "부산" },
  "JP-Tokyo": { left: 79, top: 48, label: "도쿄" },
  "SG": { left: 70.5, top: 65.5, label: "싱가포르" },
  "US-West": { left: 19, top: 44, label: "US-West" },
  "EU-Frankfurt": { left: 49, top: 41, label: "프랑크푸르트" },
};

function color(frac: number) {
  const r = Math.round(40 + frac * 200), b = Math.round(230 - frac * 180);
  return `rgb(${r},90,${b})`;
}

function Markers({ data, max, big }: { data: { key: string; count: number }[]; max: number; big: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <>
      {data.map((d) => {
        const g = GEO[d.key];
        if (!g) return null;
        const frac = d.count / max;
        const size = (big ? 12 : 7) + frac * (big ? 30 : 14);
        return (
          <div key={d.key} style={{ position: "absolute", left: `${g.left}%`, top: `${g.top}%`, transform: "translate(-50%,-50%)" }}
            onMouseEnter={() => setHover(d.key)} onMouseLeave={() => setHover(null)}>
            <div style={{ width: size, height: size, borderRadius: "50%", background: color(frac), opacity: 0.75, border: "1.5px solid #fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700 }}>
              {big ? d.count : ""}
            </div>
            {hover === d.key && (
              <div style={{ position: "absolute", bottom: "120%", left: "50%", transform: "translateX(-50%)", background: "#0f172a", color: "#fff", padding: "4px 8px", borderRadius: 6, fontSize: 12, whiteSpace: "nowrap", zIndex: 5 }}>
                {g.label} · {d.count}건
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export default function WorldMap({ data, title }: { data: { key: string; count: number }[]; title?: string }) {
  const [full, setFull] = useState(false);
  const max = Math.max(1, ...data.map((d) => d.count));

  const mapBox = (big: boolean) => (
    <div style={{ position: "relative", width: "100%", maxWidth: big ? undefined : 729, margin: big ? undefined : "0 auto", aspectRatio: MAP_RATIO, background: `#e9edf1 url(${MAP_SRC}) center/contain no-repeat`, borderRadius: 8, cursor: big ? "default" : "zoom-in" }}
      onClick={big ? undefined : () => setFull(true)}>
      <Markers data={data} max={max} big={big} />
    </div>
  );

  return (
    <div>
      {title && <div className="mb-2 text-sm font-semibold text-foreground">{title} <span className="font-normal text-muted-foreground">· 클릭하여 확대</span></div>}
      {mapBox(false)}
      {full && (
        <div style={overlay} onClick={() => setFull(false)}>
          <div style={{ width: "90vw", maxWidth: 1200 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#fff", marginBottom: 8 }}>
              <strong>요청 위치별 분포 (전체화면)</strong>
              <button onClick={() => setFull(false)} style={{ border: 0, background: "rgba(255,255,255,.2)", color: "#fff", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>닫기 ✕</button>
            </div>
            {mapBox(true)}
          </div>
        </div>
      )}
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 80 };
