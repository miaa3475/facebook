/**
 * End-to-end test of the NPC chat.
 *
 *   node scripts/test-chat.mjs [baseUrl]
 *
 * Sends a message to the NPC and waits for the reply that the Worker
 * generates through the OpenCode server.
 */

const BASE = process.argv[2] ?? "https://facebook-social.fbsocial.workers.dev";

import { clearRateLimits } from "./lib/test-helpers.mjs";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jar = new Map();

async function call(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (value === "") jar.delete(name);
    else jar.set(name, value);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}
  return { status: res.status, json, text };
}

console.log(`\nNPC chat test against ${BASE}\n`);

// The suite shares an IP with the person using the app, so the rate limiter
// has to be cleared first.
await clearRateLimits();

// ------------------------------------------------------------------ login

{
  const res = await call("/api/auth/login", {
    method: "POST",
    body: { email: "miaa3475@gmail.com", password: "SuperSecret123!" },
  });
  check("signed in", res.status === 200, `HTTP ${res.status}`);
}

// ------------------------------------------------------------ llm status

let llmReachable = false;
{
  const res = await call("/api/chat/status");
  llmReachable = Boolean(res.json?.reachable);
  check("chat status responds", res.status === 200, `HTTP ${res.status}`);
  check("a language model is configured", res.json?.llm === true, JSON.stringify(res.json));
  check("the language model is reachable", res.json?.reachable === true, JSON.stringify(res.json));
  console.log(`        model: ${res.json?.model ?? "(none)"}`);
}

// --------------------------------------------------------- find the NPC

let npcId = null;
{
  const res = await call("/api/users?q=");
  npcId = res.json?.users?.find((u) => u.email === "ai.helper@facebook-social.app")?.id ?? null;
  check("the NPC account can be found", !!npcId);
}

// ----------------------------------------------------- create a chat

let conversationId = null;
{
  const res = await call("/api/chat/conversations", { method: "POST", body: { userId: npcId } });
  check("a conversation was created", res.status === 200, `HTTP ${res.status}`);
  conversationId = res.json?.conversation?.id ?? null;
  check("the conversation has an id", !!conversationId);
  check("the peer is flagged as an NPC", res.json?.conversation?.peerIsNpc === true);
}

// ------------------------------------------------------- send a message

// Remember which messages already exist so a reply from an earlier run is
// not mistaken for a fresh one.
let knownIds = new Set();
{
  const before = await call(`/api/chat/conversations/${conversationId}`);
  knownIds = new Set((before.json?.messages ?? []).map((m) => m.id));
}

{
  const res = await call(`/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { body: "嗨！你是誰呀？用一句話介紹自己就好 😄" },
  });
  check("the message was accepted", res.status === 201, `HTTP ${res.status}`);
  check("the message comes back marked as mine", res.json?.message?.mine === true);
}

// -------------------------------------------------- wait for the reply

let reply = null;
{
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const res = await call(`/api/chat/conversations/${conversationId}`);
    const messages = res.json?.messages ?? [];
    const fresh = messages.filter((m) => !m.mine && !knownIds.has(m.id));
    if (fresh.length > 0) {
      reply = fresh[fresh.length - 1];
      break;
    }
  }
  check("the NPC replied", !!reply, "no new reply after 60s");
  if (reply) {
    console.log(`        reply: ${reply.body.slice(0, 160)}`);
    check("the reply is not empty", reply.body.trim().length > 0);
    check("the reply is shorter than a novel", reply.body.length < 2000, `${reply.body.length} chars`);
  }
}

// --------------------------------------------- the reply is persisted

{
  const res = await call("/api/chat/conversations");
  const conversation = res.json?.conversations?.find((c) => c.id === conversationId);
  check("the conversation appears in the list", !!conversation);
  check("the last message is the NPC reply", conversation?.lastMessage?.senderId === npcId);
  check("the conversation is not marked as unread", (conversation?.unread ?? 0) === 0, `unread ${conversation?.unread}`);
}

// ------------------------------------------------------ second message

{
  const res = await call(`/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { body: "那你知道怎麼用 Resend 寄信嗎？" },
  });
  check("a second message was accepted", res.status === 201, `HTTP ${res.status}`);
}

// --------------------------------------------------------- boundaries

{
  const res = await call("/api/chat/conversations/not-a-real-conversation");
  check("an unknown conversation returns 404", res.status === 404, `HTTP ${res.status}`);

  const empty = await call(`/api/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { body: "   " },
  });
  check("an empty message is rejected", empty.status === 400, `HTTP ${empty.status}`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
