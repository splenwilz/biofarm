import type { TrafficChannel } from "@/lib/types";

/**
 * The one list of channel names. Every page shows a channel by one of these, so a thing has
 * one name everywhere: the Sources page groups enquiries by them and the Traffic page maps
 * GA4's channel grouping onto them. Rename here and every page follows.
 */
export const CHANNEL_NAMES = {
  paidSearch: "Paid search",
  organicSearch: "Organic search",
  linkedinAds: "LinkedIn ads",
  linkedinPosts: "LinkedIn posts",
  newsletter: "Newsletter",
  referral: "Referral",
  events: "Events",
  /** Website leads whose visit carried no source or medium (the lead API's "direct", Pipedrive web forms, leads typed in by the team). */
  websiteUntracked: "Website (source not tracked)",
  infoInbox: "Info email inbox",
  marketplace: "Marketplace",
  /** Only records with no channel at all; anything with a known channel has its own group. */
  direct: "Direct/unknown",
  aiSearch: "AI search",
} as const;

export type ChannelName = (typeof CHANNEL_NAMES)[keyof typeof CHANNEL_NAMES];

/** GA4 default channel grouping (plus the AI assistant split) → the shared name. */
export const TRAFFIC_CHANNEL_NAMES: Record<TrafficChannel, ChannelName> = {
  "Paid search": CHANNEL_NAMES.paidSearch,
  "Organic search": CHANNEL_NAMES.organicSearch,
  "Paid social": CHANNEL_NAMES.linkedinAds,
  "Organic social": CHANNEL_NAMES.linkedinPosts,
  Email: CHANNEL_NAMES.newsletter,
  "AI assistant": CHANNEL_NAMES.aiSearch,
  Direct: CHANNEL_NAMES.direct,
  Referral: CHANNEL_NAMES.referral,
};

export function channelName(channel: TrafficChannel): ChannelName {
  return TRAFFIC_CHANNEL_NAMES[channel];
}
