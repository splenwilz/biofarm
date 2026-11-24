/**
 * Password hashing for the two shared passwords, with Node's own scrypt
 * (node:crypto; no third-party hashing package). The stored form is
 * self-describing, so the cost can be raised later without re-hashing what
 * is already in Render:
 *
 *   scrypt:<log2 N>:<r>:<p>:<salt base64url>:<key base64url>
 *
 * Colons, not the usual `$`: a `$` inside an environment value is expanded by
 * shells and by Next's .env loader (`$15` becomes nothing), which would corrupt
 * a pasted hash silently.
 *
 * Defaults are OWASP's scrypt row N=2^15, r=8, p=3 (32 MiB, Password Storage
 * Cheat Sheet), chosen over N=2^17 because the dashboard shares a 512 MB
 * instance with Next. Comparison is constant-time (crypto.timingSafeEqual,
 * which requires equal lengths, checked first).
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (password: Buffer, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;

export interface ScryptParams {
  /** log2 of the CPU/memory cost N; N must be a power of two above one. */
  logN: number;
  r: number;
  p: number;
}

export const DEFAULT_PARAMS: ScryptParams = { logN: 15, r: 8, p: 3 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
/** Sanity bounds for a stored value: outside them it is not ours (or is a memory bomb). */
const MIN_LOG_N = 10;
const MAX_LOG_N = 20;
const MAX_R = 32;
const MAX_P = 16;

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.logN;
  // node: "It is an error when (approximately) 128 * N * r > maxmem"; leave headroom.
  return scrypt(Buffer.from(password, "utf8"), salt, KEY_LENGTH, { N, r: params.r, p: params.p, maxmem: 128 * N * params.r * 2 });
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_PARAMS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, params);
  return ["scrypt", params.logN, params.r, params.p, salt.toString("base64url"), key.toString("base64url")].join(":");
}

/** The parts of a stored hash, or null when the string is not one of ours. */
export function parseStoredHash(stored: string): { params: ScryptParams; salt: Buffer; key: Buffer } | null {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [logN, r, p] = parts.slice(1, 4).map((n) => (/^\d{1,2}$/.test(n) ? Number(n) : NaN));
  if (!(logN! >= MIN_LOG_N && logN! <= MAX_LOG_N && r! >= 1 && r! <= MAX_R && p! >= 1 && p! <= MAX_P)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(parts[4]!) || !/^[A-Za-z0-9_-]+$/.test(parts[5]!)) return null;
  const salt = Buffer.from(parts[4]!, "base64url");
  const key = Buffer.from(parts[5]!, "base64url");
  if (salt.length < 8 || key.length !== KEY_LENGTH) return null;
  return { params: { logN: logN!, r: r!, p: p! }, salt, key };
}

/** True only when `password` produces the stored key. Never throws: a bad stored value is a refusal. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  try {
    const key = await derive(password, parsed.salt, parsed.params);
    return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
  } catch {
    return false;
  }
}
