import { Hono } from "hono";
import { z } from "zod";
import type { WorkerEnv } from "../types.ts";
import { toPublicUser, type PublicUser, type User } from "../types.ts";
import { fail, ok, readJson, routeParam } from "../lib/http.ts";
import { randomToken } from "../lib/crypto.ts";
import { requireAuth } from "../auth.ts";
import { llmConfig, LlmError, OpenCodeClient } from "../lib/llm.ts";
import { fallbackReply, npcSystemPrompt, type NpcProfile } from "../npc.ts";

const chat = new Hono<WorkerEnv>();

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

/** Load a user, including the NPC flag. */
async function loadUser(db: D1Database, id: string): Promise<(User & { isNpc: boolean }) | null> {
  const row = await db.prepare(`SELECT * FROM users WHERE id = ?1`).bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    id: String(row.id),
    email: String(row.email),
    name: String(row.name),
    passwordHash: row.password_hash === null || row.password_hash === undefined ? null : String(row.password_hash),
    avatarColor: String(row.avatar_color ?? "#1877f2"),
    bio: String(row.bio ?? ""),
    emailVerified: Number(row.email_verified ?? 0) === 1,
    createdAt: Number(row.created_at ?? 0),
    isNpc: Number(row.is_npc ?? 0) === 1,
  };
}

/** Store the pair with the lower id first so UNIQUE(user_a_id, user_b_id) holds. */
function orderPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function conversationId(a: string, b: string): string {
  const [low, high] = orderPair(a, b);
  return `conv_${low}_${high}`;
}

/** How the conversation is displayed for the signed-in user. */
interface ConversationPayload {
  id: string;
  peer: PublicUser;
  peerIsNpc: boolean;
  lastMessage: { body: string; createdAt: number; senderId: string } | null;
  unread: number;
  updatedAt: number;
}

/**
 * List the signed-in user's conversations, newest activity first.
 */
chat.get("/chat/conversations", requireAuth, async (c) => {
  const me = c.get("user")!;

  const rows = await c.env.DB.prepare(
    `SELECT cv.id, cv.updated_at, cv.llm_session_id,
            ${USER_COLUMNS},
            (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = cv.id AND m.read_at IS NULL AND m.sender_id != ?1) AS unread,
            (SELECT m.body FROM messages m WHERE m.conversation_id = cv.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_body,
            (SELECT m.sender_id FROM messages m WHERE m.conversation_id = cv.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_sender,
            (SELECT m.created_at FROM messages m WHERE m.conversation_id = cv.id
              ORDER BY m.created_at DESC LIMIT 1) AS last_created,
            (SELECT u.is_npc FROM users u WHERE u.id =
              CASE WHEN cv.user_a_id = ?1 THEN cv.user_b_id ELSE cv.user_a_id END) AS peer_is_npc
       FROM conversations cv
       JOIN users u ON u.id = CASE WHEN cv.user_a_id = ?1 THEN cv.user_b_id ELSE cv.user_a_id END
      WHERE cv.user_a_id = ?1 OR cv.user_b_id = ?1
      ORDER BY cv.updated_at DESC`,
  )
    .bind(me.id)
    .all<Record<string, unknown>>();

  const conversations: ConversationPayload[] = (rows.results ?? []).map((row) => ({
    id: String(row.id),
    peer: authorFromRow(row),
    peerIsNpc: Number(row.peer_is_npc ?? 0) === 1,
    lastMessage: row.last_body
      ? {
          body: String(row.last_body),
          createdAt: Number(row.last_created ?? 0),
          senderId: String(row.last_sender ?? ""),
        }
      : null,
    unread: Number(row.unread ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }));

  return ok({ conversations });
});

/**
 * Start (or reuse) a conversation with another user.
 */
chat.post("/chat/conversations", requireAuth, async (c) => {
  const me = c.get("user")!;
  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z.object({ userId: z.string().min(1) }).safeParse(raw.value);
  if (!body.success) return fail("請指定要聊天的對象", 400);

  const otherId = body.data.userId;
  if (otherId === me.id) return fail("不能跟自己聊天", 400);

  const other = await loadUser(c.env.DB, otherId);
  if (!other) return fail("找不到這個使用者", 404);

  const id = conversationId(me.id, otherId);
  const now = Date.now();

  await c.env.DB.prepare(
    `INSERT INTO conversations (id, user_a_id, user_b_id, llm_session_id, created_at, updated_at)
     VALUES (?1, ?2, ?3, NULL, ?4, ?4)
     ON CONFLICT(user_a_id, user_b_id) DO NOTHING`,
  )
    .bind(id, ...orderPair(me.id, otherId), now)
    .run();

  const conversation = await c.env.DB.prepare(`SELECT * FROM conversations WHERE id = ?1`)
    .bind(id)
    .first<Record<string, unknown>>();

  return ok({
    conversation: {
      id,
      peer: toPublicUser(other),
      peerIsNpc: other.isNpc,
      lastMessage: null,
      unread: 0,
      updatedAt: Number(conversation?.updated_at ?? now),
    },
  });
});

/**
 * Read a conversation. Also marks the incoming messages as read.
 */
chat.get("/chat/conversations/:id", requireAuth, async (c) => {
  const me = c.get("user")!;
  const id = routeParam(c, "id");

  const conversation = await c.env.DB.prepare(
    `SELECT * FROM conversations WHERE id = ?1 AND (user_a_id = ?2 OR user_b_id = ?2)`,
  )
    .bind(id, me.id)
    .first<Record<string, unknown>>();

  if (!conversation) return fail("找不到這個對話", 404);

  const peerId =
    String(conversation.user_a_id) === me.id ? String(conversation.user_b_id) : String(conversation.user_a_id);
  const peer = await loadUser(c.env.DB, peerId);

  const messages = await c.env.DB.prepare(
    `SELECT m.id, m.body, m.created_at, m.sender_id, ${USER_COLUMNS}
       FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = ?1
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 200`,
  )
    .bind(id)
    .all<Record<string, unknown>>();

  await c.env.DB.prepare(
    `UPDATE messages SET read_at = ?1 WHERE conversation_id = ?2 AND read_at IS NULL AND sender_id != ?3`,
  )
    .bind(Date.now(), id, me.id)
    .run();

  return ok({
    conversation: {
      id,
      peer: peer ? toPublicUser(peer) : null,
      peerIsNpc: peer?.isNpc ?? false,
      updatedAt: Number(conversation.updated_at ?? 0),
    },
    messages: (messages.results ?? []).map((row) => ({
      id: String(row.id),
      body: String(row.body),
      createdAt: Number(row.created_at),
      senderId: String(row.sender_id),
      mine: String(row.sender_id) === me.id,
      author: authorFromRow(row),
    })),
  });
});

/**
 * Send a message.
 *
 * When the recipient is an NPC the reply is generated in the background, so
 * the response returns straight away and the client polls for the answer.
 */
chat.post("/chat/conversations/:id/messages", requireAuth, async (c) => {
  const me = c.get("user")!;
  const id = routeParam(c, "id");

  const raw = await readJson(c);
  if (!raw.ok) return fail(raw.message, 400);

  const body = z
    .object({ body: z.string().trim().min(1, "訊息不能空白").max(2000, "訊息過長") })
    .safeParse(raw.value);
  if (!body.success) return fail(body.error.issues[0]?.message ?? "輸入資料有誤", 400);

  const conversation = await c.env.DB.prepare(
    `SELECT * FROM conversations WHERE id = ?1 AND (user_a_id = ?2 OR user_b_id = ?2)`,
  )
    .bind(id, me.id)
    .first<Record<string, unknown>>();

  if (!conversation) return fail("找不到這個對話", 404);

  const peerId =
    String(conversation.user_a_id) === me.id ? String(conversation.user_b_id) : String(conversation.user_a_id);
  const peer = await loadUser(c.env.DB, peerId);
  if (!peer) return fail("找不到這個使用者", 404);

  const now = Date.now();
  const messageId = randomToken(16);

  await c.env.DB.prepare(
    `INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(messageId, id, me.id, body.data.body, now)
    .run();
  await c.env.DB.prepare(`UPDATE conversations SET updated_at = ?1 WHERE id = ?2`).bind(now, id).run();

  // Generate the NPC answer in the background.
  if (peer.isNpc) {
    const task = generateNpcReply(c.env, id, peer, me.name).catch((err) => {
      console.error("[chat] NPC reply failed:", err);
    });
    try {
      c.executionCtx.waitUntil(task);
    } catch {
      // No execution context (some runtimes) — just let it run.
      void task;
    }
  }

  return ok(
    {
      message: {
        id: messageId,
        body: body.data.body,
        createdAt: now,
        senderId: me.id,
        mine: true,
        author: toPublicUser(me),
      },
    },
    201,
  );
});

/**
 * Produce the NPC's reply and store it.
 */
async function generateNpcReply(
  env: WorkerEnv["Bindings"],
  conversationId: string,
  npc: NpcProfile,
  otherName: string,
): Promise<void> {
  const config = llmConfig(env);
  let reply: string | null = null;

  if (config) {
    const client = new OpenCodeClient(config);
    try {
      const conversation = await env.DB.prepare(`SELECT llm_session_id FROM conversations WHERE id = ?1`)
        .bind(conversationId)
        .first<{ llm_session_id: string | null }>();

      // The stored id is prefixed with the agent so a session created before
      // the agent existed is not reused.
      let sessionId: string | null = null;
      let usedAgent = false;

      const stored = conversation?.llm_session_id ?? null;
      if (stored) {
        const separator = stored.indexOf("::");
        if (separator > 0) {
          const storedAgent = stored.slice(0, separator);
          sessionId = stored.slice(separator + 2);
          usedAgent = storedAgent === config.agent;
        } else {
          sessionId = stored;
          usedAgent = false;
        }
      }

      if (!sessionId) {
        // The agent carries the NPC's persona, so it is chosen when the
        // session is created.
        const agents = await client.agents();
        usedAgent = Boolean(config.agent && agents.includes(config.agent));
        const agent = usedAgent ? config.agent : undefined;
        sessionId = await client.createSession(agent);
        await env.DB.prepare(`UPDATE conversations SET llm_session_id = ?1 WHERE id = ?2`)
          .bind(usedAgent ? `${config.agent}::${sessionId}` : sessionId, conversationId)
          .run();
      }

      const recent = await env.DB.prepare(
        `SELECT body FROM messages
          WHERE conversation_id = ?1 AND sender_id != ?2
          ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(conversationId, npc.id)
        .first<{ body: string }>();

      // Without the agent there is no persona, so it goes into the message.
      const text = usedAgent
        ? (recent?.body ?? "你好！")
        : `${npcSystemPrompt(npc, otherName)}\n\n${recent?.body ?? "你好！"}`;

      // Sending a model would make the server drop the agent's persona.
      const previous = await client.prompt(sessionId, text, { withModel: !usedAgent });
      reply = await client.waitForReply(sessionId, previous);    } catch (err) {
      if (err instanceof LlmError) console.error("[chat] opencode error:", err.message);
      else console.error("[chat] opencode error:", err);
    }
  }

  if (!reply) {
    // Fall back to a canned answer so the conversation still moves on.
    const last = await env.DB.prepare(
      `SELECT body FROM messages
        WHERE conversation_id = ?1 AND sender_id != ?2
        ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(conversationId, npc.id)
      .first<{ body: string }>();
    reply = fallbackReply(last?.body ?? "");
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
  )
    .bind(randomToken(16), conversationId, npc.id, reply, now)
    .run();
  await env.DB.prepare(`UPDATE conversations SET updated_at = ?1 WHERE id = ?2`).bind(now, conversationId).run();
}

/** Whether a language model is configured and reachable. */
chat.get("/chat/status", requireAuth, async (c) => {
  const config = llmConfig(c.env);
  if (!config) {
    return ok({ llm: false, reachable: false, model: null });
  }

  const client = new OpenCodeClient(config);
  const reachable = await client.healthy();
  return ok({
    llm: true,
    reachable,
    model: config.model ? `${config.model.providerID}/${config.model.modelID}` : null,
  });
});

export default chat;
