import type { Context } from "hono";
import type { WorkerEnv } from "../types.ts";
import {
  clearCookie,
  cookie,
  OAUTH_COOKIE,
  originOf,
  readCookie,
  redirectWithCookie,
  SESSION_COOKIE,
} from "./http.ts";
import { randomToken, sha256, sha256Base64Url, timingSafeEqualString } from "./crypto.ts";
import { createSession, getUserByEmail, getUserById } from "../auth.ts";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

const OAUTH_COOKIE_TTL_SECONDS = 600; // 10 minutes

/**
 * The endpoints can be overridden through bindings so the flow can be tested
 * against a mock provider. In production they stay on the Google defaults.
 */
function endpoints(env: WorkerEnv["Bindings"]) {
  return {
    auth: env.GOOGLE_AUTH_URL?.trim() || GOOGLE_AUTH_URL,
    token: env.GOOGLE_TOKEN_URL?.trim() || GOOGLE_TOKEN_URL,
    userinfo: env.GOOGLE_USERINFO_URL?.trim() || GOOGLE_USERINFO_URL,
  };
}

export function googleEnabled(env: WorkerEnv["Bindings"]): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
}

function redirectUri(c: Context<WorkerEnv>): string {
  return `${originOf(c)}/api/auth/google/callback`;
}

interface OAuthState {
  state: string;
  verifier: string;
}

/** Kick off the Google authorization-code flow with PKCE. */
export async function startGoogleOAuth(c: Context<WorkerEnv>): Promise<Response> {
  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = await sha256Base64Url(verifier);

  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(c),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "select_account",
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${endpoints(c.env).auth}?${params.toString()}`,
      "Set-Cookie": cookie(c, OAUTH_COOKIE, `${state}.${verifier}`, {
        maxAge: OAUTH_COOKIE_TTL_SECONDS,
      }),
    },
  });
}

interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** Handle the Google callback: verify state, exchange the code, sign the user in. */
export async function finishGoogleOAuth(c: Context<WorkerEnv>): Promise<Response> {
  const origin = originOf(c);
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  const failRedirect = (reason: string) =>
    redirectWithCookie(
      c,
      `${origin}/login?error=${encodeURIComponent(reason)}`,
      clearCookie(c, OAUTH_COOKIE),
    );

  if (error) return failRedirect("google_denied");
  if (!code || !state) return failRedirect("missing_code");

  const stored = readCookie(c, OAUTH_COOKIE);
  if (!stored) return failRedirect("missing_state");

  const [expectedState, verifier] = stored.split(".");
  if (!expectedState || !verifier) return failRedirect("missing_state");
  if (!timingSafeEqualString(expectedState, state)) return failRedirect("state_mismatch");

  // Exchange the authorization code for an access token.
  const tokenResponse = await fetch(endpoints(c.env).token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID!,
      client_secret: c.env.GOOGLE_CLIENT_SECRET!,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri(c),
      code_verifier: verifier,
    }),
  });

  if (!tokenResponse.ok) {
    console.error("[google] token exchange failed", tokenResponse.status, await tokenResponse.text());
    return failRedirect("token_exchange_failed");
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };
  if (!tokens.access_token) return failRedirect("no_access_token");

  // Fetch the profile.
  const profileResponse = await fetch(endpoints(c.env).userinfo, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) return failRedirect("profile_failed");

  const profile = (await profileResponse.json()) as GoogleProfile;
  if (!profile.sub || !profile.email) return failRedirect("profile_incomplete");

  const email = profile.email.toLowerCase();
  const name = profile.name?.trim() || email.split("@")[0];

  // Link to an existing account with the same email, otherwise create one.
  let userId: string | null = null;
  const existingAccount = await c.env.DB.prepare(
    `SELECT user_id FROM accounts WHERE provider = 'google' AND provider_account_id = ?1`,
  )
    .bind(profile.sub)
    .first<{ user_id: string }>();

  if (existingAccount) {
    userId = existingAccount.user_id;
  } else {
    const byEmail = await getUserByEmail(c.env.DB, email);
    if (byEmail) {
      userId = byEmail.id;
    } else {
      userId = randomToken(16);
      await c.env.DB.prepare(
        `INSERT INTO users (id, email, name, password_hash, avatar_color, bio, email_verified, created_at)
         VALUES (?1, ?2, ?3, NULL, ?4, '', 1, ?5)`,
      )
        .bind(userId, email, name, "#1877f2", Date.now()).run();
    }

    await c.env.DB.prepare(
      `INSERT INTO accounts (id, user_id, provider, provider_account_id, email, name, picture, created_at)
       VALUES (?1, ?2, 'google', ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(provider, provider_account_id) DO NOTHING`,
    )
      .bind(randomToken(16), userId, profile.sub, email, name, profile.picture ?? null, Date.now())
      .run();
  }

  const user = await getUserById(c.env.DB, userId);
  if (!user) return failRedirect("user_not_found");

  // Google already verified the address.
  if (!user.emailVerified) {
    await c.env.DB.prepare(`UPDATE users SET email_verified = 1 WHERE id = ?1`).bind(user.id).run();
  }

  const sessionToken = await createSession(c.env.DB, user.id);

  return redirectWithCookie(
    c,
    `${origin}/?google=1`,
    [
      cookie(c, SESSION_COOKIE, sessionToken, { maxAge: 30 * 24 * 60 * 60 }),
      clearCookie(c, OAUTH_COOKIE),
    ].join(", "),
  );
}

/** Exposed for tests / reuse. */
export async function hashGoogleId(sub: string): Promise<string> {
  return sha256(sub);
}
