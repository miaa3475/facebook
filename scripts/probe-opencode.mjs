/**
 * Probe the local OpenCode server API.
 *
 *   node scripts/probe-opencode.mjs [baseUrl]
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BASE = process.argv[2] ?? "http://127.0.0.1:4096";

function readServicePassword() {
  const path = join(
    process.env.USERPROFILE ?? join(homedir(), ".config"),
    ".config",
    "opencode",
    "service.json",
  );
  try {
    return JSON.parse(readFileSync(path, "utf8")).password;
  } catch {
    return process.env.OPENCODE_SERVER_PASSWORD ?? "";
  }
}

const password = process.env.OPENCODE_SERVER_PASSWORD || readServicePassword();
const headers = {
  "Content-Type": "application/json",
  Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`,
};

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

console.log(`Probing ${BASE}\n`);

// ------------------------------------------------------------- providers

const providers = await api("GET", "/api/provider");
console.log("providers:", JSON.stringify(providers.json?.data?.map((p) => p.id) ?? providers.json));

const agent = await api("GET", "/api/agent");
console.log("agents:", JSON.stringify(agent.json?.data?.map((a) => a.id) ?? agent.json));

// --------------------------------------------------------------- session

const created = await api("POST", "/api/session", {});
console.log("create session:", created.status, created.json?.data?.id ?? JSON.stringify(created.json));

const sessionId = created.json?.data?.id;
if (!sessionId) process.exit(1);

// --------------------------------------------------------------- message

const prompt = await api("POST", `/api/session/${sessionId}/message`, {
  parts: [{ type: "text", text: "請用一句話自我介紹，這是你在 Facebook 社群 App 上的 NPC 角色。" }],
});

console.log("prompt status:", prompt.status);
if (prompt.status !== 200) {
  console.log("prompt error:", JSON.stringify(prompt.json));
} else {
  const parts = prompt.json?.data?.parts ?? prompt.json?.parts ?? [];
  const texts = parts.filter((p) => p.type === "text").map((p) => p.text);
  console.log("reply parts:", parts.map((p) => p.type).join(", "));
  console.log("reply text:", texts.join("\n").slice(0, 500));
  console.log("model:", JSON.stringify(prompt.json?.data?.info?.model ?? prompt.json?.info?.model));
}
