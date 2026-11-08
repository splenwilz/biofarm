"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { useDashboard } from "@/components/DashboardProvider";
import { DEFAULT_WINDOW, hrefWith, readFilters, type Filters } from "@/lib/filters";

/** The URL-held filters, plus helpers to change them and to build links that keep them. */
export function useFilters() {
  const { months, defaultMonth } = useDashboard();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const defaults = useMemo<Filters>(() => ({ audience: "all", month: defaultMonth, window: DEFAULT_WINDOW }), [defaultMonth]);
  const filters = useMemo(() => readFilters(params, months, defaultMonth), [params, months, defaultMonth]);

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      router.replace(hrefWith(pathname, { ...filters, ...patch }, defaults), { scroll: false });
    },
    [router, pathname, filters, defaults],
  );

  const linkTo = useCallback((path: string) => hrefWith(path, filters, defaults), [filters, defaults]);

  return { filters, setFilters, linkTo, months };
}
