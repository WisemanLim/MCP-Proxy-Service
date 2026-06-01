"use client";

import { useEffect, useState } from "react";
import { api, type Notification } from "@/lib/api";
import { fmtTime } from "@/lib/utils";

/**
 * 대시보드 알림 팝업 — 알림이 있을 때만 우측 하단에 플로팅 표시 (참고: Eden-FP notifications-card).
 * ADMIN/SUPERVISOR 전용. 15초 폴링. 확인(읽음) 처리 / 닫기.
 */
export default function NotificationsPopup({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Notification[]>([]);
  const [closed, setClosed] = useState(false);

  async function load() {
    if (!isAdmin) return;
    try { setItems((await api.listNotifications()).items.filter((n) => !n.read)); } catch { /* noop */ }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [isAdmin]);

  async function read(id: string) {
    try { await api.readNotification(id); await load(); } catch { /* noop */ }
  }

  if (!isAdmin || closed || items.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[70] w-[360px] max-w-[90vw] overflow-hidden rounded-xl border border-chart-3/60 bg-card text-card-foreground shadow-2xl">
      <div className="flex items-center justify-between bg-chart-3/15 px-3.5 py-2.5 text-sm font-bold">
        <span>📩 사용자 알림 <b>{items.length}건</b></span>
        <button className="text-base text-muted-foreground" onClick={() => setClosed(true)} title="닫기">✕</button>
      </div>
      <ul className="max-h-[300px] list-none overflow-auto">
        {items.map((n) => (
          <li key={n.id} className="flex items-start gap-2 border-t px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold">{n.from_email} <span className="font-normal text-muted-foreground">· {n.type}</span></div>
              <div className="my-0.5 break-words text-sm">{n.message}</div>
              <div className="text-[11px] text-muted-foreground">{fmtTime(n.created_at)}</div>
            </div>
            <button className="shrink-0 rounded-md border px-2.5 py-1 text-xs text-primary" onClick={() => read(n.id)}>확인</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
