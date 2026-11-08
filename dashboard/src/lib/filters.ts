/**
 * Global filters live in the URL (`?audience=developer&month=2026-09`), the
 * way BoothIQ carries `?booth=`: a link to any page keeps them, a reload keeps
 * them, and a URL can be pasted into a meeting invite. Defaults are omitted so
 * the canonical address of each page stays clean.
 */

export type AudienceFilter = "all" | "developer" | "landowner";

/** How many months a breakdown (sources, campaigns) covers, ending at the period month. */
export type WindowMonths = 1 | 3 | 12;
export const WINDOWS: readonly WindowMonths[] = [1, 3, 12];
/** Three months: one is too thin to split eight ways, twelve hides change. */
export const DEFAULT_WINDOW: WindowMonths = 3;

export interface Filters {
  audience: AudienceFilter;
  /** The month the period ends on, "YYYY-MM". Headline tiles show this month. */
  month: string;
  /** Breakdown window ending on that month. */
  window: WindowMonths;
}

const AUDIENCES: readonly AudienceFilter[] = ["all", "developer", "landowner"];

export function parseAudience(value: string | null): AudienceFilter {
  return AUDIENCES.includes(value as AudienceFilter)
    ? (value as AudienceFilter)
    : "all";
}

export function parseMonth(
  value: string | null,
  allowed: readonly string[],
  fallback: string,
): string {
  return value !== null && allowed.includes(value) ? value : fallback;
}

export function parseWindow(value: string | null): WindowMonths {
  const n = Number(value);
  return WINDOWS.includes(n as WindowMonths)
    ? (n as WindowMonths)
    : DEFAULT_WINDOW;
}

export function readFilters(
  params: URLSearchParams,
  allowedMonths: readonly string[],
  defaultMonth: string,
): Filters {
  return {
    audience: parseAudience(params.get("audience")),
    month: parseMonth(params.get("month"), allowedMonths, defaultMonth),
    window: parseWindow(params.get("window")),
  };
}

export function hrefWith(
  path: string,
  filters: Filters,
  defaults: Filters,
): string {
  const params = new URLSearchParams();
  if (filters.audience !== defaults.audience)
    params.set("audience", filters.audience);
  if (filters.month !== defaults.month) params.set("month", filters.month);
  if (filters.window !== defaults.window)
    params.set("window", String(filters.window));
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const AUDIENCE_LABEL: Record<
  AudienceFilter,
  { title: string; detail: string }
> = {
  all: { title: "All audiences", detail: "Developer and landowner pipelines" },
  developer: { title: "Developers", detail: "Developer pipeline" },
  landowner: { title: "Landowners", detail: "Landowner pipeline" },
};
