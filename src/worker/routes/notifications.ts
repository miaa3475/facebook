import { Hono } from "hono";
import type { WorkerEnv } from "../types.ts";
import { toPublicUser, type PublicUser } from "../types.ts";
import { ok, readJson } from "../lib/http.ts";
import { requireAuth } from "../auth.ts";

const notifications = new Hono<WorkerEnv>();

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

notifications.get("/notifications", requireAuth, async (c) => {
  const me = c.get("user")!;

  const { results } = await c.env.DB.prepare(
    `SELECT n.id, n.type, n.post_id, n.comment_id, n.read_at, n.created_at,
            ${USER_COLUMNS},
            p.body AS post_body
       FROM notifications n
       JOIN users u ON u.id = n.actor_id
       LEFT JOIN posts p ON p.id = n.post_id
      WHERE n.user_id = ?1
      ORDER BY n.created_at DESC
      LIMIT 50`,
  )
    .bind(me.id)
    .all<Record<string, unknown>>();

  const items = (results ?? []).map((row) => ({
    id: String(row.id),
    type: String(row.type),
    postId: row.post_id === null ? null : String(row.post_id),
    commentId: row.comment_id === null ? null : String(row.comment_id),
    read: row.read_at !== null && row.read_at !== undefined,
    createdAt: Number(row.created_at),
    actor: authorFromRow(row),
    postBody: row.post_body === null || row.post_body === undefined ? null : String(row.post_body),
  }));

  const unread = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?1 AND read_at IS NULL`,
  )
    .bind(me.id)
    .first<{ n: number }>();

  return ok({ notifications: items, unread: Number(unread?.n ?? 0) });
});

/** Mark notifications as read. Pass `{ id }` for one, or omit to mark all. */
notifications.post("/notifications/read", requireAuth, async (c) => {
  const me = c.get("user")!;
  const raw = await readJson(c);
  const body = (raw.ok ? raw.value : {}) as { id?: string };

  if (body?.id) {
    await c.env.DB.prepare(
      `UPDATE notifications SET read_at = ?1 WHERE id = ?2 AND user_id = ?3`,
    )
      .bind(Date.now(), body.id, me.id)
      .run();
  } else {
    await c.env.DB.prepare(
      `UPDATE notifications SET read_at = ?1 WHERE user_id = ?2 AND read_at IS NULL`,
    )
      .bind(Date.now(), me.id)
      .run();
  }

  return ok({ ok: true });
});

export default notifications;
