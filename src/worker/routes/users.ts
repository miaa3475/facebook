import { Hono } from "hono";
import { z } from "zod";
import type { WorkerEnv } from "../types.ts";
import { toPublicUser, type PublicUser } from "../types.ts";
import { fail, ok, readJson, routeParam } from "../lib/http.ts";
import { randomToken } from "../lib/crypto.ts";
import { getUserById, requireAuth } from "../auth.ts";

const users = new Hono<WorkerEnv>();

const USER_COLUMNS = `
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

type Relationship = "none" | "friends" | "request_sent" | "request_received";

/** Relationship between the signed-in user and `otherId`. */
async function relationshipOf(db: D1Database, me: string, other: string): Promise<Relationship> {
  const rows = await db
    .prepare(
      `SELECT requester_id, addressee_id, status FROM friendships
        WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)`,
    )
    .bind(me, other)
    .all<{ requester_id: string; addressee_id: string; status: string }>();

  for (const row of rows.results ?? []) {
    if (row.status === "accepted") return "friends";
    if (row.status === "pending") {
      return row.requester_id === me ? "request_sent" : "request_received";
    }
  }
  return "none";
}

/** Search for people. */
users.get("/users", requireAuth, async (c) => {
  const me = c.get("user")!;
  const query = (c.req.query("q") ?? "").trim();
  const limit = Math.min(Number(c.req.query("limit") ?? 20) || 20, 50);

  const like = `%${query.toLowerCase()}%`;
  const { results } = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS},
            (SELECT COUNT(*) FROM friendships f
              WHERE f.status = 'accepted'
                AND ((f.requester_id = u.id AND f.addressee_id = ?1)
                  OR (f.requester_id = ?1 AND f.addressee_id = u.id))) AS friend_count
       FROM users u
      WHERE u.id != ?1
        AND (?2 = '%%' OR LOWER(u.name) LIKE ?2 OR LOWER(u.email) LIKE ?2)
      ORDER BY u.name COLLATE NOCASE ASC
      LIMIT ?3`,
  )
    .bind(me.id, like, limit)
    .all<Record<string, unknown>>();

  const users = [];
  for (const row of results ?? []) {
    users.push({
      ...authorFromRow(row),
      friendCount: Number(row.friend_count ?? 0),
      relationship: await relationshipOf(c.env.DB, me.id, String(row.a_id)),
    });
  }

  return ok({ users });
});

/** A profile page: the user's info, their posts and their friends. */
users.get("/users/:id", requireAuth, async (c) => {
  const me = c.get("user")!;
  const id = routeParam(c, "id");

  const row = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS},
            (SELECT COUNT(*) FROM friendships f
              WHERE f.status = 'accepted'
                AND ((f.requester_id = u.id AND f.addressee_id = ?2)
                  OR (f.requester_id = ?2 AND f.addressee_id = u.id))) AS friend_count
       FROM users u WHERE u.id = ?1`,
  )
    .bind(id, me.id)
    .first<Record<string, unknown>>();

  if (!row) return fail("找不到這個使用者", 404);

  const postRows = await c.env.DB.prepare(
    `SELECT p.id, p.body, p.created_at, p.user_id, ${USER_COLUMNS},
            (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
            (SELECT COUNT(*) FROM comments cm WHERE cm.post_id = p.id) AS comment_count,
            EXISTS(SELECT 1 FROM likes l2 WHERE l2.post_id = p.id AND l2.user_id = ?2) AS liked_by_me
       FROM posts p JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ?1
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT 50`,
  )
    .bind(id, me.id)
    .all<Record<string, unknown>>();

  const friendRows = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS}
       FROM friendships f JOIN users u ON u.id = f.addressee_id
      WHERE f.requester_id = ?1 AND f.status = 'accepted' AND f.addressee_id != ?1
      ORDER BY u.name COLLATE NOCASE ASC LIMIT 50`,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  return ok({
    user: {
      ...authorFromRow(row),
      friendCount: Number(row.friend_count ?? 0),
      relationship: id === me.id ? "none" : await relationshipOf(c.env.DB, me.id, id),
    },
    posts: (postRows.results ?? []).map((r) => ({
      id: String(r.id),
      body: String(r.body),
      createdAt: Number(r.created_at),
      author: authorFromRow(r),
      likeCount: Number(r.like_count ?? 0),
      commentCount: Number(r.comment_count ?? 0),
      likedByMe: Number(r.liked_by_me ?? 0) === 1,
    })),
    friends: (friendRows.results ?? []).map((r) => authorFromRow(r)),
  });
});

/** Update your own profile. */
users.patch("/users/me", requireAuth, async (c) => {
  const me = c.get("user")!;
  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z
    .object({
      name: z.string().trim().min(2, "姓名至少需要 2 個字元").max(50, "姓名過長").optional(),
      bio: z.string().trim().max(300, "簡介過長").optional(),
    })
    .safeParse(raw.value);

  if (!body.success) return fail(body.error.issues[0]?.message ?? "輸入資料有誤", 400);

  if (body.data.name !== undefined) {
    await c.env.DB.prepare(`UPDATE users SET name = ?1 WHERE id = ?2`).bind(body.data.name, me.id).run();
  }
  if (body.data.bio !== undefined) {
    await c.env.DB.prepare(`UPDATE users SET bio = ?1 WHERE id = ?2`).bind(body.data.bio, me.id).run();
  }

  const updated = await getUserById(c.env.DB, me.id);
  return ok({ user: updated ? toPublicUser(updated) : null });
});

export default users;
export { relationshipOf };
