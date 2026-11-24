"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useDashboard } from "@/components/DashboardProvider";
import { defaultWindowFor, hrefWith, readFilters, type Filters } from "@/lib/filters";

/**
 * The URL-held filters, plus helpers to change them and to build links that
 * keep them. The window has a per-page default (see defaultWindowFor): a window
 * nobody chose is not carried to another page, so each page opens on its own
 * default until someone picks one.
 */
export function useFilters() {
  const { months, defaultMonth } = useDashboard();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const defaults = useMemo<Filters>(() => ({ audience: "all", month: defaultMonth, window: defaultWindowFor(pathname) }), [defaultMonth, pathname]);
  const filters = useMemo(() => readFilters(params, months, defaultMonth, defaults.window), [params, months, defaultMonth, defaults.window]);
  const windowChosen = params.has("window");

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      router.replace(hrefWith(pathname, { ...filters, ...patch }, defaults), { scroll: false });
    },
    [router, pathname, filters, defaults],
  );

  /** A link to another page carrying the current filters, with any of them overridden (e.g. a tile linking to its month alone). */
  const linkTo = useCallback(
    (path: string, overrides: Partial<Filters> = {}) => {
      const target = { ...defaults, window: defaultWindowFor(path) };
      return hrefWith(path, { ...filters, window: windowChosen ? filters.window : target.window, ...overrides }, target);
    },
    [filters, defaults, windowChosen],
  );

  return { filters, setFilters, linkTo, months };
}
