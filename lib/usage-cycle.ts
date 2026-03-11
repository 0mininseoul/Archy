import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@/lib/types/database";

export const USAGE_RESET_TIME_ZONE = "Asia/Seoul";

const KST_OFFSET_HOURS = 9;

type UsageTrackedUser = Pick<User, "created_at" | "last_reset_at" | "monthly_minutes_used">;

interface TimeZoneDateParts {
  year: number;
  month: number;
  day: number;
}

export interface UsageCycleInfo {
  anchorDay: number;
  currentCycleStart: Date;
  currentCycleStartIso: string;
  nextResetAt: Date;
  nextResetAtIso: string;
  shouldReset: boolean;
}

function getTimeZoneDateParts(date: Date): TimeZoneDateParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: USAGE_RESET_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const readPart = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value || "0");

  return {
    year: readPart("year"),
    month: readPart("month"),
    day: readPart("day"),
  };
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getShiftedMonth(year: number, month: number, delta: number): {
  year: number;
  month: number;
} {
  const monthIndex = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(monthIndex / 12),
    month: (monthIndex % 12) + 1,
  };
}

function createKstMidnightDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, -KST_OFFSET_HOURS, 0, 0, 0));
}

function getCycleResetDate(year: number, month: number, anchorDay: number): Date {
  const day = Math.min(anchorDay, getDaysInMonth(year, month));
  return createKstMidnightDate(year, month, day);
}

export function getUsageCycleInfo(params: {
  createdAt: string | Date;
  lastResetAt?: string | Date | null;
  now?: Date;
}): UsageCycleInfo {
  const createdAt = params.createdAt instanceof Date ? params.createdAt : new Date(params.createdAt);
  const lastResetAtSource = params.lastResetAt ?? createdAt;
  const lastResetAt =
    lastResetAtSource instanceof Date ? lastResetAtSource : new Date(lastResetAtSource);
  const now = params.now ?? new Date();

  const createdAtParts = getTimeZoneDateParts(createdAt);
  const nowParts = getTimeZoneDateParts(now);
  const anchorDay = createdAtParts.day;

  let cycleYear = nowParts.year;
  let cycleMonth = nowParts.month;
  let currentCycleStart = getCycleResetDate(cycleYear, cycleMonth, anchorDay);

  if (currentCycleStart.getTime() > now.getTime()) {
    const previousMonth = getShiftedMonth(cycleYear, cycleMonth, -1);
    cycleYear = previousMonth.year;
    cycleMonth = previousMonth.month;
    currentCycleStart = getCycleResetDate(cycleYear, cycleMonth, anchorDay);
  }

  const nextMonth = getShiftedMonth(cycleYear, cycleMonth, 1);
  const nextResetAt = getCycleResetDate(nextMonth.year, nextMonth.month, anchorDay);

  return {
    anchorDay,
    currentCycleStart,
    currentCycleStartIso: currentCycleStart.toISOString(),
    nextResetAt,
    nextResetAtIso: nextResetAt.toISOString(),
    shouldReset: lastResetAt.getTime() < currentCycleStart.getTime(),
  };
}

export async function loadUserWithUsageReset<T extends UsageTrackedUser>(
  supabase: SupabaseClient,
  userId: string,
  select: string
): Promise<{
  data: T | null;
  error: unknown;
  usageCycle: UsageCycleInfo | null;
}> {
  const initialResult = await supabase.from("users").select(select).eq("id", userId).single();
  const initialData = (initialResult.data as T | null) ?? null;

  if (initialResult.error || !initialData) {
    return {
      data: initialData,
      error: initialResult.error,
      usageCycle: null,
    };
  }

  let usageCycle = getUsageCycleInfo({
    createdAt: initialData.created_at,
    lastResetAt: initialData.last_reset_at,
  });

  if (!usageCycle.shouldReset) {
    return {
      data: initialData,
      error: null,
      usageCycle,
    };
  }

  const resetResult = await supabase
    .from("users")
    .update({
      monthly_minutes_used: 0,
      last_reset_at: usageCycle.currentCycleStartIso,
    })
    .eq("id", userId)
    .lt("last_reset_at", usageCycle.currentCycleStartIso)
    .select(select)
    .maybeSingle();

  if (resetResult.error) {
    return {
      data: null,
      error: resetResult.error,
      usageCycle,
    };
  }

  let resolvedData = (resetResult.data as T | null) ?? null;

  if (!resolvedData) {
    const refreshResult = await supabase.from("users").select(select).eq("id", userId).single();
    if (refreshResult.error) {
      return {
        data: null,
        error: refreshResult.error,
        usageCycle,
      };
    }

    resolvedData = (refreshResult.data as unknown as T | null) ?? null;
  }

  if (!resolvedData) {
    return {
      data: null,
      error: null,
      usageCycle,
    };
  }

  usageCycle = getUsageCycleInfo({
    createdAt: resolvedData.created_at,
    lastResetAt: resolvedData.last_reset_at,
  });

  return {
    data: resolvedData,
    error: null,
    usageCycle,
  };
}
