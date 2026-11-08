import { describe, expect, it } from "vitest";

import { isActiveHref, NAV_SECTIONS, OVERVIEW } from "@/components/shell/nav";

describe("isActiveHref", () => {
  it("matches the overview exactly and other items with their nested routes", () => {
    expect(isActiveHref("/", "/")).toBe(true);
    expect(isActiveHref("/sources", "/")).toBe(false);
    expect(isActiveHref("/sources", "/sources")).toBe(true);
    expect(isActiveHref("/sources/paid", "/sources")).toBe(true);
    expect(isActiveHref("/sourcesx", "/sources")).toBe(false);
  });
});

describe("navigation", () => {
  it("pins Overview at the root and groups the rest into labelled sections", () => {
    expect(OVERVIEW.href).toBe("/");
    expect(NAV_SECTIONS.map((s) => s.title)).toEqual(["Performance", "Operations", "Setup"]);
    const hrefs = NAV_SECTIONS.flatMap((s) => s.items).map((i) => i.href);
    expect(hrefs.every((h) => h.startsWith("/"))).toBe(true);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
