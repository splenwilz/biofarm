import type { CpdMonth } from "@/lib/types";

export interface CpdReport {
  /** Bookings per month of the report window, in window order, zero where none. */
  byMonth: number[];
  /** Bookings in the window. */
  total: number;
  /** Bookings in the report month and the month before it. */
  thisMonth: number;
  prevMonth: number;
  /** Earliest month with a booking, in the window, or null. */
  firstMonth: string | null;
}

/**
 * CPD session bookings as the CPD page shows them. The feed gives one row per
 * month from July 2026 (zero-filled); a feed from before the line existed gives
 * nothing, and the page then shows zeros rather than failing.
 */
export function cpdReport(rows: CpdMonth[] | undefined, months: string[]): CpdReport {
  const by = new Map((rows ?? []).map((r) => [r.month, r.bookings]));
  const byMonth = months.map((m) => by.get(m) ?? 0);
  const last = months.length - 1;
  const first = months.find((m) => (by.get(m) ?? 0) > 0) ?? null;
  return {
    byMonth,
    total: byMonth.reduce((s, n) => s + n, 0),
    thisMonth: byMonth[last] ?? 0,
    prevMonth: last > 0 ? byMonth[last - 1] : 0,
    firstMonth: first,
  };
}
