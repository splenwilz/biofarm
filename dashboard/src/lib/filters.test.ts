import { describe, expect, it } from "vitest";

import { hrefWith, parseAudience, parseMonth, parseWindow, readFilters } from "@/lib/filters";

const months = ["2026-08", "2026-09", "2026-10"];
const defaults = { audience: "all", month: "2026-10", window: 3 } as const;

describe("parseAudience", () => {
  it("accepts the two pipelines and falls back to all", () => {
    expect(parseAudience("developer")).toBe("developer");
    expect(parseAudience("landowner")).toBe("landowner");
    expect(parseAudience("all")).toBe("all");
    expect(parseAudience(null)).toBe("all");
    expect(parseAudience("booth")).toBe("all");
  });
});

describe("parseMonth", () => {
  it("accepts only a month in the allowed window", () => {
    expect(parseMonth("2026-09", months, "2026-10")).toBe("2026-09");
    expect(parseMonth("2025-01", months, "2026-10")).toBe("2026-10");
    expect(parseMonth("garbage", months, "2026-10")).toBe("2026-10");
    expect(parseMonth(null, months, "2026-10")).toBe("2026-10");
  });
});

describe("parseWindow", () => {
  it("accepts 1, 3 or 12 months and falls back to three", () => {
    expect(parseWindow("1")).toBe(1);
    expect(parseWindow("12")).toBe(12);
    expect(parseWindow("6")).toBe(3);
    expect(parseWindow(null)).toBe(3);
  });
});

describe("readFilters", () => {
  it("reads the filters from the query string, with the window defaulting to three months", () => {
    const params = new URLSearchParams("audience=developer&month=2026-08");
    expect(readFilters(params, months, "2026-10")).toEqual({ audience: "developer", month: "2026-08", window: 3 });
    expect(readFilters(new URLSearchParams("window=12"), months, "2026-10")).toEqual({ audience: "all", month: "2026-10", window: 12 });
  });
});

describe("hrefWith", () => {
  it("omits defaults so the canonical URL stays clean", () => {
    expect(hrefWith("/sources", { audience: "all", month: "2026-10", window: 3 }, defaults)).toBe("/sources");
  });

  it("carries non-default filters as query params", () => {
    expect(hrefWith("/sources", { audience: "landowner", month: "2026-10", window: 3 }, defaults)).toBe("/sources?audience=landowner");
    expect(hrefWith("/", { audience: "developer", month: "2026-09", window: 3 }, defaults)).toBe("/?audience=developer&month=2026-09");
    expect(hrefWith("/sources", { audience: "all", month: "2026-10", window: 12 }, defaults)).toBe("/sources?window=12");
  });
});
