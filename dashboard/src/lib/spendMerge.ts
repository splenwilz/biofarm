import type { SpendEntry } from "@/lib/types";

/** Feed rows come from the Google Ads pull with ids like "gads-<campaign>-<month>"; anything else was typed in or imported from a CSV. */
export function isFeedSpend(entry: SpendEntry): boolean {
  return entry.id.startsWith("gads-");
}

/**
 * The spend the pages see: the feed plus what was entered this session, minus removals. A
 * hand-entered line for a platform and month the feed already covers is left out, otherwise the
 * month would be counted twice; hand entry stays for the platforms the feed does not reach
 * (Microsoft, LinkedIn) and for months before the feed began.
 */
export function mergeSpend(feed: SpendEntry[], added: SpendEntry[], removed: ReadonlySet<string>): SpendEntry[] {
  const covered = new Set(feed.filter(isFeedSpend).map((e) => `${e.platform}|${e.month}`));
  const manual = added.filter((e) => !covered.has(`${e.platform}|${e.month}`));
  return [...feed, ...manual].filter((e) => !removed.has(e.id));
}

/** A hand-entered line the feed already covers (same platform and month), so adding it would count the month twice. */
export function feedCovers(feed: SpendEntry[], entry: Pick<SpendEntry, "platform" | "month">): boolean {
  return feed.some((e) => isFeedSpend(e) && e.platform === entry.platform && e.month === entry.month);
}

/** Splits lines about to be added into the ones to keep and the ones the feed makes redundant. */
export function splitByFeedCoverage<T extends Pick<SpendEntry, "platform" | "month">>(feed: SpendEntry[], entries: T[]): { kept: T[]; skipped: T[] } {
  const kept: T[] = [];
  const skipped: T[] = [];
  for (const entry of entries) (feedCovers(feed, entry) ? skipped : kept).push(entry);
  return { kept, skipped };
}
