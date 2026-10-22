/**
 * Read the Cloudflare OAuth token that the `cf` CLI stores.
 *
 * The token is short lived and the CLI only refreshes it when it runs, so
 * an expired token is refreshed here first.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const CONFIG_PATH = join(
  process.env.APPDATA ?? join(homedir(), ".config"),
  "xdg.config",
  "cloudflare",
  "config",
  "default.json",
);

function read() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
}

/** True when the stored token is expired (or about to be). */
function isExpired(config) {
  if (!config.expiration_time) return false;
  const expiry = Date.parse(config.expiration_time);
  if (Number.isNaN(expiry)) return false;
  return expiry - Date.now() < 60_000;
}

/** Force the CLI to refresh its token. */
function refresh() {
  const cli = process.platform === "win32" ? "cf.cmd" : "cf";
  execFileSync(cli, ["auth", "whoami"], {
    stdio: "ignore",
    shell: process.platform === "win32",
  });
}

export function readCloudflareToken() {
  let config = read();
  if (isExpired(config)) {
    refresh();
    config = read();
  }
  if (isExpired(config)) {
    throw new Error(
      "The Cloudflare token expired and could not be refreshed. Run `cf auth login`.",
    );
  }
  return config.oauth_token;
}
