import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatDurationMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분`;
}

/**
 * Format date to Korean Standard Time (KST, UTC+9)
 */
export function formatKSTDate(date?: Date): string {
  const targetDate = date || new Date();
  return targetDate.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
  });
}
