import { describe, expect, it } from "vitest";

import { feedCovers, isFeedSpend, mergeSpend, splitByFeedCoverage } from "@/lib/spendMerge";
import type { SpendEntry } from "@/lib/types";

const feed: SpendEntry[] = [
  { id: "gads-1-2026-10", month: "2026-10", platform: "google_ads", campaign: "Brand", amountGbp: 1200 },
  { id: "gads-2-2026-10", month: "2026-10", platform: "google_ads", campaign: "NSIP", amountGbp: 800 },
];

describe("mergeSpend", () => {
  it("keeps hand-entered spend for platforms the feed does not cover", () => {
    const manual: SpendEntry[] = [{ id: "local-1", month: "2026-10", platform: "microsoft_ads", campaign: "Search", amountGbp: 300 }];
    expect(mergeSpend(feed, manual, new Set()).map((e) => e.id)).toEqual(["gads-1-2026-10", "gads-2-2026-10", "local-1"]);
  });

  it("drops a hand-entered Google Ads line for a month the feed already has, so the month is not counted twice", () => {
    const manual: SpendEntry[] = [
      { id: "local-1", month: "2026-10", platform: "google_ads", campaign: "Typed in", amountGbp: 2000 },
      { id: "local-2", month: "2026-08", platform: "google_ads", campaign: "Before the feed", amountGbp: 900 },
    ];
    expect(mergeSpend(feed, manual, new Set()).map((e) => e.id)).toEqual(["gads-1-2026-10", "gads-2-2026-10", "local-2"]);
  });

  it("honours removals of either kind", () => {
    const manual: SpendEntry[] = [{ id: "local-1", month: "2026-10", platform: "linkedin_ads", campaign: "x", amountGbp: 1 }];
    expect(mergeSpend(feed, manual, new Set(["gads-2-2026-10", "local-1"])).map((e) => e.id)).toEqual(["gads-1-2026-10"]);
  });

  it("tells feed rows from hand-entered ones by their id", () => {
    expect(isFeedSpend(feed[0])).toBe(true);
    expect(isFeedSpend({ id: "local-3", month: "2026-10", platform: "google_ads", campaign: "x", amountGbp: 1 })).toBe(false);
  });
});

describe("feed coverage", () => {
  it("says whether the feed already has a platform and month", () => {
    expect(feedCovers(feed, { platform: "google_ads", month: "2026-10" })).toBe(true);
    expect(feedCovers(feed, { platform: "google_ads", month: "2026-09" })).toBe(false);
    expect(feedCovers(feed, { platform: "microsoft_ads", month: "2026-10" })).toBe(false);
  });

  it("splits lines about to be added into kept and skipped", () => {
    const lines = [
      { month: "2026-10", platform: "google_ads" as const, campaign: "Typed", amountGbp: 1 },
      { month: "2026-10", platform: "linkedin_ads" as const, campaign: "L", amountGbp: 2 },
      { month: "2026-09", platform: "google_ads" as const, campaign: "Old", amountGbp: 3 },
    ];
    const { kept, skipped } = splitByFeedCoverage(feed, lines);
    expect(kept.map((l) => l.campaign)).toEqual(["L", "Old"]);
    expect(skipped.map((l) => l.campaign)).toEqual(["Typed"]);
  });
});
