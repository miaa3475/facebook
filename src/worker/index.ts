import { Hono } from "hono";
import type { WorkerEnv } from "./types.ts";
import { getSessionUser } from "./auth.ts";
import { fail, ok } from "./lib/http.ts";
import authRoutes from "./routes/auth.ts";
import postRoutes from "./routes/posts.ts";
import userRoutes from "./routes/users.ts";
import friendRoutes from "./routes/friends.ts";
import notificationRoutes from "./routes/notifications.ts";
import chatRoutes from "./routes/chat.ts";

const app = new Hono<WorkerEnv>();

// Resolve the session for every request so handlers can read `c.get("user")`.
app.use("*", async (c, next) => {
  c.set("user", await getSessionUser(c));
  await next();
});

// Basic hardening headers.
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
});

app.get("/api/health", (c) => ok({ ok: true, service: "facebook-social", time: Date.now() }));

app.route("/api/auth", authRoutes);
app.route("/api", postRoutes);
app.route("/api", userRoutes);
app.route("/api", friendRoutes);
app.route("/api", notificationRoutes);
app.route("/api", chatRoutes);

app.notFound((c) => fail("找不到這個頁面", 404));

app.onError((err, c) => {
  console.error("[error]", err);
  return fail("伺服器發生錯誤，請稍後再試", 500);
});

export default app;
