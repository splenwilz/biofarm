import type { SpendPlatform } from "@/lib/types";

export const PLATFORM_LABEL: Record<SpendPlatform, string> = {
  google_ads: "Google Ads",
  microsoft_ads: "Microsoft Ads",
  linkedin_ads: "LinkedIn Ads",
  other: "Other",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-10" -> "Oct 2026" */
export function monthLabel(month: string, withYear = true): string {
  const [y, m] = month.split("-").map(Number);
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-09" -> "September" */
export function monthName(month: string): string {
  return MONTH_NAMES[Number(month.split("-")[1]) - 1];
}

/** ["2026-08", …, "2026-10"] -> "Aug to Oct 2026"; the first year is spelt out only when it differs. */
export function windowLabel(months: readonly string[]): string {
  if (months.length === 0) return "–";
  const first = months[0];
  const last = months[months.length - 1];
  if (first === last) return monthLabel(last);
  return `${monthLabel(first, first.slice(0, 4) !== last.slice(0, 4))} to ${monthLabel(last)}`;
}

const gbpFormat = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

export function gbp(value: number | null): string {
  return value === null ? "–" : gbpFormat.format(value);
}

export function pct(value: number | null, digits = 0): string {
  return value === null ? "–" : `${(value * 100).toFixed(digits)}%`;
}

export function integer(value: number): string {
  return new Intl.NumberFormat("en-GB").format(value);
}

/** "2026-11-01T06:00:00Z" -> "1 Nov 2026" */
export function dateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** A count with its sign: "+8", "−2", "±0". */
export function signed(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "−" : "±"}${integer(Math.abs(n))}`;
}
