// @vitest-environment node
import { describe, expect, it } from "vitest";

import { clientKey } from "@/auth/limiter";

describe("clientKey", () => {
  it("counts under the last forwarded address, the one the proxy in front of us wrote", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientKey(new Headers({ "x-forwarded-for": "198.51.100.7, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientKey(new Headers({ "x-forwarded-for": " 198.51.100.7 ,203.0.113.9 " }))).toBe("203.0.113.9");
  });

  it("does not let a client-supplied prefix pick the key", () => {
    // a client padding the header gets its padding pushed to the front by the proxy
    expect(clientKey(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("falls back to one shared key without a usable header", () => {
    expect(clientKey(new Headers())).toBe("unknown");
    expect(clientKey(new Headers({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(clientKey(new Headers({ "x-forwarded-for": "x".repeat(65) }))).toBe("unknown");
  });
});
