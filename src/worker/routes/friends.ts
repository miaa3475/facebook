import { Hono } from "hono";
import type { WorkerEnv } from "../types.ts";
import { toPublicUser, type PublicUser } from "../types.ts";
import { fail, ok, routeParam } from "../lib/http.ts";
import { randomToken } from "../lib/crypto.ts";
import { requireAuth } from "../auth.ts";

const friends = new Hono<WorkerEnv>();

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

/** Friends, incoming requests and outgoing requests. */
friends.get("/friends", requireAuth, async (c) => {
  const me = c.get("user")!;

  const friendRows = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS}
       FROM friendships f JOIN users u ON u.id = f.addressee_id
      WHERE f.requester_id = ?1 AND f.status = 'accepted' AND f.addressee_id != ?1
      ORDER BY u.name COLLATE NOCASE ASC`,
  )
    .bind(me.id)
    .all<Record<string, unknown>>();

  const incomingRows = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS}, f.created_at AS request_created_at
       FROM friendships f JOIN users u ON u.id = f.requester_id
      WHERE f.addressee_id = ?1 AND f.status = 'pending'
      ORDER BY f.created_at DESC`,
  )
    .bind(me.id)
    .all<Record<string, unknown>>();

  const outgoingRows = await c.env.DB.prepare(
    `SELECT ${USER_COLUMNS}, f.created_at AS request_created_at
       FROM friendships f JOIN users u ON u.id = f.addressee_id
      WHERE f.requester_id = ?1 AND f.status = 'pending'
      ORDER BY f.created_at DESC`,
  )
    .bind(me.id)
    .all<Record<string, unknown>>();

  return ok({
    friends: (friendRows.results ?? []).map((r) => authorFromRow(r)),
    requests: (incomingRows.results ?? []).map((r) => ({
      ...authorFromRow(r),
      requestedAt: Number(r.request_created_at ?? 0),
    })),
    sent: (outgoingRows.results ?? []).map((r) => ({
      ...authorFromRow(r),
      requestedAt: Number(r.request_created_at ?? 0),
    })),
  });
});

/** Send a friend request (or accept one that is already pending). */
friends.post("/friends/:id", requireAuth, async (c) => {
  const me = c.get("user")!;
  const otherId = routeParam(c, "id");

  if (otherId === me.id) return fail("不能加自己為好友", 400);

  const other = await c.env.DB.prepare(`SELECT id FROM users WHERE id = ?1`).bind(otherId).first();
  if (!other) return fail("找不到這個使用者", 404);

  const existing = await c.env.DB.prepare(
    `SELECT requester_id, addressee_id, status FROM friendships
      WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)`,
  )
    .bind(me.id, otherId)
    .first<{ requester_id: string; addressee_id: string; status: string }>();

  if (existing?.status === "accepted") return fail("你們已經是好友了", 409);

  // They already asked us — accept straight away.
  if (existing?.status === "pending" && existing.requester_id === otherId) {
    await acceptRequest(c.env.DB, me.id, otherId);
    await createFriendNotification(c.env.DB, otherId, me.id);
    return ok({ ok: true, status: "friends" });
  }

  if (existing?.status === "pending") return fail("你已經送出好友邀請了", 409);

  await c.env.DB.prepare(
    `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at)
     VALUES (?1, ?2, ?3, 'pending', ?4)`,
  )
    .bind(randomToken(16), me.id, otherId, Date.now())
    .run();

  await createFriendNotification(c.env.DB, otherId, me.id);
  return ok({ ok: true, status: "request_sent" }, 201);
});

/** Accept a pending friend request. */
friends.post("/friends/:id/accept", requireAuth, async (c) => {
  const me = c.get("user")!;
  const otherId = routeParam(c, "id");

  const existing = await c.env.DB.prepare(
    `SELECT requester_id FROM friendships
      WHERE requester_id = ?1 AND addressee_id = ?2 AND status = 'pending'`,
  )
    .bind(otherId, me.id)
    .first<{ requester_id: string }>();

  if (!existing) return fail("找不到這筆好友邀請", 404);

  await acceptRequest(c.env.DB, me.id, otherId);
  await createFriendNotification(c.env.DB, otherId, me.id);

  return ok({ ok: true, status: "friends" });
});

/** Unfriend, or cancel a request you sent. */
friends.delete("/friends/:id", requireAuth, async (c) => {
  const me = c.get("user")!;
  const otherId = routeParam(c, "id");

  await c.env.DB.prepare(
    `DELETE FROM friendships
      WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)`,
  )
    .bind(me.id, otherId)
    .run();

  return ok({ ok: true, status: "none" });
});

/** Store the friendship in both directions so queries stay simple. */
async function acceptRequest(db: D1Database, meId: string, otherId: string) {
  const now = Date.now();
  await db
    .prepare(
      `DELETE FROM friendships
        WHERE (requester_id = ?1 AND addressee_id = ?2) OR (requester_id = ?2 AND addressee_id = ?1)`,
    )
    .bind(meId, otherId)
    .run();

  await db.batch([
    db
      .prepare(
        `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at)
         VALUES (?1, ?2, ?3, 'accepted', ?4)`,
      )
      .bind(randomToken(16), meId, otherId, now),
    db
      .prepare(
        `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at)
         VALUES (?1, ?2, ?3, 'accepted', ?4)`,
      )
      .bind(randomToken(16), otherId, meId, now),
  ]);
}

async function createFriendNotification(db: D1Database, recipientId: string, actorId: string) {
  const recent = await db
    .prepare(
      `SELECT id FROM notifications
        WHERE user_id = ?1 AND actor_id = ?2 AND type = 'friend_request'
          AND created_at > ?3`,
    )
    .bind(recipientId, actorId, Date.now() - 60 * 60 * 1000)
    .first<{ id: string }>();

  if (recent) return;

  await db
    .prepare(
      `INSERT INTO notifications (id, user_id, actor_id, type, post_id, comment_id, read_at, created_at)
       VALUES (?1, ?2, ?3, 'friend_request', NULL, NULL, NULL, ?4)`,
    )
    .bind(randomToken(16), recipientId, actorId, Date.now())
    .run();
}

export default friends;
