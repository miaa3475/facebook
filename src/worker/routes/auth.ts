import { Hono } from "hono";
import { z } from "zod";
import type { WorkerEnv } from "../types.ts";
import {
  clearCookie,
  cookie,
  fail,
  OAUTH_COOKIE,
  ok,
  originOf,
  rateLimit,
  readCookie,
  readJson,
  redirectWithCookie,
  RESET_TTL_MS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  VERIFY_TTL_MS,
} from "../lib/http.ts";
import {
  createSession,
  deleteAllSessionsForUser,
  deleteSession,
  getSessionUser,
  getUserByEmail,
  getUserById,
  mapUser,
} from "../auth.ts";
import {
  hashPassword,
  randomNumericCode,
  randomToken,
  sha256,
  verifyPassword,
} from "../lib/crypto.ts";
import { Mailer } from "../emails/send.tsx";
import { toPublicUser } from "../types.ts";
import { googleEnabled, startGoogleOAuth, finishGoogleOAuth } from "../lib/google.ts";

const auth = new Hono<WorkerEnv>();

const AVATAR_COLORS = [
  "#1877f2",
  "#42b72a",
  "#f7b928",
  "#f3425f",
  "#8b5cf6",
  "#e8873a",
  "#15a0bd",
  "#d6307c",
];

function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const emailSchema = z.string().trim().toLowerCase().email("請輸入有效的電子郵件地址");
const passwordSchema = z
  .string()
  .min(8, "密碼至少需要 8 個字元")
  .max(200, "密碼長度過長");

/** Create a verification token row for a user, replacing any previous one. */
async function issueVerificationToken(
  db: D1Database,
  userId: string,
  email: string,
): Promise<{ code: string; token: string }> {
  await db
    .prepare(
      `DELETE FROM verification_tokens WHERE user_id = ?1 AND purpose = 'verify_email' AND used_at IS NULL`,
    )
    .bind(userId)
    .run();

  const code = randomNumericCode(6);
  const token = randomToken(32);
  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO verification_tokens (id, user_id, email, purpose, code_hash, token_hash, expires_at, created_at)
       VALUES (?1, ?2, ?3, 'verify_email', ?4, ?5, ?6, ?7)`,
    )
    .bind(
      randomToken(16),
      userId,
      email,
      await sha256(code),
      await sha256(token),
      now + VERIFY_TTL_MS,
      now,
    )
    .run();

  return { code, token };
}

/** Register a new account with a password. Sends the verification email. */
auth.post("/register", async (c) => {
  const allowed = await rateLimit(c.env.DB, `register:${c.req.header("cf-connecting-ip") ?? "ip"}`, 5, 60 * 60 * 1000);
  if (!allowed) return fail("嘗試次數過多，請稍後再試", 429);

  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const parsed = z
    .object({
      email: emailSchema,
      name: z.string().trim().min(2, "姓名至少需要 2 個字元").max(50, "姓名過長"),
      password: passwordSchema,
    })
    .safeParse(raw.value);

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "輸入資料有誤", 400);
  }

  const { email, name, password } = parsed.data;

  if (await getUserByEmail(c.env.DB, email)) {
    return fail("此電子郵件已被註冊", 409);
  }

  const userId = randomToken(16);
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO users (id, email, name, password_hash, avatar_color, bio, email_verified, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, '', 0, ?6)`,
  )
    .bind(userId, email, name, await hashPassword(password), pickAvatarColor(userId), now)
    .run();

  const { code, token } = await issueVerificationToken(c.env.DB, userId, email);
  const origin = originOf(c);
  const verificationUrl = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;

  const mailer = new Mailer(c.env);
  const sent = await mailer.sendVerificationEmail(email, {
    userId,
    name,
    code,
    verificationUrl,
    supportEmail: c.env.RESEND_REPLY_TO ?? "support@resend.dev",
    expiresInHours: Math.round(VERIFY_TTL_MS / 3_600_000),
  });

  if (!sent) {
    // Roll back the account so the user can retry cleanly.
    await c.env.DB.prepare(`DELETE FROM users WHERE id = ?1`).bind(userId).run();
    return fail("驗證信寄送失敗，請稍後再試", 502);
  }

  return ok({ ok: true, email, message: "驗證信已寄出，請查收你的信箱" }, 201);
});

/** Resend the verification email. */
auth.post("/resend-verification", async (c) => {
  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z.object({ email: emailSchema }).safeParse(raw.value);
  if (!body.success) return fail("請輸入有效的電子郵件地址", 400);

  const ip = c.req.header("cf-connecting-ip") ?? "ip";
  const allowed = await rateLimit(c.env.DB, `resend:${ip}`, 5, 60 * 60 * 1000);
  if (!allowed) return fail("嘗試次數過多，請稍後再試", 429);

  const user = await getUserByEmail(c.env.DB, body.data.email);
  // Always answer the same way so we do not leak which emails exist.
  if (!user || user.emailVerified) return ok({ ok: true, message: "如果該信箱需要驗證，我們已經寄出驗證信" });

  const { code, token } = await issueVerificationToken(c.env.DB, user.id, user.email);
  const verificationUrl = `${originOf(c)}/api/auth/verify?token=${encodeURIComponent(token)}`;

  const mailer = new Mailer(c.env);
  await mailer.sendVerificationEmail(user.email, {
    userId: user.id,
    name: user.name,
    code,
    verificationUrl,
    supportEmail: c.env.RESEND_REPLY_TO ?? "support@resend.dev",
    expiresInHours: Math.round(VERIFY_TTL_MS / 3_600_000),
  });

  return ok({ ok: true, message: "驗證信已寄出，請查收你的信箱" });
});

/**
 * Verify an email address using either the emailed link token or the 6-digit code.
 * Redirects to the app on success so the link in the email works directly.
 */
auth.get("/verify", async (c) => {
  const token = c.req.query("token");
  const origin = originOf(c);

  if (!token) return c.redirect(`${origin}/login?error=missing_token`);

  const row = await c.env.DB.prepare(
    `SELECT * FROM verification_tokens
      WHERE token_hash = ?1 AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > ?2`,
  )
    .bind(await sha256(token), Date.now())
    .first<Record<string, unknown>>();

  if (!row) return c.redirect(`${origin}/login?error=invalid_token`);

  const userId = String(row.user_id);
  await c.env.DB.prepare(
    `UPDATE verification_tokens SET used_at = ?1 WHERE id = ?2`,
  )
    .bind(Date.now(), String(row.id)).run();
  await c.env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?1`).bind(userId).run();

  const user = await getUserById(c.env.DB, userId);
  if (user) {
    const sessionToken = await createSession(c.env.DB, userId);
    const mailer = new Mailer(c.env);
    await mailer.sendWelcomeEmail(user.email, {
      userId,
      name: user.name,
      supportEmail: c.env.RESEND_REPLY_TO ?? "support@resend.dev",
    });
    return redirectWithCookie(
      c,
      `${origin}/?verified=1`,
      cookie(c, SESSION_COOKIE, sessionToken, { maxAge: SESSION_TTL_MS / 1000 }),
    );
  }

  return c.redirect(`${origin}/login?error=invalid_token`);
});

/** Verify with the 6-digit code typed into the app. */
auth.post("/verify", async (c) => {
  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z
    .object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/, "請輸入 6 位數驗證碼") })
    .safeParse(raw.value);
  if (!body.success) return fail(body.error.issues[0]?.message ?? "輸入資料有誤", 400);

  const user = await getUserByEmail(c.env.DB, body.data.email);
  if (!user) return fail("驗證失敗，請重新申請驗證信", 400);
  if (user.emailVerified) return ok({ ok: true, message: "信箱已經驗證完成" });

  const row = await c.env.DB.prepare(
    `SELECT * FROM verification_tokens
      WHERE user_id = ?1 AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > ?2`,
  )
    .bind(user.id, Date.now())
    .first<Record<string, unknown>>();

  if (!row || row.code_hash !== (await sha256(body.data.code))) {
    return fail("驗證碼錯誤或已過期", 400);
  }

  await c.env.DB.prepare(`UPDATE verification_tokens SET used_at = ?1 WHERE id = ?2`)
    .bind(Date.now(), String(row.id)).run();
  await c.env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?1`).bind(user.id).run();

  const mailer = new Mailer(c.env);
  await mailer.sendWelcomeEmail(user.email, {
    userId: user.id,
    name: user.name,
    supportEmail: c.env.RESEND_REPLY_TO ?? "support@resend.dev",
  });

  return ok({ ok: true, message: "信箱驗證完成，請登入" });
});

/** Sign in with email + password. */
auth.post("/login", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "ip";
  const allowed = await rateLimit(c.env.DB, `login:${ip}`, 20, 15 * 60 * 1000);
  if (!allowed) return fail("嘗試次數過多，請稍後再試", 429);

  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z
    .object({ email: emailSchema, password: z.string().min(1, "請輸入密碼") })
    .safeParse(raw.value);
  if (!body.success) return fail(body.error.issues[0]?.message ?? "輸入資料有誤", 400);

  const user = await getUserByEmail(c.env.DB, body.data.email);

  // Always run a verification so timing does not reveal whether the account exists.
  const stored = user?.passwordHash ?? "pbkdf2$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAA";
  const valid = await verifyPassword(body.data.password, stored);

  if (!user || !valid) return fail("電子郵件或密碼錯誤", 401);
  if (!user.emailVerified) {
    return fail("請先完成電子郵件驗證", 403, { needsVerification: true, email: user.email });
  }

  const sessionToken = await createSession(c.env.DB, user.id);
  return ok(
    { ok: true, user: toPublicUser(user) },
    200,
    { "Set-Cookie": cookie(c, SESSION_COOKIE, sessionToken, { maxAge: SESSION_TTL_MS / 1000 }) },
  );
});

/** Sign out. */
auth.post("/logout", async (c) => {
  const token = readCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(c.env.DB, token);
  return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookie(c, SESSION_COOKIE) } });
});

/** Current session info. */
auth.get("/session", async (c) => {
  const user = await getSessionUser(c);
  return ok({
    user: user ? toPublicUser(user) : null,
    googleEnabled: googleEnabled(c.env),
  });
});

/** Request a password reset link. */
auth.post("/forgot-password", async (c) => {
  const ip = c.req.header("cf-connecting-ip") ?? "ip";
  const allowed = await rateLimit(c.env.DB, `forgot:${ip}`, 5, 60 * 60 * 1000);
  if (!allowed) return fail("嘗試次數過多，請稍後再試", 429);

  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z.object({ email: emailSchema }).safeParse(raw.value);
  if (!body.success) return fail("請輸入有效的電子郵件地址", 400);

  const user = await getUserByEmail(c.env.DB, body.data.email);
  if (!user || !user.passwordHash) {
    // Do not reveal that the account does not exist.
    return ok({ ok: true, message: "如果該信箱存在，我們已經寄出重設密碼信" });
  }

  const token = randomToken(32);
  const now = Date.now();
  await c.env.DB.prepare(
    `DELETE FROM verification_tokens WHERE user_id = ?1 AND purpose = 'password_reset' AND used_at IS NULL`,
  )
    .bind(user.id).run();
  await c.env.DB.prepare(
    `INSERT INTO verification_tokens (id, user_id, email, purpose, code_hash, token_hash, expires_at, created_at)
     VALUES (?1, ?2, ?3, 'password_reset', ?4, ?5, ?6, ?7)`,
  )
    .bind(
      randomToken(16),
      user.id,
      user.email,
      "",
      await sha256(token),
      now + RESET_TTL_MS,
      now,
    ).run();

  const resetUrl = `${originOf(c)}/reset-password?token=${encodeURIComponent(token)}`;
  const mailer = new Mailer(c.env);
  await mailer.sendPasswordResetEmail(user.email, {
    userId: user.id,
    name: user.name,
    resetUrl,
    supportEmail: c.env.RESEND_REPLY_TO ?? "support@resend.dev",
    expiresInMinutes: Math.round(RESET_TTL_MS / 60_000),
  });

  return ok({ ok: true, message: "如果該信箱存在，我們已經寄出重設密碼信" });
});

/** Complete a password reset. */
auth.post("/reset-password", async (c) => {
  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z
    .object({
      token: z.string().min(10, "無效的重設連結"),
      password: passwordSchema,
    })
    .safeParse(raw.value);
  if (!body.success) return fail(body.error.issues[0]?.message ?? "輸入資料有誤", 400);

  const row = await c.env.DB.prepare(
    `SELECT * FROM verification_tokens
      WHERE token_hash = ?1 AND purpose = 'password_reset' AND used_at IS NULL AND expires_at > ?2`,
  )
    .bind(await sha256(body.data.token), Date.now())
    .first<Record<string, unknown>>();

  if (!row) return fail("重設連結無效或已過期", 400);

  await c.env.DB.prepare(`UPDATE verification_tokens SET used_at = ?1 WHERE id = ?2`)
    .bind(Date.now(), String(row.id)).run();
  await c.env.DB.prepare(`UPDATE users SET password_hash = ?1 WHERE id = ?2`)
    .bind(await hashPassword(body.data.password), String(row.user_id)).run();

  // Force a re-login on every device after a password change.
  await deleteAllSessionsForUser(c.env.DB, String(row.user_id));

  return ok({ ok: true, message: "密碼已更新，請使用新密碼登入" });
});

/** Start the Google OAuth flow. */
auth.get("/google", async (c) => {
  if (!googleEnabled(c.env)) return fail("Google 登入尚未設定", 501);
  return startGoogleOAuth(c);
});

/** Google OAuth callback. */
auth.get("/google/callback", async (c) => {
  if (!googleEnabled(c.env)) return c.redirect(`${originOf(c)}/login?error=google_disabled`);
  return finishGoogleOAuth(c);
});

export default auth;
export { mapUser };
