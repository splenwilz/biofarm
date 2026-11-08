import type { Channel, Pipeline } from "@/lib/types";

/** The five draft checks a developer enquiry must pass once they are agreed. */
export type QualificationCheckId = "buyer" | "project" | "serve" | "habitat" | "timing";

export const QUALIFICATION_CHECKS: readonly { id: QualificationCheckId; label: string }[] = [
  { id: "buyer", label: "It's a buyer: a developer or their consultant" },
  { id: "project", label: "It's a real project: a site, with planning in progress or granted" },
  { id: "serve", label: "We can serve it: a bank in the same or a neighbouring council area" },
  { id: "habitat", label: "Right habitat type" },
  { id: "timing", label: "Realistic timing: units needed within 12 to 18 months" },
];

/**
 * The one place the KPI definition lives. Everything on the dashboard reads
 * from here, so changing what counts as a qualified inbound opportunity is an
 * edit to this file, not to the components.
 *
 * Proposed rule (to be confirmed with Phil and Vix, see the plan): a deal in
 * the Developer or Landowner pipeline whose Source channel is one of the
 * inbound channels, counted in the month it qualified. The same split applies
 * to enquiries. Channels in `networkChannels` are Biofarm reaching out or
 * being introduced (outbound / network): shown alongside for context, not
 * marketing's number. Agreed with Godswill on 8 Nov 2026; Sales may move a
 * channel between the two lists after Monday's meeting, and this is the one
 * place to do it.
 */
export interface KpiConfig {
  /** Qualified inbound opportunities a month once the ramp has finished: the 2027 figure. */
  targetQualifiedPerMonth: number;
  /**
   * The monthly target climbs evenly from `fromValue` in `fromMonth` to
   * `targetQualifiedPerMonth` in `toMonth`, then holds. Phil's numbers can
   * replace the start when he has them.
   */
  qualifiedRamp: { fromMonth: string; fromValue: number; toMonth: string };
  /**
   * Which of the draft checks are applied. All off until the checks are agreed,
   * so today a stage move alone counts; switching one on drops every deal that
   * failed it from every page.
   */
  qualificationChecks: Readonly<Record<QualificationCheckId, boolean>>;
  pipelines: readonly Pipeline[];
  inboundChannels: readonly Channel[];
  networkChannels: readonly Channel[];
  /** Days after an enquiry at which the cohort view reports "qualified by". */
  cohortHorizonsDays: readonly number[];
  /** A cohort younger than this is shown but marked immature. */
  cohortMaturityDays: number;
  trailingMonths: number;
  /** Search Console brand-query impressions a month: 90, against 61 when the plan was written. */
  brandSearchTargetPerMonth: number;
  /** Share of sampled prompts whose answer names Biofarm (13% today, per the plan). */
  aiMentionShareTarget: number;
  /** Any qualified share (source rows, cohort cells) needs this many enquiries before it is shown; a dash below it. */
  qualifiedShareMinEnquiries: number;
  /** A source needs this many enquiries in the period before its conversion rate is compared. */
  bestConvertingMinEnquiries: number;
  /** A campaign needs this many qualified enquiries in the period before it can be named best value. */
  bestValueMinQualified: number;
  /** A landing page needs this many enquiries in the period before its conversion rate is shown. */
  pageConversionMinEnquiries: number;
  /** A traffic channel needs this many sessions in the month before its change on last month is shown. */
  channelChangeMinSessions: number;
  /** A platform needs this many qualified opportunities in the period before its cost per qualified is shown. */
  platformCpqoMinQualified: number;
  /** Set true once Pipedrive has a qualification-status field on deals; it switches on the 14-day alert. */
  qualificationStatusInPipedrive: boolean;
  /** Days after a deal is created by which it should carry a qualification status. */
  qualificationStatusDays: number;
}

export const kpiConfig: KpiConfig = {
  targetQualifiedPerMonth: 12,
  qualifiedRamp: { fromMonth: "2026-11", fromValue: 8, toMonth: "2027-01" },
  qualificationChecks: { buyer: false, project: false, serve: false, habitat: false, timing: false },
  pipelines: ["developer", "landowner"],
  inboundChannels: ["Website", "Info email inbox", "Linkedin", "Trade Show / Event", "Marketplace"],
  networkChannels: ["Campaigns / Outreach", "Existing Network", "Introducer"],
  cohortHorizonsDays: [30, 90, 150],
  cohortMaturityDays: 150,
  trailingMonths: 3,
  brandSearchTargetPerMonth: 90,
  aiMentionShareTarget: 0.25,
  qualifiedShareMinEnquiries: 5,
  bestConvertingMinEnquiries: 5,
  bestValueMinQualified: 3,
  pageConversionMinEnquiries: 5,
  channelChangeMinSessions: 50,
  platformCpqoMinQualified: 3,
  qualificationStatusInPipedrive: false,
  qualificationStatusDays: 14,
};
