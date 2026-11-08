import { describe, expect, it } from "vitest";

import { GET } from "@/app/healthz/route";

describe("GET /healthz", () => {
  it("answers 200 with a small JSON body and no caching, without touching the feed", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });
});
