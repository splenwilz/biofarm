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
});
