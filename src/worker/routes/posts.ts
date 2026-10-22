import { Hono } from "hono";
import { z } from "zod";
import type { WorkerEnv } from "../types.ts";
import { toPublicUser, type PublicUser } from "../types.ts";
import { fail, ok, rateLimit, readJson, routeParam } from "../lib/http.ts";
import { randomToken } from "../lib/crypto.ts";
import { requireAuth } from "../auth.ts";

const posts = new Hono<WorkerEnv>();

const POST_AUTHOR_COLUMNS = `
  u.id AS a_id, u.email AS a_email, u.name AS a_name, u.avatar_color AS a_avatar_color,
  u.bio AS a_bio, u.email_verified AS a_email_verified, u.created_at AS a_created_at
`;

function authorFromRow(row: Record<string, unknown>): PublicUser {
  return toPublicUser({
    id: String(row.a_id),
    email: String(row.a_email),
    name: String(row.a_name),
    avatarColor: String(row.a_avatar_color ?? "#1877f2"),
    bio: String(row.a_bio ?? ""),
    emailVerified: Number(row.a_email_verified ?? 0) === 1,
    createdAt: Number(row.a_created_at ?? 0),
  });
}

/** Feed rows: posts written by the user or by any accepted friend. */
const FEED_SQL = `
  SELECT p.id, p.body, p.created_at, p.user_id,
         ${POST_AUTHOR_COLUMNS},
         (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
         (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count,
         EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?1) AS liked_by_me
    FROM posts p
    JOIN users u ON u.id = p.user_id
   WHERE p.user_id = ?1
      OR p.user_id IN (SELECT addressee_id FROM friendships WHERE requester_id = ?1 AND status = 'accepted')
   ORDER BY p.created_at DESC, p.id DESC
   LIMIT ?2 OFFSET ?3
`;

export interface PostPayload {
  id: string;
  body: string;
  createdAt: number;
  author: PublicUser;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  comments?: CommentPayload[];
}

export interface CommentPayload {
  id: string;
  body: string;
  createdAt: number;
  author: PublicUser;
}

function toPostPayload(row: Record<string, unknown>): PostPayload {
  return {
    id: String(row.id),
    body: String(row.body),
    createdAt: Number(row.created_at),
    author: authorFromRow(row),
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    likedByMe: Number(row.liked_by_me ?? 0) === 1,
  };
}

/** The signed-in user's feed. */
posts.get("/feed", requireAuth, async (c) => {
  const user = c.get("user")!;
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 50);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);

  const { results } = await c.env.DB.prepare(FEED_SQL).bind(user.id, limit, offset).all();
  const items = (results ?? []).map((row) => toPostPayload(row as Record<string, unknown>));

  return ok({ posts: items, nextOffset: items.length === limit ? offset + limit : null });
});

/** Create a post. */
posts.post("/posts", requireAuth, async (c) => {
  const user = c.get("user")!;
  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z
    .object({ body: z.string().trim().min(1, "貼文內容不能空白").max(5000, "貼文內容過長") })
    .safeParse(raw.value);

  if (!body.success) return fail(body.error.issues[0]?.message ?? "輸入資料有誤", 400);

  const id = randomToken(16);
  const now = Date.now();
  await c.env.DB.prepare(`INSERT INTO posts (id, user_id, body, created_at) VALUES (?1, ?2, ?3, ?4)`)
    .bind(id, user.id, body.data.body, now)
    .run();

  const row = await c.env.DB.prepare(
    `SELECT p.id, p.body, p.created_at, p.user_id, ${POST_AUTHOR_COLUMNS},
            0 AS like_count, 0 AS comment_count, 0 AS liked_by_me
       FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?1`,
  )
    .bind(id)
    .first<Record<string, unknown>>();

  return ok({ post: toPostPayload(row!) }, 201);
});

/** A single post with its comments. */
posts.get("/posts/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = routeParam(c, "id");

  const row = await c.env.DB.prepare(
    `SELECT p.id, p.body, p.created_at, p.user_id, ${POST_AUTHOR_COLUMNS},
            (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
            (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count,
            EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?2) AS liked_by_me
       FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?1`,
  )
    .bind(id, user.id)
    .first<Record<string, unknown>>();

  if (!row) return fail("找不到這則貼文", 404);

  const commentRows = await c.env.DB.prepare(
    `SELECT cm.id, cm.body, cm.created_at, ${POST_AUTHOR_COLUMNS}
       FROM comments cm JOIN users u ON u.id = cm.user_id
      WHERE cm.post_id = ?1
      ORDER BY cm.created_at ASC, cm.id ASC`,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  const post = toPostPayload(row);
  post.comments = (commentRows.results ?? []).map((r) => ({
    id: String(r.id),
    body: String(r.body),
    createdAt: Number(r.created_at),
    author: authorFromRow(r),
  }));

  return ok({ post });
});

/** Delete your own post. */
posts.delete("/posts/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = routeParam(c, "id");

  const row = await c.env.DB.prepare(`SELECT user_id FROM posts WHERE id = ?1`).bind(id).first<{
    user_id: string;
  }>();
  if (!row) return fail("找不到這則貼文", 404);
  if (row.user_id !== user.id) return fail("只能刪除自己的貼文", 403);

  await c.env.DB.prepare(`DELETE FROM posts WHERE id = ?1`).bind(id).run();
  return ok({ ok: true });
});

/** Like a post. */
posts.post("/posts/:id/like", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = routeParam(c, "id");

  const exists = await c.env.DB.prepare(`SELECT 1 AS x FROM posts WHERE id = ?1`).bind(id).first();
  if (!exists) return fail("找不到這則貼文", 404);

  await c.env.DB.prepare(
    `INSERT INTO likes (user_id, post_id, created_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id, post_id) DO NOTHING`,
  )
    .bind(user.id, id, Date.now())
    .run();

  await notify(c, "like", user.id, id, null);
  return ok({ ok: true });
});

/** Remove a like. */
posts.delete("/posts/:id/like", requireAuth, async (c) => {
  const user = c.get("user")!;
  await c.env.DB.prepare(`DELETE FROM likes WHERE user_id = ?1 AND post_id = ?2`)
    .bind(user.id, routeParam(c, "id"))
    .run();
  return ok({ ok: true });
});

/** Comment on a post. */
posts.post("/posts/:id/comments", requireAuth, async (c) => {
  const user = c.get("user")!;
  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z
    .object({ body: z.string().trim().min(1, "留言不能空白").max(2000, "留言過長") })
    .safeParse(raw.value);

  if (!body.success) return fail(body.error.issues[0]?.message ?? "輸入資料有誤", 400);

  const postId = routeParam(c, "id");
  const exists = await c.env.DB.prepare(`SELECT user_id FROM posts WHERE id = ?1`).bind(postId).first<{
    user_id: string;
  }>();
  if (!exists) return fail("找不到這則貼文", 404);

  const id = randomToken(16);
  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO comments (id, post_id, user_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(id, postId, user.id, body.data.body, now)
    .run();

  await notify(c, "comment", user.id, postId, id);

  const row = await c.env.DB.prepare(
    `SELECT cm.id, cm.body, cm.created_at, ${POST_AUTHOR_COLUMNS}
       FROM comments cm JOIN users u ON u.id = cm.user_id WHERE cm.id = ?1`,
  )
    .bind(id)
    .first<Record<string, unknown>>();

  return ok(
    {
      comment: {
        id: String(row!.id),
        body: String(row!.body),
        createdAt: Number(row!.created_at),
        author: authorFromRow(row!),
      },
    },
    201,
  );
});

/** Delete your own comment. */
posts.delete("/comments/:id", requireAuth, async (c) => {
  const user = c.get("user")!;
  const id = routeParam(c, "id");
  const row = await c.env.DB.prepare(`SELECT user_id FROM comments WHERE id = ?1`).bind(id).first<{
    user_id: string;
  }>();
  if (!row) return fail("找不到這則留言", 404);
  if (row.user_id !== user.id) return fail("只能刪除自己的留言", 403);

  await c.env.DB.prepare(`DELETE FROM comments WHERE id = ?1`).bind(id).run();
  return ok({ ok: true });
});

/**
 * Create a notification for the post author (or comment author).
 * Never notifies the person who triggered it.
 */
async function notify(
  c: { env: WorkerEnv["Bindings"]; get: (k: "user") => { id: string } | null },
  type: "like" | "comment",
  actorId: string,
  postId: string,
  commentId: string | null,
) {
  let recipientId: string | null = null;

  if (type === "like") {
    const row = await c.env.DB.prepare(`SELECT user_id FROM posts WHERE id = ?1`).bind(postId).first<{
      user_id: string;
    }>();
    recipientId = row?.user_id ?? null;
  } else {
    const postRow = await c.env.DB.prepare(`SELECT user_id FROM posts WHERE id = ?1`)
      .bind(postId)
      .first<{ user_id: string }>();
    recipientId = postRow?.user_id ?? null;
  }

  if (!recipientId || recipientId === actorId) return;

  // Rate-limit duplicates: one notification per actor/type/post.
  const existing = await c.env.DB.prepare(
    `SELECT id FROM notifications
      WHERE user_id = ?1 AND actor_id = ?2 AND type = ?3 AND post_id = ?4
        AND created_at > ?5`,
  )
    .bind(recipientId, actorId, type, postId, Date.now() - 60 * 60 * 1000)
    .first<{ id: string }>();

  if (existing) return;

  await c.env.DB.prepare(
    `INSERT INTO notifications (id, user_id, actor_id, type, post_id, comment_id, read_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7)`,
  )
    .bind(randomToken(16), recipientId, actorId, type, postId, commentId, Date.now())
    .run();
}

export { notify };
export default posts;
