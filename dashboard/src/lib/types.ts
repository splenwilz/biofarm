import type { QualificationCheckId } from "@/config/kpi";
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
   * ISO date-time the deal counted as qualified: creation for the Developer
   * Pipeline (its first stage is "OPPORTUNITY (Qualified)"), the move past
   * "CALL / QUALIFY" for the Landowner Pipeline. Null while unqualified.
   */
  qualifiedAt: string | null;
  status: DealStatus;
  /** "source/medium" carried from the website lead (Pipedrive channel_id), if any. */
  sourceLabel: string | null;
  /** UTM campaign carried from the website lead, if any. */
  campaign: string | null;
  /** Pipedrive person id, the join key to enquiries. */
  personId: number | null;
  /** Pipedrive qualification status, once the field exists there; absent or null means none recorded. */
  qualificationStatus?: string | null;
  /**
   * The draft checks' results for this deal, once Pipedrive records them; a
   * missing check is treated as not yet assessed, so it does not count against
   * the deal. Absent on landowner deals, which will have their own checklist.
   */
  checks?: Partial<Record<QualificationCheckId, boolean>>;
}

export type EnquiryForm = "contact" | "newsletter" | "cpd" | "fold";
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
}

export interface AiReferral {
  month: string;
  assistant: AiAssistant;
  sessions: number;
}

export type TrafficChannel = "Organic search" | "Paid search" | "Direct" | "Referral" | "Organic social" | "Paid social" | "Email" | "AI assistant";

export interface TrafficMonth {
  month: string;
  channel: TrafficChannel;
  sessions: number;
}

export type EventType = "trade_show" | "cpd" | "webinar";

export interface MarketingEvent {
  id: string;
  name: string;
  date: string;
  type: EventType;
  attendees: number;
  /** Leads captured at or from the event. */
  leads: number;
  /** Of those, qualified opportunities so far. */
  qualified: number;
  /** What the event cost in total (stand, travel, fees), entered by hand after the event; null until it is. */
  costGbp?: number | null;
}

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
  events: MarketingEvent[];
  annotations: Annotation[];
  /** ISO date-time the data was last refreshed from its sources. */
  syncedAt: string;
  /** Where the data came from, shown on every number. */
  source: "demo" | "pipedrive";
}
