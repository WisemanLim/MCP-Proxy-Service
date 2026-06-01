import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** DB의 UTC 시각("YYYY-MM-DD HH:MM:SS") → 구동 시스템(브라우저) 로컬 시각 표시. */
export function fmtTime(utc?: string | null): string {
  if (!utc) return "—";
  const iso = utc.includes("T") ? utc : utc.replace(" ", "T") + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? utc : d.toLocaleString();
}
