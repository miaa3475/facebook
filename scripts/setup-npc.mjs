/**
 * Set up the NPC chat backend.
 *
 *   node scripts/setup-npc.mjs [--deploy] [--port 4096]
 *
 * 1. Starts `opencode serve` (the headless API).
 * 2. Starts a `cloudflared` quick tunnel so the deployed Worker can reach it.
 * 3. Writes the tunnel URL into `.dev.vars` and `.secrets.prod`.
 * 4. Optionally redeploys the Worker.
 *
 * The tunnel URL changes every time you restart the tunnel, so re-run this
 * script (and redeploy) whenever the OpenCode server moves.
 */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
const shouldDeploy = args.includes("--deploy");
const portIndex = args.indexOf("--port");
const PORT = portIndex >= 0 ? args[portIndex + 1] ?? "4096" : "4096";

// A fresh random password every time, so it never ends up in the repository.
const PASSWORD = process.env.OPENCODE_SERVER_PASSWORD ?? randomBytes(24).toString("base64url");
const MODEL = process.env.LLM_MODEL ?? "opencode/minimax-m3.1-flash-free";
const AGENT = process.env.LLM_AGENT ?? "npc";

const DEV_VARS = ".dev.vars";
const SECRETS = ".secrets.prod";

/** Replace (or append) a KEY=value line. */
function upsert(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.trimEnd()}\n${line}\n`;
}

function updateFile(path, values) {
  let content = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    content = upsert(content, key, value);
  }
  writeFileSync(path, content);
  console.log(`  updated ${path}`);
}

/**
 * Find the OpenCode binary.
 *
 * `opencode` is a .cmd shim on Windows and Node refuses to spawn those
 * without a shell, so the real .exe is used when it can be found.
 */
function findOpencode() {
  const candidates = [];

  if (process.env.OPENCODE_BIN) candidates.push(process.env.OPENCODE_BIN);

  // The npm global root sits next to the node binary on Windows.
  candidates.push(
    join(dirname(process.execPath), "node_modules", "@opencode", "cli", "bin", "opencode.exe"),
  );
  candidates.push(
    join(
      process.env.APPDATA ?? "",
      "nvm",
      "v24.15.0",
      "node_modules",
      "@opencode",
      "cli",
      "bin",
      "opencode.exe",
    ),
  );

  // Anything on PATH.
  for (const dir of (process.env.PATH ?? "").split(";")) {
    if (!dir) continue;
    candidates.push(join(dir, "opencode.exe"));
    candidates.push(join(dir, "opencode"));
  }

  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) return candidate;
    } catch {
      // ignore malformed paths
    }
  }
  return "opencode";
}

const OPENCODE = findOpencode();

console.log("\nSetting up the NPC chat backend\n");

// ------------------------------------------------- 1. the OpenCode server

console.log("1. Starting `opencode serve`…");
const opencode = spawn(OPENCODE, ["serve", "--port", PORT, "--hostname", "127.0.0.1"], {
  detached: true,
  stdio: "ignore",
  windowsHide: true,
  env: { ...process.env, OPENCODE_SERVER_PASSWORD: PASSWORD },
});
opencode.unref();

// Wait for it to answer.
let ready = false;
for (let i = 0; i < 40; i++) {
  await sleep(1000);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/provider`, {
      headers: { Authorization: `Basic ${Buffer.from(`opencode:${PASSWORD}`).toString("base64")}` },
    });
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {
    // not up yet
  }
}
if (!ready) {
  console.error("   The OpenCode server did not start. Is `opencode` on your PATH?");
  process.exit(1);
}
console.log(`   OpenCode is listening on http://127.0.0.1:${PORT}`);

// ---------------------------------------------------------- 2. the tunnel

console.log("2. Starting a cloudflared tunnel…");
const tunnel = spawn(
  "cloudflared",
  ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"],
  { detached: true, stdio: ["ignore", "pipe", "pipe"] },
);
tunnel.unref();

let tunnelUrl = "";
let buffer = "";
const collect = (chunk) => {
  buffer += chunk.toString();
  const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !tunnelUrl) tunnelUrl = match[0];
};
tunnel.stdout.on("data", collect);
tunnel.stderr.on("data", collect);

for (let i = 0; i < 40 && !tunnelUrl; i++) {
  await sleep(1000);
}
if (!tunnelUrl) {
  console.error("   The tunnel did not come up. Is `cloudflared` installed?");
  process.exit(1);
}
console.log(`   Tunnel URL: ${tunnelUrl}`);

// ------------------------------------------------------- 3. write the config

console.log("3. Writing the configuration…");
const values = {
  LLM_BASE_URL: tunnelUrl,
  LLM_USERNAME: "opencode",
  LLM_PASSWORD: PASSWORD,
  LLM_MODEL: MODEL,
  LLM_DIRECTORY: "",
  LLM_AGENT: AGENT,
};
updateFile(DEV_VARS, values);
updateFile(SECRETS, values);

// --------------------------------------------------------- 4. redeploy

if (shouldDeploy) {
  console.log("4. Deploying…");
  const deploy = spawnSync("npm.cmd", ["run", "deploy"], { stdio: "inherit", shell: true });
  if (deploy.status !== 0) {
    console.error("   Deploy failed.");
    process.exit(deploy.status ?? 1);
  }
} else {
  console.log("4. Skipping the deploy (pass --deploy to include it).");
}

console.log(`
Done. The NPC now answers through OpenCode.

  - local dev : LLM_BASE_URL is ${tunnelUrl}
  - deployed  : same URL, use "npm run deploy" to publish it

If the replies stop working, the OpenCode free tier may have run out of
quota — run "opencode auth login" to add your own provider, then re-run this
script.
`);
