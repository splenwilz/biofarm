import type { ChannelName } from "@/lib/channelNames";

/**
 * Domain records the dashboard reads. They mirror what the backend will
 * derive from Pipedrive and the enquiry API, so swapping the demo data source
 * for the real one changes no component.
 */

export type Pipeline = "developer" | "landowner";

/** Pipedrive "Source channel" options as configured on the Biofarm account. */
export type Channel =
  | "Website"
  | "Info email inbox"
  | "Campaigns / Outreach"
  | "Linkedin"
  | "Trade Show / Event"
  | "Introducer"
  | "Existing Network"
  | "Marketplace";

export type DealStatus = "open" | "won" | "lost";

export interface Deal {
  id: string;
  pipeline: Pipeline;
  channel: Channel | null;
  /** ISO date-time the deal was created in Pipedrive. */
  createdAt: string;
  /**
   * ISO date-time the record counted as qualified. Until 17 Nov 2026: creation
   * for the Developer Pipeline (its first stage is "OPPORTUNITY (Qualified)"),
   * the move past "CALL / QUALIFY" for the Landowner Pipeline. From then: when
   * Sales ticked "Qualified Lead?" YES, or when the record came in if the tick
   * was there from the start. Null while unqualified.
   */
  qualifiedAt: string | null;
  status: DealStatus;
  /** "source/medium" carried from the website lead (Pipedrive channel_id), if any. */
  sourceLabel: string | null;
  /** UTM campaign carried from the website lead, if any. */
  campaign: string | null;
  /** Pipedrive person id, the join key to enquiries. */
  personId: number | null;
  /**
   * The "Qualified Lead?" option Sales set in Pipedrive (YES / NO); absent or
   * null means none recorded, or a deal from before the field existed. A lead
   * ticked YES before conversion is a record here under its lead id.
   */
  qualificationStatus?: string | null;
  /** Who and where, for the qualified-opportunities list. Absent on demo data and older feeds; null when the mirror cannot say. */
  title?: string | null;
  personName?: string | null;
  organisation?: string | null;
  /** The Pipedrive stage the deal sits in; null for a lead not yet converted. */
  stage?: string | null;
  /** How the record came in: a website form or our API, made by hand by the team, or a bulk import. */
  origin?: "website" | "team" | "import" | null;
  createdBy?: string | null;
  owner?: string | null;
  /** The lead this deal was converted from, which is the enquiry's id. */
  sourceLeadId?: string | null;
  /** Why it counts, in words, from the rule that applied. */
  qualifiedBy?: string | null;
}

export type EnquiryForm = "contact" | "newsletter" | "cpd" | "fold" | "landowner";
export type Audience = "developer" | "landowner" | "other";

/**
 * One enquiry: a Pipedrive lead, or a deal the team created directly (a converted
 * lead counts once, as the lead). The backend applies the agreed exclusions
 * (imported deals, tests, staff, newsletter sign-ups); the dashboard splits
 * inbound from outbound on `channel` with the KPI config.
 */
export interface Enquiry {
  id: string;
  createdAt: string;
  kind: "lead" | "deal";
  /** The website form, when the record came through the site; null for the team's own records. */
  form: EnquiryForm | null;
  audience: Audience;
  /** Pipedrive's Source channel; null when nobody set one. */
  channel: Channel | null;
  /** "source/medium" from our own website record, when one matched; null otherwise. */
  sourceLabel: string | null;
  /** UTM campaign, if the visit carried one. */
  campaign: string | null;
  /** Path of the page the enquiry was made on; null when it did not come through the website. */
  landingPage: string | null;
  /** First done call, email or meeting logged against the person after the enquiry; null if none yet. */
  firstContactAt: string | null;
  personId: number | null;
  /** A lead the team closed without converting; still an enquiry. */
  archived: boolean;
  /** A deal converted from a lead Pipedrive has since deleted: it came in as a lead, so it is not one the team created directly. */
  converted: boolean;
}

export type SpendPlatform = "google_ads" | "microsoft_ads" | "linkedin_ads" | "other";

export interface SpendEntry {
  id: string;
  /** Calendar month, "YYYY-MM". */
  month: string;
  platform: SpendPlatform;
  campaign: string;
  amountGbp: number;
}

/** The eight reporting groups a source falls into; each holds the platforms inside it. */
/** The source groups on the Sources page: every shared channel name except AI search, which GA4 sees but enquiry forms do not. */
export type SourceGroup = Exclude<ChannelName, "AI search">;

export interface NewsletterIssue {
  id: string;
  sentAt: string;
  subject: string;
  recipients: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
}

/** Subscribed persons at month end, with the month's movement. */
export interface SubscriberMonth {
  month: string;
  subscribers: number;
  added: number;
  removed: number;
}

/** Newsletter sign-ups through the website in a month; they are not enquiries. */
export interface SignupMonth {
  month: string;
  count: number;
}

export type AiAssistant = "ChatGPT" | "Perplexity" | "Claude" | "Gemini" | "Copilot";

export interface SearchMonth {
  month: string;
  /** Search Console impressions for queries naming Biofarm. */
  brandImpressions: number;
  brandClicks: number;
  /** GA4 sessions referred by AI assistants. */
  aiSessions: number;
  /** Share of sampled prompts whose answer names Biofarm; null before sampling began. */
  aiMentionShare: number | null;
  /** Search Console totals for every query, and the non-brand remainder. Brand plus non-brand falls short of the total: filtered queries leave out the long tail Google keeps anonymous. Absent on demo data. */
  totalClicks?: number;
  totalImpressions?: number;
  nonBrandClicks?: number;
  nonBrandImpressions?: number;
}

export type ConversionKind = "enquiry" | "newsletter_signup" | "email_click";

/** GA4 key events by month: the website's own count of contact-form enquiries, newsletter sign-ups and email clicks. */
export interface ConversionMonth {
  month: string;
  event: ConversionKind;
  count: number;
}

export interface AiReferral {
  month: string;
  assistant: AiAssistant;
  sessions: number;
}

/**
 * GA4's default channel groups as the dashboard names them (the feed maps them in the API's
 * app/reporting/google.py). "Paid other" is Google's Cross-network (Performance Max, Demand Gen)
 * and Paid Video; "Other" is anything GA4 adds that has no row of its own yet.
 */
export type TrafficChannel = "Organic search" | "Paid search" | "Direct" | "Referral" | "Organic social" | "Paid social" | "Email" | "AI assistant" | "Display" | "Paid other" | "Other";

export interface TrafficMonth {
  month: string;
  channel: TrafficChannel;
  sessions: number;
}

export type EventType = "trade_show" | "cpd" | "webinar" | "open_day";

/**
 * How an event's enquiries are found in Pipedrive, which has no event object: any one
 * signal inside the window. Empty means the event has no Pipedrive trail and counts none.
 */
export interface EventMatch {
  /** Pipedrive lead label ids. */
  labels: string[];
  /** "Deal Source" option labels. */
  dealSources: string[];
  /** Whole words in the lead or deal title. */
  titleWords: string[];
  /** Every record on the Trade Show / Event channel in the window. */
  channel: boolean;
  /** ISO dates bounding when the records were logged. */
  windowFrom: string;
  windowTo: string;
}

export interface MarketingEvent {
  id: string;
  name: string;
  date: string;
  type: EventType;
  /** Entered by hand; null until someone has the number. */
  attendees: number | null;
  /** Enquiries Pipedrive holds for the event (matched by `match` on the feed; a typed number on demo data). */
  leads: number;
  /** Of those, qualified opportunities so far. */
  qualified: number;
  /** What the event cost in total (stand, travel, fees), entered by hand after the event; null until it is. */
  costGbp?: number | null;
  notes?: string | null;
  match?: EventMatch;
  /** On the feed: how many of `leads` each signal found ("label", "deal_source", "title", "channel"). */
  matchedBy?: Record<string, number>;
}

/** What the dialog saves: everything but the id and the counts Pipedrive supplies. */
export type EventInput = Omit<MarketingEvent, "id" | "leads" | "qualified" | "matchedBy">;

/** A note pinned to a month, shown on the trend chart so a change has its reason beside it. */
export interface Annotation {
  id: string;
  month: string;
  text: string;
}

export interface DashboardData {
  deals: Deal[];
  enquiries: Enquiry[];
  spend: SpendEntry[];
  newsletter: { issues: NewsletterIssue[]; subscribers: SubscriberMonth[]; signups: SignupMonth[] };
  search: { months: SearchMonth[]; aiReferrals: AiReferral[] };
  traffic: TrafficMonth[];
  /** GA4 key events; absent on demo data and on a feed with no GA4 pull yet. */
  conversions?: ConversionMonth[];
  events: MarketingEvent[];
  annotations: Annotation[];
  /** ISO date-time the data was last refreshed from its sources. */
  syncedAt: string;
  /** When the Google pull (Ads, GA4, Search Console) last wrote anything: null until it has run, absent on demo data. */
  googleSyncedAt?: string | null;
  /** Where the data came from, shown on every number. */
  source: "demo" | "pipedrive";
}
