/**
 * Turn on "Sign in with Google".
 *
 *   node scripts/enable-google-login.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Stores the credentials as Worker secrets, redeploys, and verifies that the
 * live app now reports Google sign-in as enabled.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [clientId, clientSecret] = process.argv.slice(2);

if (!clientId || !clientSecret) {
  console.error("Usage: node scripts/enable-google-login.mjs <CLIENT_ID> <CLIENT_SECRET>");
  process.exit(1);
}

const SECRETS_FILE = ".secrets.prod";

if (!existsSync(SECRETS_FILE)) {
  console.error(`${SECRETS_FILE} not found. Copy .dev.vars.example and create it.`);
  process.exit(1);
}

/** Replace (or append) a KEY=value line. */
function upsert(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

let secrets = readFileSync(SECRETS_FILE, "utf8");
secrets = upsert(secrets, "GOOGLE_CLIENT_ID", clientId);
secrets = upsert(secrets, "GOOGLE_CLIENT_SECRET", clientSecret);
writeFileSync(SECRETS_FILE, secrets);

console.log("Credentials written to", SECRETS_FILE);

console.log("\nBuilding and deploying…");
const deploy = spawnSync("npm.cmd", ["run", "deploy"], { stdio: "inherit", shell: true });
if (deploy.status !== 0) {
  console.error("Deploy failed.");
  process.exit(deploy.status ?? 1);
}

console.log("\nVerifying the live app…");
const session = await (await fetch("https://facebook-social.fbsocial.workers.dev/api/auth/session")).json();

if (session.googleEnabled === true) {
  console.log("Google sign-in is now enabled on the live site.");
} else {
  console.error("Still disabled. Check that both credentials reached the Worker.");
  process.exit(1);
}
