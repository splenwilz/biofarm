/**
 * Deterministic demo data, shaped like the real Pipedrive account so the
 * screen built against it needs no changes when the backend arrives.
 *
 * Volumes follow what the 1 Nov 2026 inspection found: ~20 developer deals a
 * month of which 7–10 come through inbound channels, ~3 landowner deals, ~26
 * website enquiries, paid search on Google and Microsoft. Numbers are made
 * up; the proportions are not.
 */

import type { DataSource } from "@/data/source";
import { monthRange } from "@/lib/kpi";
import type { AiAssistant, AiReferral, Annotation, Audience, Channel, DashboardData, Deal, DealStatus, Enquiry, EnquiryForm, MarketingEvent, NewsletterIssue, SearchMonth, SignupMonth, SpendEntry, SubscriberMonth, TrafficChannel, TrafficMonth } from "@/lib/types";

export const DEMO_TODAY = "2026-11-01T06:00:00Z";
export const DEMO_LAST_MONTH = "2026-10";
/** Two years, so year-on-year figures exist for every selectable month. */
export const DEMO_MONTHS = 24;

// mulberry32: small, seedable, good enough for stable sample data
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Weighted<T> = readonly (readonly [T, number])[];

function pick<T>(random: () => number, table: Weighted<T>): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = random() * total;
  for (const [value, weight] of table) {
    r -= weight;
    if (r <= 0) return value;
  }
  return table[table.length - 1][0];
}

function between(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function isoDay(month: string, day: number, hour: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, hour, 0, 0)).toISOString();
}

function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString();
}

const DEAL_CHANNELS: Weighted<Channel> = [
  ["Existing Network", 44],
  ["Website", 17],
  ["Info email inbox", 12],
  ["Introducer", 11],
  ["Campaigns / Outreach", 8],
  ["Trade Show / Event", 3],
  ["Linkedin", 2],
  ["Marketplace", 3],
];

const ENQUIRY_SOURCES: Weighted<string> = [
  ["google/cpc", 20],
  ["bing/cpc", 14],
  ["direct", 18],
  ["google.com/referral", 15],
  ["bing.com/referral", 3],
  ["newsletter/email", 8],
  ["linkedin.com/referral", 5],
  ["linkedin/paid-social", 2],
  ["chatgpt.com/referral", 4],
  ["perplexity.ai/referral", 2],
  ["t.co/referral", 3],
  ["facebook/social", 2],
  ["planningportal.co.uk/referral", 4],
];

const LANDING_PAGES: Weighted<string> = [
  ["/", 22],
  ["/developers", 24],
  ["/landowners", 18],
  ["/habitat-bank", 12],
  ["/biodiversity-net-gain", 10],
  ["/cpd", 6],
  ["/fold", 4],
  ["/contact", 4],
];

/** UTM campaign for a source label: the agency's search campaigns, the LinkedIn campaign, the newsletter issue. */
function campaignFor(random: () => number, sourceLabel: string, month: string): string | null {
  if (sourceLabel === "google/cpc" || sourceLabel === "bing/cpc") return random() < 0.8 ? "AWD - MOF - Search - Biofarm" : "AWD - Brand - Search";
  if (sourceLabel === "linkedin/paid-social") return "Developers - BNG units";
  if (sourceLabel === "newsletter/email") return `newsletter-${month}`;
  return null;
}

const TRAFFIC_RANGES: readonly (readonly [TrafficChannel, number, number])[] = [
  ["Organic search", 900, 1300],
  ["Paid search", 400, 700],
  ["Direct", 300, 500],
  ["Referral", 150, 260],
  ["Organic social", 80, 150],
  ["Email", 60, 120],
];

const AUDIENCES: Weighted<Audience> = [
  ["developer", 55],
  ["landowner", 35],
  ["other", 10],
];

const STATUSES: Weighted<DealStatus> = [
  ["open", 70],
  ["lost", 26],
  ["won", 4],
];

const SUBJECTS: Record<string, string> = {
  "2025-11": "Winter planting and the first Habitat Bank units",
  "2025-12": "A year of BNG: what changed and what comes next",
  "2026-01": "Statutory credits, metric 4.0 and your 2026 plans",
  "2026-02": "Slades Farm: a habitat bank takes shape",
  "2026-03": "One deal, one partner: Wren x Biofarm",
  "2026-04": "Spring survey season and the 30-year question",
  "2026-05": "Small sites, big consequences: the BNG exemption review",
  "2026-06": "Fold site visit and the landowner CPD afternoon",
  "2026-07": "Mid-year: units delivered, units reserved",
  "2026-08": "NSIP biodiversity gain: what developers should know",
  "2026-09": "Padel, policy and progress on the ground",
  "2026-10": "Slades at Sleight, 70 hectares and the NSIP story",
};

const ASSISTANTS: Weighted<AiAssistant> = [
  ["ChatGPT", 55],
  ["Perplexity", 20],
  ["Claude", 10],
  ["Gemini", 10],
  ["Copilot", 5],
];

/** 933 subscribed persons on 1 Nov 2026 (the real count); walk back from there. */
const SUBSCRIBERS_NOW = 933;

function buildNewsletter(random: () => number, months: string[]): DashboardData["newsletter"] {
  const movements = months.map(() => ({ added: between(random, 10, 26), removed: between(random, 2, 7) }));
  const subscribers: SubscriberMonth[] = [];
  let level = SUBSCRIBERS_NOW;
  for (let i = months.length - 1; i >= 0; i -= 1) {
    subscribers.unshift({ month: months[i], subscribers: level, ...movements[i] });
    level -= movements[i].added - movements[i].removed;
  }
  const issues: NewsletterIssue[] = months.map((month, i) => {
    const recipients = subscribers[i].subscribers - between(random, 0, 6);
    const opens = Math.round(recipients * (0.34 + random() * 0.12));
    const clicks = Math.round(opens * (0.08 + random() * 0.1));
    return {
      id: `issue-${month}`,
      sentAt: isoDay(month, between(random, 14, 24), 9),
      subject: SUBJECTS[month] ?? `Biofarm update, ${month}`,
      recipients,
      opens,
      clicks,
      unsubscribes: between(random, 0, 4),
    };
  });
  return { issues, subscribers, signups: [] };
}

/** Brand searches rising towards 61 a month, AI referrals from a handful to a dozen, mention share sampled since July. */
function buildSearch(random: () => number, months: string[]): DashboardData["search"] {
  const rows: SearchMonth[] = [];
  const aiReferrals: AiReferral[] = [];
  months.forEach((month, i) => {
    const brandImpressions = Math.round(38 + (23 * i) / (months.length - 1) + (random() - 0.5) * 10);
    const aiSessions = Math.round(3 + (11 * i) / (months.length - 1) + (random() - 0.5) * 3);
    const aiMentionShare = month >= "2026-07" ? Math.round((0.08 + (0.05 * (i - 8)) / 3 + (random() - 0.5) * 0.02) * 100) / 100 : null;
    rows.push({ month, brandImpressions, brandClicks: Math.round(brandImpressions * (0.3 + random() * 0.1)), aiSessions, aiMentionShare });
    const counts = new Map<AiAssistant, number>();
    for (let n = 0; n < aiSessions; n += 1) {
      const a = pick(random, ASSISTANTS);
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    for (const [assistant, sessions] of counts) aiReferrals.push({ month, assistant, sessions });
  });
  return { months: rows, aiReferrals };
}

function buildTraffic(random: () => number, months: string[], search: DashboardData["search"]): TrafficMonth[] {
  const rows: TrafficMonth[] = [];
  months.forEach((month, i) => {
    for (const [channel, lo, hi] of TRAFFIC_RANGES) {
      const growth = 1 + (0.25 * i) / (months.length - 1);
      rows.push({ month, channel, sessions: Math.round(between(random, lo, hi) * growth) });
    }
    rows.push({ month, channel: "Paid social", sessions: month >= "2026-10" ? between(random, 120, 220) : between(random, 0, 25) });
    rows.push({ month, channel: "AI assistant", sessions: search.months.find((m) => m.month === month)?.aiSessions ?? 0 });
  });
  return rows;
}

// date, name, type, cost entered by hand (null where nobody has entered one yet)
const EVENT_SEEDS: readonly (readonly [string, string, MarketingEvent["type"], number | null])[] = [
  ["2025-03-05", "Futurebuild 2025, ExCeL London", "trade_show", 4500],
  ["2025-06-18", "BNG CPD afternoon, Taunton", "cpd", 350],
  ["2025-09-24", "Landowner breakfast, Shepton Mallet", "cpd", null],
  ["2025-11-12", "Webinar: statutory credits and the metric", "webinar", null],
  ["2026-03-04", "Futurebuild 2026, ExCeL London", "trade_show", 4800],
  ["2026-05-20", "UKREiiF 2026, Leeds", "trade_show", 3200],
  ["2026-06-17", "BNG CPD afternoon, Taunton", "cpd", 350],
  ["2026-08-19", "Webinar: NSIP biodiversity gain", "webinar", null],
  ["2026-09-23", "Landowner breakfast, Shepton Mallet", "cpd", 380],
];

function buildEvents(random: () => number): MarketingEvent[] {
  return EVENT_SEEDS.map(([date, name, type, costGbp], i) => {
    const attendees = type === "trade_show" ? between(random, 60, 140) : type === "cpd" ? between(random, 18, 40) : between(random, 40, 90);
    const leads = Math.round(attendees * (type === "trade_show" ? 0.18 : type === "cpd" ? 0.35 : 0.12));
    const qualified = date <= "2026-08" ? Math.round(leads * (0.15 + random() * 0.2)) : Math.round(leads * random() * 0.1);
    return { id: `event-${i + 1}`, name, date: `${date}T09:00:00.000Z`, type, attendees, leads, qualified, costGbp };
  });
}

const ANNOTATIONS: Annotation[] = [
  { id: "note-1", month: "2026-04", text: "Agency search campaigns restructured" },
  { id: "note-2", month: "2026-10", text: "LinkedIn campaign started" },
];

export function buildDemoData(seed = 2026): DashboardData {
  const random = rng(seed);
  const months = monthRange(DEMO_LAST_MONTH, DEMO_MONTHS);
  const deals: Deal[] = [];
  const enquiries: Enquiry[] = [];
  const spend: SpendEntry[] = [];
  let personId = 5000;
  let dealN = 0;
  let enquiryN = 0;
  const teamRandom = rng(seed + 2);
  let teamN = 0;
  const signupCounts = new Map<string, number>();

  for (const month of months) {
    const [, m] = month.split("-").map(Number);
    const monthDays = new Date(Date.UTC(Number(month.slice(0, 4)), m, 0)).getUTCDate();

    // the team's own Pipedrive records: outbound / network leads, event and inbox contacts, a few with no channel set
    // (their own stream, so the website numbers below stay the same as before they were added)
    const teamCount = between(teamRandom, 8, 16);
    for (let i = 0; i < teamCount; i += 1) {
      const createdAt = isoDay(month, between(teamRandom, 1, monthDays), between(teamRandom, 8, 18));
      const roll = teamRandom();
      const channel: Channel | null = roll < 0.55 ? "Campaigns / Outreach" : roll < 0.7 ? "Existing Network" : roll < 0.78 ? "Introducer" : roll < 0.88 ? "Trade Show / Event" : roll < 0.94 ? "Info email inbox" : null;
      enquiries.push({ id: `team-${(teamN += 1)}`, createdAt, kind: "lead", form: null, audience: pick(teamRandom, AUDIENCES), channel, sourceLabel: null, campaign: null, landingPage: null, firstContactAt: teamRandom() < 0.6 ? plusDays(createdAt, between(teamRandom, 4, 72) / 24) : null, personId: 90000 + teamN, archived: teamRandom() < 0.1, converted: false });
    }

    // website enquiries, some of which become website-channel deals
    const enquiryCount = between(random, 20, 32);
    for (let i = 0; i < enquiryCount; i += 1) {
      const createdAt = isoDay(month, between(random, 1, monthDays), between(random, 7, 19));
      const audience = pick(random, AUDIENCES);
      // a fifth of form submissions are newsletter sign-ups: counted on the Newsletter page, not as enquiries
      const form: EnquiryForm =
        month >= "2026-10" && random() < 0.15 ? (random() < 0.5 ? "cpd" : "fold") : random() < 0.2 ? "newsletter" : "contact";
      const sourceLabel = pick(random, ENQUIRY_SOURCES);
      const pid = (personId += 1);
      const campaign = campaignFor(random, sourceLabel, month);
      const landingPage = form === "cpd" ? "/cpd" : form === "fold" ? "/fold" : pick(random, LANDING_PAGES);
      const contactRoll = random();
      const firstContactAt =
        form === "newsletter" ? null : contactRoll < 0.7 ? plusDays(createdAt, between(random, 2, 30) / 24) : contactRoll < 0.95 ? plusDays(createdAt, between(random, 30, 96) / 24) : null;
      if (form === "newsletter") {
        signupCounts.set(month, (signupCounts.get(month) ?? 0) + 1);
        continue;
      }
      enquiries.push({ id: `enq-${(enquiryN += 1)}`, createdAt, kind: "lead", form, audience, channel: "Website", sourceLabel, campaign, landingPage, firstContactAt, personId: pid, archived: false, converted: false });

      // conversion to a qualified deal: developers more often, paid search more often
      const base = audience === "developer" ? 0.3 : audience === "landowner" ? 0.12 : 0.02;
      const lift = sourceLabel.endsWith("/cpc") ? 1.3 : 1;
      if (random() < base * lift) {
        const lag = between(random, 2, 75);
        const qualifiedAt = plusDays(createdAt, lag);
        if (qualifiedAt <= DEMO_TODAY) {
          const pipeline = audience === "landowner" ? "landowner" : "developer";
          deals.push({
            id: `deal-${(dealN += 1)}`,
            pipeline,
            channel: "Website",
            createdAt: pipeline === "developer" ? qualifiedAt : plusDays(qualifiedAt, -between(random, 3, 20)),
            qualifiedAt,
            status: pick(random, STATUSES),
            sourceLabel,
            campaign,
            personId: pid,
          });
        }
      }
    }

    // the rest of the developer pipeline: deals Sales creates themselves
    const developerDeals = between(random, 12, 20);
    for (let i = 0; i < developerDeals; i += 1) {
      const createdAt = isoDay(month, between(random, 1, monthDays), between(random, 8, 18));
      const channel = pick(random, DEAL_CHANNELS);
      deals.push({
        id: `deal-${(dealN += 1)}`,
        pipeline: "developer",
        channel: random() < 0.04 ? null : channel,
        createdAt,
        qualifiedAt: createdAt,
        status: pick(random, STATUSES),
        sourceLabel: channel === "Website" ? pick(random, ENQUIRY_SOURCES) : null,
        campaign: null,
        personId: (personId += 1),
      });
    }

    // landowner pipeline: created at CALL / QUALIFY, some move on
    const landownerDeals = between(random, 1, 4);
    for (let i = 0; i < landownerDeals; i += 1) {
      const createdAt = isoDay(month, between(random, 1, monthDays), 10);
      const qualified = random() < 0.6 ? plusDays(createdAt, between(random, 4, 28)) : null;
      deals.push({
        id: `deal-${(dealN += 1)}`,
        pipeline: "landowner",
        channel: pick(random, [
          ["Introducer", 40],
          ["Existing Network", 30],
          ["Website", 15],
          ["Trade Show / Event", 15],
        ] as const),
        createdAt,
        qualifiedAt: qualified && qualified <= DEMO_TODAY ? qualified : null,
        status: "open",
        sourceLabel: null,
        campaign: null,
        personId: (personId += 1),
      });
    }

    // media spend
    spend.push(
      { id: `sp-${month}-g`, month, platform: "google_ads", campaign: "AWD - MOF - Search - Biofarm", amountGbp: between(random, 1400, 2200) },
      { id: `sp-${month}-m`, month, platform: "microsoft_ads", campaign: "AWD - MOF - Search - Biofarm", amountGbp: between(random, 300, 600) },
      { id: `sp-${month}-b`, month, platform: "google_ads", campaign: "AWD - Brand - Search", amountGbp: between(random, 120, 260) },
    );
    if (month >= "2026-10") {
      spend.push({ id: `sp-${month}-l`, month, platform: "linkedin_ads", campaign: "Developers - BNG units", amountGbp: 500 });
    }
  }

  deals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // the draft checks' results, from their own stream so the numbers above stay as they were
  const checkRandom = rng(seed + 1);
  for (const d of deals) {
    if (d.pipeline !== "developer") continue;
    d.checks = { buyer: checkRandom() < 0.95, project: checkRandom() < 0.9, serve: checkRandom() < 0.85, habitat: checkRandom() < 0.92, timing: checkRandom() < 0.8 };
  }
  enquiries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const search = buildSearch(random, months);
  return {
    deals,
    enquiries,
    spend,
    newsletter: { ...buildNewsletter(random, months), signups: months.map((month): SignupMonth => ({ month, count: signupCounts.get(month) ?? 0 })) },
    search,
    traffic: buildTraffic(random, months, search),
    events: buildEvents(random),
    annotations: ANNOTATIONS,
    syncedAt: DEMO_TODAY,
    source: "demo",
  };
}

export const demoDataSource: DataSource = {
  async getDashboardData() {
    return buildDemoData();
  },
};
