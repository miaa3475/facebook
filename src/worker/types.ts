/**
 * Bindings available to the Worker. Mirrors `cloudflare.config.ts`.
 */
export interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
  RESEND_FROM: string;
  RESEND_REPLY_TO?: string;
  APP_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Optional endpoint overrides, used by the OAuth test suite. */
  GOOGLE_AUTH_URL?: string;
  GOOGLE_TOKEN_URL?: string;
  GOOGLE_USERINFO_URL?: string;
  /**
   * The OpenCode server that generates NPC replies.
   * Leave empty to use the built-in canned answers.
   */
  LLM_BASE_URL?: string;
  LLM_USERNAME?: string;
  LLM_PASSWORD?: string;
  /** Model to use, in `provider/model` form (e.g. `opencode/minimax-m3.1-flash-free`). */
  LLM_MODEL?: string;
  /** Optional directory the OpenCode session is scoped to. */
  LLM_DIRECTORY?: string;
  /** The OpenCode agent that carries the NPC's persona. */
  LLM_AGENT?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  avatarColor: string;
  bio: string;
  emailVerified: boolean;
  createdAt: number;
}

/** The subset of a user that is safe to send to the browser. */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  bio: string;
  emailVerified: boolean;
  createdAt: number;
}

export function toPublicUser(u: Omit<User, "passwordHash">): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarColor: u.avatarColor,
    bio: u.bio,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
  };
}

export interface SessionUser extends PublicUser {
  sessionId: string;
}

/** The Hono environment shared by every route module. */
export interface WorkerEnv {
  Bindings: Env;
  Variables: {
    user: SessionUser | null;
  };
}
