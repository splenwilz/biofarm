// @vitest-environment node
import { describe, expect, it } from "vitest";

import { AttemptLimiter } from "@/auth/rateLimit";

const T0 = Date.parse("2026-11-23T10:00:00Z");
const MIN = 60_000;

describe("AttemptLimiter", () => {
  it("lets a key through until it has reserved the allowed number of attempts in the window", () => {
    const limiter = new AttemptLimiter({ perKey: 3, global: 100, windowMs: 15 * MIN });
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check("1.2.3.4", T0 + i)).toEqual({ allowed: true });
      limiter.reserve("1.2.3.4", T0 + i);
    }
    expect(limiter.check("1.2.3.4", T0 + 5)).toEqual({ allowed: false, retryAfterMs: 15 * MIN - 5 });
  });

  it("counts the attempt when it is reserved, before any slow work, so parallel attempts cannot all slip through", () => {
    const limiter = new AttemptLimiter({ perKey: 2, global: 100, windowMs: MIN });
    // Twenty requests arrive together: each checks and reserves before awaiting the hash.
    const outcomes = Array.from({ length: 20 }, () => {
      const c = limiter.check("a", T0);
      if (c.allowed) limiter.reserve("a", T0);
      return c.allowed;
    });
    expect(outcomes.filter(Boolean)).toHaveLength(2);
  });

  it("keeps keys apart", () => {
    const limiter = new AttemptLimiter({ perKey: 1, global: 100, windowMs: MIN });
    limiter.reserve("a", T0);
    expect(limiter.check("a", T0)).toMatchObject({ allowed: false });
    expect(limiter.check("b", T0)).toEqual({ allowed: true });
  });

  it("forgets attempts once the window has passed", () => {
    const limiter = new AttemptLimiter({ perKey: 1, global: 100, windowMs: MIN });
    limiter.reserve("a", T0);
    expect(limiter.check("a", T0 + MIN - 1)).toMatchObject({ allowed: false });
    expect(limiter.check("a", T0 + MIN)).toEqual({ allowed: true });
  });

  it("forgives a key on success, in its own count and in the shared one, so the right password after a typo costs nothing", () => {
    const limiter = new AttemptLimiter({ perKey: 2, global: 3, windowMs: MIN });
    limiter.reserve("a", T0);
    limiter.reserve("a", T0);
    expect(limiter.check("a", T0)).toMatchObject({ allowed: false });
    limiter.forgive("a");
    expect(limiter.check("a", T0)).toEqual({ allowed: true });
    limiter.reserve("b", T0);
    limiter.reserve("c", T0);
    expect(limiter.check("d", T0)).toEqual({ allowed: true }); // a's two were removed from the shared count too
    limiter.reserve("d", T0);
    expect(limiter.check("e", T0)).toMatchObject({ allowed: false });
  });

  it("also caps attempts across every key, so a forged client address cannot sidestep the limit", () => {
    const limiter = new AttemptLimiter({ perKey: 5, global: 4, windowMs: MIN });
    for (let i = 0; i < 4; i += 1) limiter.reserve(`spoof-${i}`, T0);
    expect(limiter.check("fresh", T0 + 10)).toEqual({ allowed: false, retryAfterMs: MIN - 10 });
    expect(limiter.check("fresh", T0 + MIN)).toEqual({ allowed: true });
  });

  it("clear forgets every key and the shared count", () => {
    const limiter = new AttemptLimiter({ perKey: 1, global: 1, windowMs: MIN });
    limiter.reserve("a", T0);
    limiter.clear();
    expect(limiter.size).toBe(0);
    expect(limiter.check("b", T0)).toEqual({ allowed: true });
  });

  it("drops stale entries so the map cannot grow without bound", () => {
    const limiter = new AttemptLimiter({ perKey: 1, global: 1000, windowMs: MIN });
    for (let i = 0; i < 500; i += 1) limiter.reserve(`k${i}`, T0);
    expect(limiter.size).toBe(500);
    limiter.check("anything", T0 + MIN + 1);
    expect(limiter.size).toBe(0);
  });
});
