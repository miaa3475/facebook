/**
 * Password hashing and opaque token helpers.
 *
 * Everything here uses only Web Crypto, which is available in the Workers
 * runtime, so there are no native dependencies to build.
 */

/**
 * PBKDF2 iteration count.
 *
 * The Cloudflare Workers runtime rejects PBKDF2 with more than 100,000
 * iterations (`NotSupportedError: iteration counts above 100000 are not
 * supported`), so 100,000 is the strongest work factor available here.
 *
 * If you move this app off Workers, raise this to 600,000 (the OWASP
 * recommendation for PBKDF2-HMAC-SHA256) or switch to Argon2id.
 */
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 32;
const SALT_BYTES = 16;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** A URL-safe random token, e.g. for session ids, email links and OAuth state. */
export function randomToken(length = 32): string {
  return toBase64Url(randomBytes(length));
}

/** A numeric one-time code, e.g. 6 digits for email verification. */
export function randomNumericCode(digits = 6): string {
  const max = 10 ** digits;
  const buf = randomBytes(8);
  // Use 8 bytes to build a wide integer, then reduce modulo `max`.
  let value = 0n;
  for (const b of buf) value = (value << 8n) | BigInt(b);
  return (value % BigInt(max)).toString().padStart(digits, "0");
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return toHex(new Uint8Array(digest));
}

/**
 * Hash a password with PBKDF2-HMAC-SHA256.
 * Format: `pbkdf2$<iterations>$<salt-b64url>$<hash-b64url>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    PBKDF2_KEYLEN * 8,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

/** Verify a password against a stored hash. Returns false for malformed hashes. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;

    const iterations = Number(parts[1]);
    if (!Number.isFinite(iterations) || iterations <= 0) return false;

    let salt: Uint8Array;
    let expected: Uint8Array;
    try {
      salt = fromBase64Url(parts[2]);
      expected = fromBase64Url(parts[3]);
    } catch {
      return false;
    }

    const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
      key,
      expected.length * 8,
    );
    return timingSafeEqual(new Uint8Array(bits), expected);
  } catch {
    // A hash we cannot compute against is a failed verification, never a crash.
    return false;
  }
}

/** Constant-time byte comparison. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Constant-time string comparison for short opaque strings. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const ba = encoder.encode(a);
  const bb = encoder.encode(b);
  return timingSafeEqual(ba, bb);
}

/** SHA-256 challenge for OAuth PKCE (base64url of the digest). */
export async function sha256Base64Url(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  return toBase64Url(new Uint8Array(digest));
}
