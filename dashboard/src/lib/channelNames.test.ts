import { describe, expect, it } from "vitest";

import { CHANNEL_NAMES, channelName, TRAFFIC_CHANNEL_NAMES } from "@/lib/channelNames";
import { SOURCE_GROUPS } from "@/lib/kpi";
import type { TrafficChannel } from "@/lib/types";

describe("channel names", () => {
  it("gives every GA4 traffic channel the name the Sources page uses", () => {
    const expected: Record<TrafficChannel, string> = {
      "Paid search": "Paid search",
      "Organic search": "Organic search",
      "Paid social": "LinkedIn ads",
      "Organic social": "LinkedIn posts",
      Email: "Newsletter",
      "AI assistant": "AI search",
      Direct: "Direct/unknown",
      Referral: "Referral",
    };
    for (const [channel, name] of Object.entries(expected)) expect(channelName(channel as TrafficChannel)).toBe(name);
    expect(Object.keys(TRAFFIC_CHANNEL_NAMES).sort()).toEqual(Object.keys(expected).sort());
  });

  it("is the one list the Sources page groups come from", () => {
    const names = new Set<string>(Object.values(CHANNEL_NAMES));
    for (const group of SOURCE_GROUPS) expect(names.has(group)).toBe(true);
    for (const name of Object.values(TRAFFIC_CHANNEL_NAMES)) expect(names.has(name)).toBe(true);
  });
});
