/**
 * Seed a test user straight into D1.
 *
 *   node scripts/seed.mjs [email] [password] [name]
 *
 * Useful for testing the social features (friends, likes, comments) without
 * waiting for a verification email. The account is created already verified.
 */

import { existsSync } from "node:fs";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { readCloudflareToken } from "./lib/cf-token.mjs";

const ACCOUNT_ID = "0902aacff1b89178e2fb01f4f5e9b58c";
const DATABASE_ID = "003a7e35-b747-42ca-94f6-43bc01026a57";
const PBKDF2_ITERATIONS = 100_000;

const email = (process.argv[2] ?? "friend@example.com").toLowerCase();
const password = process.argv[3] ?? "SuperSecret123!";
const name = process.argv[4] ?? "好友測試";

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const salt = randomBytes(16);
const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
const passwordHash = `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(derived)}`;

const userId = `seed-${b64url(randomBytes(9))}`;
const avatarColor = "#42b72a";

/** The `cf` CLI keeps its OAuth token in this file. */
const token = readCloudflareToken();

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql: `INSERT INTO users (id, email, name, password_hash, avatar_color, bio, email_verified, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, '', 1, ?6)
            ON CONFLICT(email) DO UPDATE SET
              name = excluded.name,
              password_hash = excluded.password_hash,
              email_verified = 1`,
      params: [userId, email, name, passwordHash, avatarColor, Date.now()],
    }),
  },
);

const body = await res.json();
if (!body.success) {
  console.error("Seeding failed:", JSON.stringify(body.errors ?? body, null, 2));
  process.exit(1);
}

console.log(`Seeded user: ${email}`);
console.log(`Password:    ${password}`);
console.log(`User id:     ${userId}`);
