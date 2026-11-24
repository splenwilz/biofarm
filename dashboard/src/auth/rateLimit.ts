/**
 * Sign-in attempts, counted per client key (the forwarded address) and across
 * all keys. An attempt is reserved the moment it arrives, before the password
 * hash is computed, and forgiven if it succeeds: counting failures afterwards
 * would let a burst of parallel requests all pass the check while the first
 * hash is still running. The global cap is what actually holds: the dashboard
 * sits behind Render's proxy, and a forwarded-for header can be padded by the
 * client, so a per-address limit alone could be sidestepped. Counts live in
 * this process (one Render instance; a restart clears them), as the Next.js
 * backend guide notes for in-memory limiters.
 */
export interface LimiterOptions {
  /** Attempts one key may make inside the window before it must wait. */
  perKey: number;
  /** Attempts all keys together may make inside the window. */
  global: number;
  windowMs: number;
}

export type LimitCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

interface Attempt {
  key: string;
  at: number;
}

export class AttemptLimiter {
  private readonly byKey = new Map<string, number[]>();
  private all: Attempt[] = [];

  constructor(private readonly options: LimiterOptions) {}

  /** Keys currently remembered (for tests). */
  get size(): number {
    return this.byKey.size;
  }

  /** Synchronous: call it and `reserve` in the same tick, before any await. */
  check(key: string, now = Date.now()): LimitCheck {
    this.prune(now);
    const mine = this.byKey.get(key) ?? [];
    const blockedBy = mine.length >= this.options.perKey ? mine : this.all.length >= this.options.global ? this.all.map((a) => a.at) : null;
    if (!blockedBy) return { allowed: true };
    // The oldest attempt in the window is the one that expires first.
    return { allowed: false, retryAfterMs: Math.max(1, blockedBy[0]! + this.options.windowMs - now) };
  }

  /** Count an attempt now, whatever its outcome turns out to be. */
  reserve(key: string, now = Date.now()): void {
    this.prune(now);
    const mine = this.byKey.get(key) ?? [];
    mine.push(now);
    this.byKey.set(key, mine);
    this.all.push({ key, at: now });
  }

  /** The key signed in: its attempts were not abuse, so they stop counting everywhere. */
  forgive(key: string): void {
    this.byKey.delete(key);
    this.all = this.all.filter((a) => a.key !== key);
  }

  /** Forget everything (tests, and a deliberate operator reset). */
  clear(): void {
    this.byKey.clear();
    this.all = [];
  }

  private prune(now: number): void {
    const cutoff = now - this.options.windowMs;
    for (const [key, times] of this.byKey) {
      const kept = times.filter((t) => t > cutoff);
      if (kept.length) this.byKey.set(key, kept);
      else this.byKey.delete(key);
    }
    this.all = this.all.filter((a) => a.at > cutoff);
  }
}
