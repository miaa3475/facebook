import type { Context, Next } from "hono";
import { fail, SESSION_COOKIE, readCookie } from "./lib/http.ts";
import { randomToken, sha256 } from "./lib/crypto.ts";
import type { Env, SessionUser, User, WorkerEnv } from "./types.ts";
import { toPublicUser } from "./types.ts";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Map a `users` row to the `User` shape. */
export function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: row.password_hash === null || row.password_hash === undefined ? null : String(row.password_hash),
    avatarColor: String(row.avatar_color ?? "#1877f2"),
    bio: String(row.bio ?? ""),
    emailVerified: Number(row.email_verified ?? 0) === 1,
    createdAt: Number(row.created_at ?? 0),
  };
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE id = ?1`).bind(id).first();
  return row ? mapUser(row) : null;
}

export async function getUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE email = ?1`).bind(email.toLowerCase()).first();
  return row ? mapUser(row) : null;
}

/**
 * Create a session row and return the raw (unhashed) token to put in the cookie.
 * Only the SHA-256 hash of the token is persisted.
 */
export async function createSession(db: D1Database, userId: string): Promise<string> {
  const token = randomToken(32);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(await sha256(token), userId, now + SESSION_TTL_MS, now)
    .run();
  return token;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(await sha256(token)).run();
}

export async function deleteAllSessionsForUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(userId).run();
}

/** Resolve the current session, or null when the caller is anonymous. */
export async function getSessionUser(c: Context<WorkerEnv>): Promise<SessionUser | null> {
  const token = readCookie(c, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT u.*, s.id AS session_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?1 AND s.expires_at > ?2`,
  )
    .bind(tokenHash, Date.now())
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    ...toPublicUser(mapUser(row)),
    sessionId: String(row.session_id),
  };
}

export type AppVars = WorkerEnv["Variables"];

/**
 * Middleware that rejects the request with 401 when there is no valid session.
 * Put it on routes that require a signed-in user.
 */
export async function requireAuth(c: Context<WorkerEnv>, next: Next) {
  if (!c.get("user")) return fail("請先登入", 401);
  await next();
}
