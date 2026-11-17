import { describe, expect, it } from "vitest";

import { pipedriveDealUrl } from "@/lib/pipedrive";

describe("pipedriveDealUrl", () => {
  it("opens the deal on the company's Pipedrive domain", () => {
    expect(pipedriveDealUrl("1234", "biofarm")).toBe("https://biofarm.pipedrive.com/deal/1234");
  });

  it("falls back to app.pipedrive.com, which sends a signed-in user to their own company", () => {
    expect(pipedriveDealUrl("1234")).toBe("https://app.pipedrive.com/deal/1234");
  });

  it("keeps only the number from a prefixed id such as the demo's", () => {
    expect(pipedriveDealUrl("deal-57", "biofarm")).toBe("https://biofarm.pipedrive.com/deal/57");
  });
  it("sends a lead id (a uuid: a lead Sales ticked before converting it) to the leads inbox, not to a nonsense deal number", () => {
    expect(pipedriveDealUrl("f5b1be40-df45-11f1-a57a-2d6d1f97051a", "biofarm")).toBe("https://biofarm.pipedrive.com/leads/inbox/f5b1be40-df45-11f1-a57a-2d6d1f97051a");
  });
});
