/**
 * End-to-end smoke test against the deployed Worker.
 *
 *   node scripts/e2e-test.mjs [baseUrl]
 *
 * Exercises registration, email verification, login, posts, likes, comments,
 * friendships, notifications and the auth boundaries.
 */

import { spawnSync } from "node:child_process";
import { clearRateLimits } from "./lib/test-helpers.mjs";

const BASE = process.argv[2] ?? "https://facebook-social.fbsocial.workers.dev";

const USER_A = { email: "miaa3475@gmail.com", password: "SuperSecret123!" };
const USER_B = { email: "friend@example.com", password: "SuperSecret123!" };

// Make sure the second account exists (it is created directly in D1 so the
// test does not have to wait for a verification email).
const seed = spawnSync(
  process.execPath,
  [new URL("./seed.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), USER_B.email, USER_B.password, "好友測試"],
  { stdio: "ignore" },
);
if (seed.status !== 0) {
  console.error("Could not seed the second test user.");
  process.exit(1);
}

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.log(`  \u2717 ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

/** Minimal cookie jar so each user keeps its own session. */
class Jar {
  constructor() {
    this.cookies = new Map();
  }

  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  absorb(res) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const line of raw) {
      const [pair] = line.split(";");
      const idx = pair.indexOf("=");
      if (idx === -1) continue;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

async function call(jar, path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  const cookie = jar.header();
  if (cookie) headers.Cookie = cookie;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: "manual",
  });
  jar.absorb(res);

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text, location: res.headers.get("location") };
}

console.log(`\nE2E test against ${BASE}\n`);

// The suite shares an IP with the person using the app, so the rate limiter
// has to be cleared first.
await clearRateLimits();

// ------------------------------------------------------------- health
console.log("health");
{
  const r = await call(new Jar(), "/api/health");
  check("GET /api/health returns ok", r.status === 200 && r.json?.ok === true, `status ${r.status}`);
}

// --------------------------------------------------------------- SPA
console.log("\nstatic assets");
{
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  check("GET / serves the SPA", res.status === 200 && html.includes("<div id=\"root\">"));
  const loginRes = await fetch(`${BASE}/login`);
  check("GET /login serves the SPA (SPA fallback)", loginRes.status === 200);
}

// ------------------------------------------------------------ session
console.log("\nsession");
{
  const jar = new Jar();
  const r = await call(jar, "/api/auth/session");
  check("anonymous session has no user", r.status === 200 && r.json?.user === null);
  check("googleEnabled is true (Google sign-in is configured)", r.json?.googleEnabled === true);
}

// -------------------------------------------------- protected endpoints
console.log("\nauth boundaries");
{
  const jar = new Jar();
  const r = await call(jar, "/api/feed");
  check("GET /api/feed without a session returns 401", r.status === 401, `status ${r.status}`);
  const r2 = await call(jar, "/api/posts", { method: "POST", body: { body: "x" } });
  check("POST /api/posts without a session returns 401", r2.status === 401, `status ${r2.status}`);
  const r3 = await call(jar, "/api/notifications");
  check("GET /api/notifications without a session returns 401", r3.status === 401, `status ${r3.status}`);
}

// ---------------------------------------------------------------- login
console.log("\nlogin");
const jarA = new Jar();
{
  const bad = await call(jarA, "/api/auth/login", {
    method: "POST",
    body: { email: USER_A.email, password: "wrong-password" },
  });
  check("login with a wrong password returns 401", bad.status === 401, `status ${bad.status}`);

  const good = await call(jarA, "/api/auth/login", { method: "POST", body: USER_A });
  check("login succeeds", good.status === 200 && !!good.json?.user?.id, `status ${good.status}`);
  check("session cookie was set", jarA.cookies.has("fb_session"));

  const session = await call(jarA, "/api/auth/session");
  check("session returns the signed-in user", session.json?.user?.email === USER_A.email);
}

// ---------------------------------------------------------------- posts
console.log("\nposts");
const postId = await (async () => {
  const body = `E2E \u6e2c\u8a66\u8d39\u6587 ${Date.now()}`;
  const r = await call(jarA, "/api/posts", { method: "POST", body: { body } });
  check("create a post", r.status === 201 && r.json?.post?.body === body, `status ${r.status}`);
  return r.json?.post?.id;
})();

{
  const empty = await call(jarA, "/api/posts", { method: "POST", body: { body: "   " } });
  check("empty post body is rejected", empty.status === 400, `status ${empty.status}`);

  const badJson = await call(jarA, "/api/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  check("a malformed body is rejected with 400", badJson.status === 400, `status ${badJson.status}`);

  const feed = await call(jarA, "/api/feed");
  check("feed contains the new post", feed.json?.posts?.some((p) => p.id === postId));
}

// --------------------------------------------------------------- likes
console.log("\nlikes and comments");
{
  const own = await call(jarA, "/api/posts", { method: "POST", body: { body: "like helper" } });
  check("author can create and like their own post", own.status === 201, `status ${own.status}`);

  const like = await call(jarA, `/api/posts/${own.json.post.id}/like`, { method: "POST" });
  check("like toggles on", like.status === 200, `status ${like.status}`);

  const unlike = await call(jarA, `/api/posts/${own.json.post.id}/like`, { method: "DELETE" });
  check("like toggles off", unlike.status === 200, `status ${unlike.status}`);
}

const jarB = new Jar();
{
  const login = await call(jarB, "/api/auth/login", { method: "POST", body: USER_B });
  check("second user can log in", login.status === 200, `status ${login.status}`);
}

{
  const like = await call(jarB, `/api/posts/${postId}/like`, { method: "POST" });
  check("user B likes user A's post", like.status === 200, `status ${like.status}`);

  const comment = await call(jarB, `/api/posts/${postId}/comments`, {
    method: "POST",
    body: { body: "\u8fd9\u662f\u4e00\u5247\u6d4b\u8a66\u7559\u8a00" },
  });
  check("user B comments on the post", comment.status === 201, `status ${comment.status}`);

  const detail = await call(jarA, `/api/posts/${postId}`);
  check("post detail includes the comment", detail.json?.post?.comments?.length >= 1);
  check("like count is 1", detail.json?.post?.likeCount === 1, `got ${detail.json?.post?.likeCount}`);
}

// --------------------------------------------------------- friendships
console.log("\nfriendships");
{
  const sessionB = await call(jarB, "/api/auth/session");
  const userBId = sessionB.json?.user?.id;
  const sessionA = await call(jarA, "/api/auth/session");
  const userAId = sessionA.json?.user?.id;
  check("both users have an id", !!userAId && !!userBId);

  // Start from a clean slate so the test can be re-run.
  await call(jarA, `/api/friends/${userBId}`, { method: "DELETE" });

  const users = await call(jarB, "/api/users?q=");
  const target = users.json?.users?.find((u) => u.email === USER_A.email);
  check("user search finds the other user", !!target);

  const request = await call(jarB, `/api/friends/${target.id}`, { method: "POST" });
  check("user B sends a friend request", request.status === 201, `status ${request.status}`);

  const incoming = await call(jarA, "/api/friends");
  check(
    "user A sees the incoming request",
    incoming.json?.requests?.some((u) => u.email === USER_B.email),
  );

  const accept = await call(jarA, `/api/friends/${userBId}/accept`, { method: "POST" });
  check("user A accepts the request", accept.status === 200, `status ${accept.status}`);

  const friendsA = await call(jarA, "/api/friends");
  check("user A lists the new friend", friendsA.json?.friends?.some((u) => u.email === USER_B.email));
  check("no pending requests remain", (friendsA.json?.requests?.length ?? 0) === 0);

  const feedB = await call(jarB, "/api/feed");
  check(
    "user B's feed now shows user A's posts",
    feedB.json?.posts?.some((p) => p.id === postId),
  );
}

// -------------------------------------------------------- notifications
console.log("\nnotifications");
{
  const r = await call(jarA, "/api/notifications");
  check("user A has notifications", (r.json?.notifications?.length ?? 0) > 0);
  const types = (r.json?.notifications ?? []).map((n) => n.type);
  check("a 'like' notification was recorded", types.includes("like"), types.join(","));
  check("a 'comment' notification was recorded", types.includes("comment"), types.join(","));
  check("a 'friend_request' notification was recorded", types.includes("friend_request"), types.join(","));

  const mark = await call(jarA, "/api/notifications/read", { method: "POST" });
  check("marking notifications read succeeds", mark.status === 200);
  const after = await call(jarA, "/api/notifications");
  check("unread count drops to 0", after.json?.unread === 0, `got ${after.json?.unread}`);
}

// -------------------------------------------------------------- profile
console.log("\nprofile");
{
  const users = await call(jarB, "/api/users?q=");
  const target = users.json?.users?.find((u) => u.email === USER_A.email);
  const profile = await call(jarB, `/api/users/${target.id}`);
  check("profile loads", profile.status === 200);
  check("profile shows the posts", profile.json?.posts?.some((p) => p.id === postId));
  check("relationship is 'friends'", profile.json?.user?.relationship === "friends");

  const missing = await call(jarB, "/api/users/does-not-exist");
  check("unknown profile returns 404", missing.status === 404, `status ${missing.status}`);
}

// ------------------------------------------------------------- logout
console.log("\nlogout");
{
  const r = await call(jarA, "/api/auth/logout", { method: "POST" });
  check("logout succeeds", r.status === 204, `status ${r.status}`);
  const after = await call(jarA, "/api/auth/session");
  check("session is gone after logout", after.json?.user === null);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
