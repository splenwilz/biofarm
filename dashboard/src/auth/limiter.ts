import { AttemptLimiter } from "@/auth/rateLimit";

/**
 * Five attempts from one address, or thirty from everywhere, inside fifteen
 * minutes, and sign-in waits; a successful sign-in forgives its own attempts.
 * One instance per server process.
 */
export const signInLimiter = new AttemptLimiter({ perKey: 5, global: 30, windowMs: 15 * 60_000 });

/**
 * The key an attempt is counted under: the last X-Forwarded-For entry. By the
 * header's convention each proxy appends the address it saw, so the last entry
 * is the one Render's proxy wrote and the first is whatever the client sent
 * (Render's docs do not say either way; the global cap in signInLimiter is
 * what holds if the header is padded). A missing header (local development)
 * counts under one shared key.
 */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last && last.length <= 64 ? last : "unknown";
}
