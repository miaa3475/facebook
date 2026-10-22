import type { Context } from "hono";

/** Cookie used to hold the session id. */
export const SESSION_COOKIE = "fb_session";
/** Cookie holding the OAuth `state` + PKCE verifier between redirect and callback. */
export const OAUTH_COOKIE = "fb_oauth";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * The public origin of the current request. `APP_URL` wins when set, otherwise
 * we derive it from the request (works for both `cf dev` and workers.dev).
 */
export function originOf(c: Context): string {
  const configured = c.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(c.req.url).origin;
}

export function isSecure(c: Context): boolean {
  return new URL(c.req.url).protocol === "https:" || c.env.APP_URL?.startsWith("https://") === true;
}

/** Build a `Set-Cookie` header value. */
export function cookie(
  c: Context,
  name: string,
  value: string,
  opts: { maxAge?: number; httpOnly?: boolean; path?: string; sameSite?: string } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path ?? "/"}`);
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${opts.sameSite ?? "Lax"}`);
  if (isSecure(c)) parts.push("Secure");
  return parts.join("; ");
}

/** Build a `Set-Cookie` header that clears a cookie. */
export function clearCookie(c: Context, name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isSecure(c) ? "; Secure" : ""}`;
}

export function readCookie(c: Context, name: string): string | null {
  const header = c.req.header("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/** Read a route parameter, falling back to an empty string when it is absent. */
export function routeParam(c: Context, name: string): string {
  return c.req.param(name) ?? "";
}

/** Redirect and attach a `Set-Cookie` header in one step. */
export function redirectWithCookie(c: Context, location: string, setCookie: string): Response {
  const res = c.redirect(location, 302);
  res.headers.append("Set-Cookie", setCookie);
  return res;
}

export function ok<T>(data: T, status = 200, headers?: HeadersInit): Response {
  return Response.json(data as Record<string, unknown>, { status, headers });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status });
}

/**
 * Read a JSON request body.
 *
 * Returns a discriminated result so a malformed body produces a clear
 * message instead of a confusing schema-validation error.
 */
export async function readJson(
  c: Context,
): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await c.req.json() };
  } catch {
    return { ok: false, message: "請求格式不正確，請確認傳送的是合法的 JSON" };
  }
}

/**
 * Best-effort client IP, used as part of the rate-limit key.
 */
export function clientIp(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
}

/**
 * Fixed-window rate limiter backed by D1 so the limit holds across isolates.
 * Returns true when the request is allowed.
 */
export async function rateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const id = `${key}:${windowStart}`;

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(id, windowStart)
    .first<{ count: number }>();

  return (row?.count ?? 1) <= limit;
}
