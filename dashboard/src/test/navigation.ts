import { vi } from "vitest";

/**
 * Mutable stand-in for next/navigation in component tests. Each test file
 * still has to call `vi.mock("next/navigation", () => navigationMock)` itself
 * because vi.mock is hoisted per file.
 */
export const navState = {
  pathname: "/",
  search: "",
  replace: vi.fn(),
  push: vi.fn(),
};

export function resetNavigation(pathname = "/", search = "") {
  navState.pathname = pathname;
  navState.search = search;
  navState.replace.mockReset();
  navState.push.mockReset();
}

export const navigationMock = {
  usePathname: () => navState.pathname,
  useSearchParams: () => new URLSearchParams(navState.search),
  useRouter: () => ({ replace: navState.replace, push: navState.push, prefetch: () => {} }),
};
