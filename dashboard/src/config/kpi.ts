import type { Channel, Pipeline } from "@/lib/types";

/**
 * The one place the KPI definition lives. Everything on the dashboard reads
 * from here, so changing what counts as a qualified inbound opportunity is an
 * edit to this file, not to the components.
 *
 * The rule, agreed with Sales and Land on Monday 9 November 2026: a deal in
 * the Developer or Landowner pipeline whose Source channel is one of the
 * inbound channels, counted in the month it qualified. Until 17 November 2026
 * a developer deal qualified the day it was created and a landowner deal when
 * it moved past CALL / QUALIFY. From that day Sales tick "Qualified Lead?"
 * (YES / NO) on every lead and deal, and the tick decides, in either pipeline
 * and in the NSIP pipeline (developer work): a lead ticked before it becomes
 * a deal counts too, from the day it came in. A deal Sales later turns down
 * still counts. The feed applies all of this and sends each record's
 * `qualifiedAt`; this file holds the targets, the channels and the alert
 * switch. Conversion on the pages is simply qualified ÷ enquiries. The same inbound / network split
 * applies to enquiries. Channels in `networkChannels` are Biofarm reaching out
 * or being introduced (outbound / network): shown alongside for context, not
 * marketing's number.
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
  /** Any conversion (qualified ÷ enquiries on source, platform and landing-page rows, Best converting, cohort cells) needs this many enquiries before it is shown; a dash below it. */
  qualifiedShareMinEnquiries: number;
  /** A campaign needs this many qualified enquiries in the period before it can be named best value. */
  bestValueMinQualified: number;
  /** A traffic channel needs this many sessions in the month before its change on last month is shown. */
  channelChangeMinSessions: number;
  /** A platform needs this many qualified opportunities in the period before its cost per qualified is shown. */
  platformCpqoMinQualified: number;
  /** True since Pipedrive has the "Qualified Lead?" field on leads and deals; it switches on the 14-day alert. */
  qualificationStatusInPipedrive: boolean;
  /** The day the field appeared (ISO date): the alert checks deals created from then, nobody could have ticked an older one. */
  qualificationStatusFrom: string;
  /** Days after a deal is created by which it should carry a qualification status. */
  qualificationStatusDays: number;
}

export const kpiConfig: KpiConfig = {
  targetQualifiedPerMonth: 12,
  qualifiedRamp: { fromMonth: "2026-11", fromValue: 8, toMonth: "2027-01" },
  pipelines: ["developer", "landowner"],
  inboundChannels: ["Website", "Info email inbox", "Linkedin", "Trade Show / Event", "Marketplace"],
  networkChannels: ["Campaigns / Outreach", "Existing Network", "Introducer"],
  cohortHorizonsDays: [30, 90, 150],
  cohortMaturityDays: 150,
  trailingMonths: 3,
  brandSearchTargetPerMonth: 90,
  aiMentionShareTarget: 0.25,
  qualifiedShareMinEnquiries: 5,
  bestValueMinQualified: 3,
  channelChangeMinSessions: 50,
  platformCpqoMinQualified: 3,
  qualificationStatusInPipedrive: true,
  qualificationStatusFrom: "2026-11-17",
  qualificationStatusDays: 14,
};
