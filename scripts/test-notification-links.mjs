/**
 * Verify that notifications link through to the right post.
 *
 *   node scripts/test-notification-links.mjs [baseUrl]
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

console.log(`\nNotification link test against ${BASE}\n`);

// The suite shares an IP with the person using the app, so the rate limiter
// has to be cleared first.
await clearRateLimits();

// ------------------------------------------------------------ SPA routing

console.log("client routes");
{
  for (const path of ["/post/abc123", "/notifications", "/profile/xyz", "/login"]) {
    const res = await fetch(`${BASE}${path}`);
    const text = await res.text();
    check(`${path} serves the SPA`, res.status === 200 && text.includes('<div id="root">'), `HTTP ${res.status}`);
  }
}

// ----------------------------------------------------------- notification data

console.log("\nnotification payload");
await call("/api/auth/login", {
  method: "POST",
  body: { email: "miaa3475@gmail.com", password: "SuperSecret123!" },
});

const notifications = await call("/api/notifications");
const items = notifications.json.notifications;

check("there are notifications to link from", items.length > 0);
check("every post notification carries a postId", items.filter((n) => n.postId).every((n) => !!n.postId));
check(
  "comment notifications also carry a commentId",
  items.filter((n) => n.type === "comment").every((n) => !!n.commentId),
);
check(
  "like notifications point at a post but not a comment",
  items.filter((n) => n.type === "like").every((n) => !!n.postId && !n.commentId),
);
check(
  "friend requests have no post",
  items.filter((n) => n.type === "friend_request").every((n) => !n.postId),
);

// ------------------------------------------------- following the link works

console.log("\nfollowing the links");
{
  const withPost = items.find((n) => n.postId);
  const detail = await call(`/api/posts/${withPost.postId}`);
  check("the linked post loads", detail.status === 200, `HTTP ${detail.status}`);
  check("the linked post is the right one", detail.json.post.id === withPost.postId);
  check("the linked post shows its comments", Array.isArray(detail.json.post.comments));

  const withComment = items.find((n) => n.commentId);
  if (withComment) {
    const comment = detail.json.post.comments.find((c) => c.id === withComment.commentId);
    check("the comment in the notification exists on that post", !!comment, withComment.commentId);
  } else {
    check("there is a comment notification to follow", false, "none found");
  }
}

// ------------------------------------------- the permalink page data source

console.log("\npermalink page");
{
  const target = items.find((n) => n.postId);
  const res = await call(`/api/posts/${target.postId}`);
  const post = res.json.post;
  check("the permalink payload includes the comments inline", Array.isArray(post.comments));
  check("the permalink payload includes the author", !!post.author?.name);
  check("the permalink payload includes the counters", typeof post.likeCount === "number" && typeof post.commentCount === "number");
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
