/**
 * Set up a demo friend so the notification centre has something in it.
 *
 *   node scripts/demo-agents.mjs [baseUrl]
 *
 * Creates an AI assistant account, makes it friends with the account owner,
 * and generates likes / comments / friend requests so the notification list
 * is populated.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { readCloudflareToken } from "./lib/cf-token.mjs";

const BASE = process.argv[2] ?? "https://facebook-social.fbsocial.workers.dev";
const ACCOUNT_ID = "0902aacff1b89178e2fb01f4f5e9b58c";
const DATABASE_ID = "003a7e35-b747-42ca-94f6-43bc01026a57";
const PBKDF2_ITERATIONS = 100_000;

const OWNER = { email: "miaa3475@gmail.com", password: "SuperSecret123!" };
const AGENT = {
  email: "ai.helper@facebook-social.app",
  password: "AgentTest123!",
  name: "小雲 AI",
  bio: "🤖 這個帳號是由 AI 建立的測試夥伴，用來示範好友邀請、按讚與留言通知。你也可以跟它互動试试看！",
  avatarColor: "#8b5cf6",
};

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function d1(sql, params = []) {
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
  return { rows: body.results ?? [], changes: body.meta?.changes ?? 0 };
}

/** A tiny cookie-jar client so each account keeps its own session. */
function client() {
  const cookies = new Map();
  return {
    async call(path, options = {}) {
      const headers = { ...(options.headers ?? {}) };
      if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
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
        if (value === "") cookies.delete(name);
        else cookies.set(name, value);
      }
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {}
      return { status: res.status, json, location: res.headers.get("location") };
    },
    async login(credentials) {
      const res = await this.call("/api/auth/login", { method: "POST", body: credentials });
      if (res.status !== 200) {
        throw new Error(`Login failed for ${credentials.email}: HTTP ${res.status} ${JSON.stringify(res.json)}`);
      }
      return res.json.user;
    },
  };
}

console.log(`\nSetting up the demo friend on ${BASE}\n`);

// ------------------------------------------------- 1. the agent account

const salt = randomBytes(16);
const passwordHash = `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(
  pbkdf2Sync(AGENT.password, salt, PBKDF2_ITERATIONS, 32, "sha256"),
)}`;

const agentId = `agent-${b64url(randomBytes(6))}`;

await d1(
  `INSERT INTO users (id, email, name, password_hash, avatar_color, bio, email_verified, created_at)
   VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)
   ON CONFLICT(email) DO UPDATE SET
     name = excluded.name,
     password_hash = excluded.password_hash,
     avatar_color = excluded.avatar_color,
     bio = excluded.bio,
     email_verified = 1`,
  [agentId, AGENT.email, AGENT.name, passwordHash, AGENT.avatarColor, AGENT.bio, Date.now()],
);
console.log(`1. Agent account ready: ${AGENT.name} <${AGENT.email}>`);

// -------------------------------- 2. remove the leftover test artefacts

const junk = await d1(
  `DELETE FROM posts
    WHERE body LIKE 'like helper%' OR body LIKE 'E2E 測試%' OR body LIKE 'Hello world from a real JSON file%'`,
);
console.log(`2. Removed ${junk.changes} leftover test posts`);

// Drop the throwaway account used by the end-to-end test suite.
const throwaway = await d1(`DELETE FROM users WHERE email = 'friend@example.com'`);
if (throwaway.changes > 0) {
  console.log(`   Removed ${throwaway.changes} rows for the throwaway test account`);
}

// Clear anything a previous run of this script created, so it can be re-run.
await d1(`DELETE FROM posts WHERE user_id = (SELECT id FROM users WHERE email = ?1)`, [AGENT.email]);
await d1(
  `DELETE FROM notifications
    WHERE actor_id = (SELECT id FROM users WHERE email = ?1)
       OR user_id  = (SELECT id FROM users WHERE email = ?1)`,
  [AGENT.email],
);
await d1(
  `DELETE FROM friendships
    WHERE requester_id = (SELECT id FROM users WHERE email = ?1)
       OR addressee_id = (SELECT id FROM users WHERE email = ?1)`,
  [AGENT.email],
);

// ------------------------------------------------- 3. sign both accounts in

const owner = client();
const ownerUser = await owner.login(OWNER);
console.log(`3. Signed in as ${ownerUser.name} <${ownerUser.email}>`);

const bot = client();
const agentUser = await bot.login(AGENT);
console.log(`   Signed in as ${agentUser.name} <${agentUser.email}>`);

// -------------------------------- 4. give the owner some posts

const ownerPosts = [
  "早安！今天天氣不錯 ☀️ 有沒有人要一起喝咖啡？",
  "剛把這個 Facebook Social 的專案部署上線，註冊流程和驗證信都跑通了 🎉",
  "在使用 Resend 寄驗證信的時候發現，沙盒模式只能寄給帳號本身的信箱，之後要驗證自己的網域才行。",
];

// Clear the demo posts from a previous run so the script can be re-run.
const placeholders = ownerPosts.map(() => "?").join(", ");
await d1(
  `DELETE FROM posts
    WHERE user_id = (SELECT id FROM users WHERE email = ?1)
      AND body IN (${placeholders})`,
  [OWNER.email, ...ownerPosts],
);

const createdOwnerPosts = [];
for (const body of ownerPosts) {
  const res = await owner.call("/api/posts", { method: "POST", body: { body } });
  if (res.status === 201) createdOwnerPosts.push(res.json.post);
}
console.log(`4. Published ${createdOwnerPosts.length} posts for the owner`);

// ---------------------------------------------------- 5. the agent posts

const agentPosts = [
  "嗨！我是小雲 AI 🤖 很高興成為你的好友！有任何關於這個平台的問題都可以問我。",
  "小提醒：按讚、留言、加入好友都會產生通知，可以到右上角的鈴鐺看看 ✨",
];

const createdAgentPosts = [];
for (const body of agentPosts) {
  const res = await bot.call("/api/posts", { method: "POST", body: { body } });
  if (res.status === 201) createdAgentPosts.push(res.json.post);
}
console.log(`5. Published ${createdAgentPosts.length} posts for the agent`);

// ------------------------------------------------- 6. befriend each other

const request = await bot.call(`/api/friends/${ownerUser.id}`, { method: "POST" });
console.log(`6. Friend request sent (HTTP ${request.status})`);

const accept = await owner.call(`/api/friends/${agentUser.id}/accept`, { method: "POST" });
console.log(`   Friend request accepted (HTTP ${accept.status})`);

// ------------------------------------------- 7. generate the notifications

// The agent likes the owner's posts -> "like" notifications for the owner.
for (const post of createdOwnerPosts.slice(0, 2)) {
  await bot.call(`/api/posts/${post.id}/like`, { method: "POST" });
}

// The agent comments -> "comment" notifications for the owner.
const comments = [
  "這則我先按個讚！👍",
  "推推！寫得很棒 👏",
];
for (const [index, post] of createdOwnerPosts.slice(0, 2).entries()) {
  await bot.call(`/api/posts/${post.id}/comments`, { method: "POST", body: { body: comments[index] } });
}

// The owner interacts back, so the agent's inbox is populated too.
for (const post of createdAgentPosts) {
  await owner.call(`/api/posts/${post.id}/like`, { method: "POST" });
}
if (createdAgentPosts[0]) {
  await owner.call(`/api/posts/${createdAgentPosts[0].id}/comments`, {
    method: "POST",
    body: { body: "哈囉小雲 AI！以後多多指教 👋" },
  });
}
console.log("7. Generated likes, comments and a friend request");

// ------------------------------------------------------------ 8. summary

const ownerNotifications = await owner.call("/api/notifications");
const agentNotifications = await bot.call("/api/notifications");
const friends = await owner.call("/api/friends");

console.log("\n--- Results ---");
console.log(`Owner's notifications: ${ownerNotifications.json.notifications.length}`);
for (const n of ownerNotifications.json.notifications) {
  console.log(`  [${n.type}] ${n.actor.name} — ${n.postBody?.slice(0, 30) ?? ""}`);
}
console.log(`Agent's notifications:  ${agentNotifications.json.notifications.length}`);
console.log(`Owner's friend list:    ${friends.json.friends.map((f) => f.name).join(", ")}`);

console.log(`\nAgent login: ${AGENT.email} / ${AGENT.password}\n`);
