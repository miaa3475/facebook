/**
 * The NPC character.
 *
 * 小雲 AI is an AI friend on the platform. Replies are produced by the
 * OpenCode server (see `lib/llm.ts`); when no language model is reachable
 * the chat falls back to the canned replies below so the UI still works.
 */

export interface NpcProfile {
  id: string;
  name: string;
  bio: string;
}

export function npcSystemPrompt(npc: NpcProfile, otherName: string): string {
  return [
    `你是「${npc.name}」，一個 Facebook 社群 App 裡的 NPC 好友角色。`,
    npc.bio ? `你的簡介是：${npc.bio}` : "",
    "",
    "聊天對象是「" + otherName + "」。",
    "",
    "回覆規則：",
    "- 用對方的語言回覆（預設繁體中文）。",
    "- 像真實好友傳訊息：簡短、口語化，一次 1～3 句。",
    "- 可以用少量 emoji，但不要濫用。",
    "- 不要使用 Markdown（不要 **粗體**、不要 # 標題、不要項目符號）。",
    "- 不要提到「AI」、「語言模型」、「prompt」、「系統」或任何技術細節。",
    "- 不要主動提起貼文、通知或好友邀請，除非對話先提到。",
    "- 如果對話跟社群功能有關，可以自然地聊到動態牆、留言、按讚、聊天等話題。",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Used when no language model is configured or the model is unreachable. */
const FALLBACK_REPLIES = [
  "嗯嗯，我在聽 👀",
  "哈哈，這我有話說！",
  "真的假的？很有意思欸",
  "我剛剛也在想這件事 🤔",
  "好喔好喔，那接下來呢？",
  "我也是這樣覺得～",
  "欸欸，這個我懂！",
  "喔喔原來如此，學到了 😆",
  "這問題不錯耶，你有想過要怎麼做嗎？",
  "欸，這個我有興趣！多說一點～",
  "嗯～我想想喔，感覺可以再聊聊這件事。",
  "懂了懂了！所以重點是對吧～",
];

/**
 * A simple hash so the same message always gets the same reply, while
 * different messages drift apart.
 */
function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

/** Pick a reply for the message the user just sent. */
export function fallbackReply(userMessage: string): string {
  const trimmed = (userMessage ?? "").trim();

  if (!trimmed) return FALLBACK_REPLIES[0];

  // Very short messages get a question back, longer ones get a comment.
  if (trimmed.length <= 4) {
    return ["欸？再說一次～", "嗯？", "喔喔，然後呢？"][hash(trimmed) % 3];
  }

  return FALLBACK_REPLIES[hash(trimmed) % FALLBACK_REPLIES.length];
}
