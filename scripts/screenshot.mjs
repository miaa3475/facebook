/**
 * Take a screenshot of a signed-in page.
 *
 *   node scripts/screenshot.mjs [path] [output.png]
 *
 * Logs in over the API, injects the session cookie into a headless Edge
 * instance over the DevTools protocol and captures the page.
 */

import { spawn, spawnSync } from "node:child_process";
import { writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = "https://facebook-social.fbsocial.workers.dev";
const PAGE_PATH = process.argv[2] ?? "/";
const OUTPUT = process.argv[3] ?? "screenshot.png";
const DEBUG_PORT = 9333;

const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

const edge = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!edge) {
  console.error("No Chromium browser found.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------ session cookie

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "miaa3475@gmail.com", password: "SuperSecret123!" }),
});
if (!login.ok) {
  console.error(`Login failed: HTTP ${login.status}`);
  process.exit(1);
}
const setCookie = (login.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("fb_session="));
const cookieValue = setCookie?.split(";")[0].split("=").slice(1).join("=");
console.log("logged in, session cookie acquired");

// --------------------------------------------------------------- the browser

const profile = mkdtempSync(join(tmpdir(), "shot-"));
const browser = spawn(
  edge,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=1280,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(500);
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const list = await res.json();
    target = list.find((t) => t.type === "page");
  } catch {
    // not up yet
  }
}

if (!target) {
  console.error("The browser did not start.");
  browser.kill();
  process.exit(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();

ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

await new Promise((resolve) => ws.addEventListener("open", resolve));

await send("Network.enable");
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 900,
  deviceScaleFactor: 2,
  mobile: false,
});

await send("Network.setCookie", {
  name: "fb_session",
  value: cookieValue,
  domain: "facebook-social.fbsocial.workers.dev",
  path: "/",
  httpOnly: true,
  secure: true,
});

await send("Page.navigate", { url: `${BASE}${PAGE_PATH}` });
await sleep(6000);

const shot = await send("Page.captureScreenshot", { format: "png" });
if (!shot.result?.data) {
  console.error("Screenshot failed");
  browser.kill();
  process.exit(1);
}

writeFileSync(OUTPUT, Buffer.from(shot.result.data, "base64"));
console.log(`saved ${OUTPUT}`);

browser.kill();
process.exit(0);
