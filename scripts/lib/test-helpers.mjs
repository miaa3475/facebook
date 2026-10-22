/**
 * Shared helpers for the test scripts.
 */

import { readCloudflareToken } from "./cf-token.mjs";

const ACCOUNT_ID = "0902aacff1b89178e2fb01f4f5e9b58c";
const DATABASE_ID = "003a7e35-b747-42ca-94f6-43bc01026a57";

/** Run a statement against the deployed D1 database. */
export async function d1(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readCloudflareToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = await res.json();
  if (!body.success) throw new Error(JSON.stringify(body.errors));
  return body;
}

/**
 * Clear the rate limiter.
 *
 * The login endpoint allows 20 attempts per IP per 15 minutes, and the tests
 * share an IP with the person using the app — so without this the suite
 * starts failing with 429 after a few runs.
 */
export async function clearRateLimits() {
  try {
    await d1("DELETE FROM rate_limits");
  } catch (err) {
    console.warn("Could not clear the rate limits:", err.message);
  }
}
