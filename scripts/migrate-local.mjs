/**
 * Apply the D1 migrations to the local dev database.
 *
 *   npm run db:migrate:local
 *
 * The Cloudflare Vite plugin keeps its local D1 under its own key, so
 * `cf d1 migrations apply --local` targets a different database. This script
 * talks to the dev server's Local Explorer API instead. It starts a dev
 * server if one is not already running.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT ?? 5173);
const BASE = `http://localhost:${PORT}/cdn-cgi/local/explorer/api`;
const APP = `http://localhost:${PORT}`;

const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function serverIsUp() {
  try {
    const res = await fetch(`${APP}/api/health`);
    if (!res.ok) return false;
    return (await res.text()).includes('"ok":true');
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverIsUp()) {
      await sleep(500);
      return true;
    }
    await sleep(500);
  }
  return false;
}

// ------------------------------------------------------- start a dev server

let dev = null;
async function ensureServer() {
  if (await serverIsUp()) {
    console.log(`Using the dev server already running on port ${PORT}.`);
    return;
  }

  console.log("Starting a dev server…");
  const viteBin = new URL("../node_modules/vite/bin/vite.js", import.meta.url).pathname.replace(
    /^\/([A-Za-z]:)/,
    "$1",
  );
  dev = spawn(process.execPath, [viteBin, "dev"], {
    stdio: "ignore",
    env: { ...process.env, PORT: String(PORT) },
  });

  if (!(await waitForServer())) {
    dev.kill();
    throw new Error("The dev server did not start in time.");
  }
}

function cleanup() {
  if (dev) {
    try {
      dev.kill();
    } catch {}
    dev = null;
  }
}

// ---------------------------------------------------------------- migrate

async function rawQuery(databaseId, sql) {
  const res = await fetch(`${BASE}/d1/database/${databaseId}/raw`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params: [] }),
  });
  return { ok: res.ok, status: res.status, body: await res.text() };
}

try {
  await ensureServer();

  const databases = await (await fetch(`${BASE}/d1/database`)).json();
  const databaseId = databases?.result?.[0]?.uuid;
  if (!databaseId) throw new Error("The dev server did not report a D1 database.");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    // Skip migrations whose tables are already in place.
    const probe = await rawQuery(
      databaseId,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1",
    );
    if (probe.ok && probe.body.includes('"users"')) {
      console.log(`${file}: already applied, skipping.`);
      continue;
    }

    const result = await rawQuery(databaseId, sql);
    console.log(`${file}: HTTP ${result.status}`);
    if (!result.ok) {
      console.error(result.body);
      process.exitCode = 1;
    }
  }

  const tables = await rawQuery(
    databaseId,
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  );
  const names = [...tables.body.matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
  console.log(`\nLocal D1 tables: ${names.join(", ")}`);
} finally {
  cleanup();
}
