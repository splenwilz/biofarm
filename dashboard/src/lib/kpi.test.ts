import { describe, expect, it } from "vitest";

import { kpiConfig, type KpiConfig } from "@/config/kpi";
import {
  cohortTable,
  cpqo,
  enquiriesBySource,
  enquiryAttribution,
  inboundEnquiries,
  inboundSourceGroups,
  monthOf,
  monthRange,
  paidSummary,
  platformOf,
  qualifiedByMonth,
  qualifiedInbound,
  qualifiedTargetForMonth,
  SOURCE_GROUPS,
  sourceOf,
  spendByMonth,
  trailingSum,
} from "@/lib/kpi";
import type { Deal, Enquiry, SpendEntry } from "@/lib/types";

const cfg: KpiConfig = kpiConfig;

const deal = (over: Partial<Deal> & Pick<Deal, "id" | "createdAt">): Deal => ({
  pipeline: "developer",
  channel: "Website",
  qualifiedAt: over.createdAt,
  status: "open",
  sourceLabel: null,
  campaign: null,
  personId: null,
  ...over,
});

const enquiry = (over: Partial<Enquiry> & Pick<Enquiry, "id" | "createdAt">): Enquiry => ({
  kind: "lead",
  form: "contact",
  audience: "developer",
  channel: "Website",
  sourceLabel: "direct",
  campaign: null,
  landingPage: "/",
  firstContactAt: null,
  personId: null,
  archived: false,
  converted: false,
  ...over,
});

// ---- months -----------------------------------------------------------------

describe("months", () => {
  it("monthOf reads the calendar month of an ISO timestamp", () => {
    expect(monthOf("2026-10-28T08:00:00Z")).toBe("2026-10");
    expect(monthOf("2026-01-05")).toBe("2026-01");
  });

  it("monthRange ends at the given month and walks back across a year boundary", () => {
    expect(monthRange("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthRange("2026-10", 1)).toEqual(["2026-10"]);
  });
});

// ---- qualified opportunities ---------------------------------------------------

describe("qualifiedByMonth", () => {
  const months = ["2026-09", "2026-10"];
  const deals: Deal[] = [
    deal({ id: "a", createdAt: "2026-10-03", channel: "Website" }),
    deal({ id: "b", createdAt: "2026-10-09", channel: "Info email inbox" }),
    deal({ id: "c", createdAt: "2026-10-12", channel: "Existing Network" }),
    deal({ id: "d", createdAt: "2026-10-15", channel: "Introducer" }),
    deal({ id: "e", createdAt: "2026-10-20", channel: null }),
    // landowner deal created in Sept, qualified (moved past stage 1) in Oct
    deal({
      id: "f",
      pipeline: "landowner",
      createdAt: "2026-09-25",
      qualifiedAt: "2026-10-02",
      channel: "Trade Show / Event",
    }),
    // landowner deal never qualified
    deal({ id: "g", pipeline: "landowner", createdAt: "2026-10-05", qualifiedAt: null }),
    // outside the window
    deal({ id: "h", createdAt: "2026-08-30" }),
  ];

  it("counts inbound and network deals separately, by the month they qualified", () => {
    expect(qualifiedByMonth(deals, months, cfg)).toEqual([
      { month: "2026-09", inbound: 0, network: 0, unattributed: 0 },
      { month: "2026-10", inbound: 3, network: 2, unattributed: 1 },
    ]);
  });

  it("can be limited to one pipeline", () => {
    expect(qualifiedByMonth(deals, months, cfg, "landowner")).toEqual([
      { month: "2026-09", inbound: 0, network: 0, unattributed: 0 },
      { month: "2026-10", inbound: 1, network: 0, unattributed: 0 },
    ]);
  });

  it("ignores pipelines outside the config", () => {
    const narrow: KpiConfig = { ...cfg, pipelines: ["landowner"] };
    expect(qualifiedByMonth(deals, months, narrow)[1]).toEqual({
      month: "2026-10",
      inbound: 1,
      network: 0,
      unattributed: 0,
    });
  });

  it("reads the inbound channel list from the config", () => {
    const websiteOnly: KpiConfig = { ...cfg, inboundChannels: ["Website"] };
    expect(qualifiedByMonth(deals, months, websiteOnly)[1].inbound).toBe(1);
  });
});

// ---- spend and CPQO --------------------------------------------------------------

describe("spend", () => {
  const spend: SpendEntry[] = [
    { id: "1", month: "2026-10", platform: "google_ads", campaign: "Search", amountGbp: 1200 },
    { id: "2", month: "2026-10", platform: "microsoft_ads", campaign: "Search", amountGbp: 300.5 },
    { id: "3", month: "2026-09", platform: "google_ads", campaign: "Search", amountGbp: 900 },
    { id: "4", month: "2026-07", platform: "google_ads", campaign: "Search", amountGbp: 999 },
  ];

  it("spendByMonth sums every platform and gives zero for months without entries", () => {
    expect(spendByMonth(spend, ["2026-08", "2026-09", "2026-10"])).toEqual([
      { month: "2026-08", spendGbp: 0 },
      { month: "2026-09", spendGbp: 900 },
      { month: "2026-10", spendGbp: 1500.5 },
    ]);
  });

  it("cpqo divides spend by qualified opportunities and is null when there are none", () => {
    expect(cpqo(1500, 6)).toBe(250);
    expect(cpqo(1500, 0)).toBeNull();
    expect(cpqo(0, 4)).toBeNull(); // no spend recorded is "waiting for data", not free
  });

  it("trailingSum adds the last n values", () => {
    expect(trailingSum([1, 2, 3, 4], 3)).toBe(9);
    expect(trailingSum([5], 3)).toBe(5);
    expect(trailingSum([], 3)).toBe(0);
  });
});

// ---- source groups --------------------------------------------------------------

describe("sourceOf", () => {
  it.each([
    ["google/cpc", null, "Paid search", "Google Ads"],
    ["bing/cpc", "Website", "Paid search", "Microsoft Ads"],
    ["google/ppc", null, "Paid search", "Google Ads"],
    ["duckduckgo/cpc", null, "Paid search", "Other paid search"],
    ["linkedin/paid-social", null, "LinkedIn ads", "LinkedIn Ads"],
    ["linkedin.com/referral", null, "LinkedIn posts", "LinkedIn"],
    [null, "Linkedin", "LinkedIn posts", "LinkedIn"],
    ["newsletter/email", null, "Newsletter", "Newsletter"],
    ["pipedrive/email", null, "Newsletter", "Newsletter"],
    [null, "Trade Show / Event", "Events", "Trade show or event"],
    ["chatgpt.com/referral", null, "Referral", "ChatGPT"],
    ["perplexity.ai/referral", null, "Referral", "Perplexity"],
    ["t.co/referral", null, "Referral", "X (Twitter)"],
    ["facebook/social", null, "Referral", "Facebook"],
    ["planningportal.co.uk/referral", null, "Referral", "planningportal.co.uk"],
    ["google.com/referral", null, "Organic search", "Google"],
    ["chatgpt.com", null, "Referral", "ChatGPT"], // a bare host as the source (ChatGPT's own utm_source) is a referral
    ["google.com", null, "Organic search", "Google"],
    ["planningportal.co.uk", null, "Referral", "planningportal.co.uk"],
    ["bing.com/referral", null, "Organic search", "Bing"],
    ["duckduckgo.com/referral", null, "Organic search", "Other search engines"],
    [null, "Info email inbox", "Info email inbox", "Info email inbox"],
    [null, "Marketplace", "Marketplace", "Marketplace"],
    [null, "Campaigns / Outreach", "Direct/unknown", "Campaigns / Outreach"],
    ["direct", null, "Website (source not tracked)", "Website"], // "direct" is what the lead API writes when nothing about the visit is known
    [null, "Website", "Website (source not tracked)", "Website"],
    [null, null, "Direct/unknown", "Unknown"],
    ["something/odd", null, "Direct/unknown", "Unknown"],
  ])("label %s with channel %s -> %s / %s", (label, channel, group, platform) => {
    expect(sourceOf(label, channel as Deal["channel"])).toEqual({ group, platform });
  });

  it("the label wins over the channel because it is the more specific signal", () => {
    expect(sourceOf("bing/cpc", "Info email inbox")).toEqual({ group: "Paid search", platform: "Microsoft Ads" });
  });

  it("lists the reporting groups in their fixed order; nothing with a known channel is Direct/unknown", () => {
    expect(SOURCE_GROUPS).toEqual(["Paid search", "Organic search", "LinkedIn ads", "LinkedIn posts", "Newsletter", "Referral", "Events", "Website (source not tracked)", "Info email inbox", "Marketplace", "Direct/unknown"]);
  });
});

// ---- enquiries by source -------------------------------------------------------

describe("enquiriesBySource", () => {
  const months = ["2026-10"];
  const enquiries: Enquiry[] = [
    enquiry({ id: "1", createdAt: "2026-10-01", sourceLabel: "bing/cpc", personId: 1 }),
    enquiry({ id: "2", createdAt: "2026-10-02", sourceLabel: "google/cpc", personId: 2 }),
    enquiry({ id: "3", createdAt: "2026-10-03", sourceLabel: "direct", personId: 3 }),
    enquiry({ id: "4", createdAt: "2026-10-04", sourceLabel: "newsletter/email", personId: 4, audience: "landowner" }),
    enquiry({ id: "5", createdAt: "2026-09-04", sourceLabel: "direct", personId: 5 }), // out of range
  ];
  const deals: Deal[] = [
    deal({ id: "a", createdAt: "2026-10-05", sourceLabel: "bing/cpc", personId: 1 }),
    deal({ id: "b", createdAt: "2026-10-06", channel: "Existing Network", personId: 9 }),
    deal({ id: "c", createdAt: "2026-10-07", channel: "Info email inbox", personId: 8 }),
  ];
  const spend: SpendEntry[] = [
    { id: "s1", month: "2026-10", platform: "google_ads", campaign: "x", amountGbp: 100 },
    { id: "s2", month: "2026-10", platform: "microsoft_ads", campaign: "x", amountGbp: 50 },
    { id: "s3", month: "2026-09", platform: "google_ads", campaign: "x", amountGbp: 999 }, // out of range
  ];

  it("groups enquiries, qualified opportunities and spend, with the platforms inside each group", () => {
    const rows = enquiriesBySource(enquiries, deals, spend, months, cfg);
    // ties (one enquiry, nothing qualified) fall back to the fixed group order, so Newsletter comes before the untracked website row
    expect(rows.map((r) => r.group)).toEqual(["Paid search", "Newsletter", "Website (source not tracked)", "Info email inbox", "Organic search", "LinkedIn ads", "LinkedIn posts", "Referral", "Events", "Marketplace", "Direct/unknown"]);
    expect(rows[0]).toEqual({
      group: "Paid search",
      enquiries: 2,
      conversionBase: 2,
      qualified: 1,
      qualifiedFromLeads: 1,
      conversion: 0.5,
      spendGbp: 150,
      cpqo: 150,
      platforms: [
        { platform: "Microsoft Ads", enquiries: 1, conversionBase: 1, qualified: 1, qualifiedFromLeads: 1, conversion: 1, spendGbp: 50, cpqo: 50 },
        { platform: "Google Ads", enquiries: 1, conversionBase: 1, qualified: 0, qualifiedFromLeads: 0, conversion: 0, spendGbp: 100, cpqo: null },
      ],
    });
    expect(rows[2]).toEqual({
      group: "Website (source not tracked)",
      enquiries: 1,
      conversionBase: 1,
      qualified: 0,
      qualifiedFromLeads: 0,
      conversion: 0,
      spendGbp: null,
      cpqo: null,
      platforms: [{ platform: "Website", enquiries: 1, conversionBase: 1, qualified: 0, qualifiedFromLeads: 0, conversion: 0, spendGbp: null, cpqo: null }],
    });
    expect(rows[3]).toEqual({
      group: "Info email inbox",
      enquiries: 0,
      conversionBase: 0,
      qualified: 1,
      qualifiedFromLeads: 1,
      conversion: null,
      spendGbp: null,
      cpqo: null,
      platforms: [{ platform: "Info email inbox", enquiries: 0, conversionBase: 0, qualified: 1, qualifiedFromLeads: 1, conversion: null, spendGbp: null, cpqo: null }],
    });
  });

  it("deals the team created directly count as enquiries but stay out of the qualified share on both sides", () => {
    // two website leads, one of which qualified; one deal created directly (an enquiry of kind "deal" and a qualified deal with the same id)
    const list: Enquiry[] = [
      enquiry({ id: "l1", createdAt: "2026-10-01", sourceLabel: null, personId: 1 }),
      enquiry({ id: "l2", createdAt: "2026-10-02", sourceLabel: null, personId: 2 }),
      enquiry({ id: "77", createdAt: "2026-10-03", kind: "deal", form: null, sourceLabel: null, personId: 3 }),
    ];
    const qualified: Deal[] = [deal({ id: "q1", createdAt: "2026-10-05", personId: 1 }), deal({ id: "77", createdAt: "2026-10-03", personId: 3 })];
    const row = enquiriesBySource(list, qualified, [], months, cfg)[0];
    expect(row.group).toBe("Website (source not tracked)");
    expect([row.enquiries, row.qualified]).toEqual([3, 2]);
    expect([row.conversionBase, row.qualifiedFromLeads, row.conversion]).toEqual([2, 1, 0.5]);
  });

  it("a deal converted from a lead Pipedrive has deleted came in as a lead, so it stays in the share", () => {
    const list: Enquiry[] = [
      enquiry({ id: "l1", createdAt: "2026-10-01", sourceLabel: null, personId: 1 }),
      enquiry({ id: "88", createdAt: "2026-10-03", kind: "deal", converted: true, form: null, sourceLabel: null, personId: 3 }),
    ];
    const row = enquiriesBySource(list, [deal({ id: "88", createdAt: "2026-10-03", personId: 3 })], [], months, cfg)[0];
    expect([row.enquiries, row.conversionBase, row.qualified, row.qualifiedFromLeads, row.conversion]).toEqual([2, 2, 1, 1, 0.5]);
  });

  it("keeps paid groups' spend as a number (so the cost column can say '–') and unpaid groups' as null (blank)", () => {
    const rows = enquiriesBySource(enquiries, deals, spend, months, cfg);
    expect(rows.find((r) => r.group === "LinkedIn ads")).toEqual({ group: "LinkedIn ads", enquiries: 0, conversionBase: 0, qualified: 0, qualifiedFromLeads: 0, conversion: null, spendGbp: 0, cpqo: null, platforms: [] });
    expect(rows.find((r) => r.group === "Organic search")!.spendGbp).toBeNull();
  });

  it("network deals are not in the source table (they are not marketing's number)", () => {
    const rows = enquiriesBySource(enquiries, deals, spend, months, cfg);
    expect(rows.flatMap((r) => r.platforms.map((p) => p.platform))).not.toContain("Existing Network");
  });

  it("an enquiry without a website label is grouped by its Pipedrive channel, and outbound enquiries are left out", () => {
    const extra = [
      ...enquiries,
      enquiry({ id: "6", createdAt: "2026-10-06", sourceLabel: null, channel: "Trade Show / Event", form: null }),
      enquiry({ id: "7", createdAt: "2026-10-07", sourceLabel: null, channel: "Campaigns / Outreach", form: null }),
      enquiry({ id: "8", createdAt: "2026-10-08", sourceLabel: null, channel: null, form: null }),
    ];
    const rows = enquiriesBySource(extra, deals, spend, months, cfg);
    expect(rows.find((r) => r.group === "Events")!.enquiries).toBe(1);
    expect(rows.reduce((s, r) => s + r.enquiries, 0)).toBe(5); // 4 website + the event; not the outreach lead, not the one with no channel
  });

  it("can be limited to one audience / pipeline; spend stays audience-neutral", () => {
    const rows = enquiriesBySource(enquiries, deals, spend, months, cfg, "landowner");
    expect(rows[0]).toEqual({ group: "Newsletter", enquiries: 1, conversionBase: 1, qualified: 0, qualifiedFromLeads: 0, conversion: 0, spendGbp: null, cpqo: null, platforms: [{ platform: "Newsletter", enquiries: 1, conversionBase: 1, qualified: 0, qualifiedFromLeads: 0, conversion: 0, spendGbp: null, cpqo: null }] });
    const paid = rows.find((r) => r.group === "Paid search")!;
    expect(paid.spendGbp).toBe(150);
    expect(paid.cpqo).toBeNull();
  });
});

describe("paidSummary", () => {
  it("totals the paid groups: their share of enquiries and spend over their qualified opportunities", () => {
    const rows = enquiriesBySource(
      [enquiry({ id: "1", createdAt: "2026-10-01", sourceLabel: "bing/cpc" }), enquiry({ id: "2", createdAt: "2026-10-02", sourceLabel: "google/cpc" }), enquiry({ id: "3", createdAt: "2026-10-03", sourceLabel: "direct" }), enquiry({ id: "4", createdAt: "2026-10-04", sourceLabel: "linkedin/paid-social" })],
      [deal({ id: "a", createdAt: "2026-10-05", sourceLabel: "bing/cpc" }), deal({ id: "b", createdAt: "2026-10-05", sourceLabel: "linkedin/paid-social" })],
      [{ id: "s1", month: "2026-10", platform: "google_ads", campaign: "x", amountGbp: 100 }, { id: "s2", month: "2026-10", platform: "linkedin_ads", campaign: "x", amountGbp: 60 }],
      ["2026-10"],
      cfg,
    );
    expect(paidSummary(rows)).toEqual({ enquiries: 3, share: 0.75, spendGbp: 160, qualified: 2, cpqo: 80 });
  });

  it("has no share or cost when there is nothing to divide by", () => {
    expect(paidSummary(enquiriesBySource([], [], [], ["2026-10"], cfg))).toEqual({ enquiries: 0, share: null, spendGbp: 0, qualified: 0, cpqo: null });
  });
});

describe("enquiryAttribution and inboundEnquiries", () => {
  it("reads the enquiry's Pipedrive channel against the same config as deals", () => {
    expect(enquiryAttribution(enquiry({ id: "1", createdAt: "2026-10-01", channel: "Website" }), cfg)).toBe("inbound");
    expect(enquiryAttribution(enquiry({ id: "2", createdAt: "2026-10-01", channel: "Marketplace" }), cfg)).toBe("inbound");
    expect(enquiryAttribution(enquiry({ id: "3", createdAt: "2026-10-01", channel: "Campaigns / Outreach" }), cfg)).toBe("network");
    expect(enquiryAttribution(enquiry({ id: "4", createdAt: "2026-10-01", channel: "Introducer" }), cfg)).toBe("network");
    expect(enquiryAttribution(enquiry({ id: "5", createdAt: "2026-10-01", channel: null }), cfg)).toBe("unattributed");
  });

  it("inboundEnquiries keeps only the inbound ones, archived included", () => {
    const list = [
      enquiry({ id: "1", createdAt: "2026-10-01", channel: "Website", archived: true }),
      enquiry({ id: "2", createdAt: "2026-10-01", channel: "Existing Network" }),
      enquiry({ id: "3", createdAt: "2026-10-01", channel: null }),
    ];
    expect(inboundEnquiries(list, cfg).map((e) => e.id)).toEqual(["1"]);
  });
});

// ---- cohorts ---------------------------------------------------------------------

describe("cohortTable", () => {
  const today = "2026-11-01T00:00:00Z";
  const enquiries: Enquiry[] = [
    enquiry({ id: "1", createdAt: "2026-05-02", personId: 1 }),
    enquiry({ id: "2", createdAt: "2026-05-10", personId: 2 }),
    enquiry({ id: "3", createdAt: "2026-05-20", personId: 3 }),
    enquiry({ id: "4", createdAt: "2026-09-15", personId: 4 }),
    enquiry({ id: "5", createdAt: "2026-09-16", personId: null }),
    enquiry({ id: "6", createdAt: "2026-09-17", personId: 6, channel: "Introducer" }), // outbound: not a marketing cohort member
  ];
  const deals: Deal[] = [
    deal({ id: "a", createdAt: "2026-05-20", personId: 1 }), // 18 days
    deal({ id: "b", createdAt: "2026-08-01", personId: 2 }), // 83 days
    deal({ id: "c", createdAt: "2026-04-01", personId: 3 }), // before the enquiry: does not count
    deal({ id: "d", createdAt: "2026-10-30", personId: 4 }), // 45 days
    deal({ id: "e", createdAt: "2026-10-01", personId: 4, channel: "Existing Network" }), // network: no
  ];

  it("reports, per enquiry month, how many enquiries qualified within each horizon", () => {
    const rows = cohortTable(enquiries, deals, ["2026-05", "2026-09"], cfg, today);
    expect(rows).toEqual([
      { month: "2026-05", enquiries: 3, base: 3, qualifiedBy: { 30: 1, 90: 2, 150: 2 }, mature: true },
      { month: "2026-09", enquiries: 2, base: 2, qualifiedBy: { 30: 0, 90: 1, 150: 1 }, mature: false },
    ]);
  });

  it("a deal the team created directly is in the cohort's enquiry count but not in its share", () => {
    const list = [...enquiries, enquiry({ id: "77", createdAt: "2026-05-25", kind: "deal", form: null, personId: 7 })];
    const rows = cohortTable(list, [...deals, deal({ id: "77", createdAt: "2026-05-25", personId: 7 })], ["2026-05"], cfg, today);
    expect(rows[0]).toEqual({ month: "2026-05", enquiries: 4, base: 3, qualifiedBy: { 30: 1, 90: 2, 150: 2 }, mature: true });
  });

  it("a cohort is mature once its month end is older than the maturity window", () => {
    const rows = cohortTable(enquiries, deals, ["2026-05"], cfg, "2026-10-20T00:00:00Z");
    expect(rows[0].mature).toBe(false);
  });
});

describe("platformOf", () => {
  it.each([
    ["google/cpc", "google_ads"],
    ["bing/cpc", "microsoft_ads"],
    ["linkedin/paid-social", "linkedin_ads"],
    ["yahoo/cpc", "other"],
    ["google.com/referral", null],
    ["direct", null],
    [null, null],
  ])("%s -> %s", (label, expected) => {
    expect(platformOf(label)).toBe(expected);
  });
});

describe("qualification checks", () => {
  const failing = deal({ id: "a", createdAt: "2026-10-05T10:00:00Z", checks: { buyer: false, project: true, serve: true, habitat: true, timing: true } });
  const passing = deal({ id: "b", createdAt: "2026-10-06T10:00:00Z", checks: { buyer: true, project: true, serve: true, habitat: true, timing: true } });
  const bare = deal({ id: "c", createdAt: "2026-10-07T10:00:00Z" });
  const withChecks = (on: Partial<KpiConfig["qualificationChecks"]>): KpiConfig => ({ ...cfg, qualificationChecks: { ...cfg.qualificationChecks, ...on } });

  it("every check is off by default, so a stage move alone counts", () => {
    expect(Object.values(cfg.qualificationChecks).every((v) => v === false)).toBe(true);
    expect(qualifiedInbound([failing, passing, bare], cfg)).toHaveLength(3);
  });

  it("a check that is switched on removes the deals that failed it, everywhere", () => {
    const on = withChecks({ buyer: true });
    expect(qualifiedInbound([failing, passing, bare], on).map((d) => d.id)).toEqual(["b", "c"]);
    expect(qualifiedByMonth([failing, passing, bare], ["2026-10"], on)[0].inbound).toBe(2);
  });

  it("a deal with no check results, or no result for that check, is left as the stage move decided", () => {
    const partial = deal({ id: "d", createdAt: "2026-10-08T10:00:00Z", checks: { project: false } });
    const on = withChecks({ buyer: true, serve: true, habitat: true, timing: true });
    expect(qualifiedInbound([bare, partial], on)).toHaveLength(2);
    expect(qualifiedInbound([partial], withChecks({ project: true }))).toHaveLength(0);
  });
});

describe("qualifiedTargetForMonth", () => {
  const ramp: KpiConfig = { ...cfg, targetQualifiedPerMonth: 12, qualifiedRamp: { fromMonth: "2026-11", fromValue: 8, toMonth: "2027-01" } };

  it("holds the start value until the ramp begins, climbs evenly, then holds the target", () => {
    expect(qualifiedTargetForMonth(ramp, "2026-09")).toBe(8);
    expect(qualifiedTargetForMonth(ramp, "2026-11")).toBe(8);
    expect(qualifiedTargetForMonth(ramp, "2026-12")).toBe(10);
    expect(qualifiedTargetForMonth(ramp, "2027-01")).toBe(12);
    expect(qualifiedTargetForMonth(ramp, "2027-08")).toBe(12);
  });

  it("rounds to whole opportunities and copes with a ramp of one month", () => {
    const quick = { ...ramp, qualifiedRamp: { fromMonth: "2026-12", fromValue: 7, toMonth: "2027-01" } };
    expect(qualifiedTargetForMonth(quick, "2026-12")).toBe(7);
    expect(qualifiedTargetForMonth(quick, "2027-01")).toBe(12);
    const thirds = { ...ramp, qualifiedRamp: { fromMonth: "2026-10", fromValue: 8, toMonth: "2027-01" } };
    expect(qualifiedTargetForMonth(thirds, "2026-11")).toBe(9);
    expect(qualifiedTargetForMonth(thirds, "2026-12")).toBe(11);
  });

  it("never ramps downwards or past the end month, whatever the config says", () => {
    const backwards = { ...ramp, qualifiedRamp: { fromMonth: "2027-03", fromValue: 8, toMonth: "2027-01" } };
    expect(qualifiedTargetForMonth(backwards, "2027-02")).toBe(12);
  });
});

describe("inboundSourceGroups", () => {
  it("names the inbound channels by the shared channel names, Website split into the groups it becomes", () => {
    expect(inboundSourceGroups(cfg)).toEqual(["Paid search", "Organic search", "LinkedIn ads", "LinkedIn posts", "Newsletter", "Referral", "Events", "Website (source not tracked)", "Info email inbox", "Marketplace", "Direct/unknown"]);
    expect(inboundSourceGroups({ ...cfg, inboundChannels: ["Linkedin"] })).toEqual(["LinkedIn posts"]);
  });
});
