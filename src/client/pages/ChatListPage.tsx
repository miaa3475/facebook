import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, timeAgo, type Conversation, type FriendUser } from "../api";
import { Avatar, Button, Card, EmptyState, Input, Spinner } from "../components/ui";

export default function ChatListPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState<string | null>(null);
  const [llm, setLlm] = useState<{ llm: boolean; reachable: boolean; model: string | null } | null>(null);

  async function load() {
    try {
      const [chats, friendList, status] = await Promise.all([
        api.get<{ conversations: Conversation[] }>("/api/chat/conversations"),
        api.get<{ friends: FriendUser[] }>("/api/friends"),
        api.get<{ llm: boolean; reachable: boolean; model: string | null }>("/api/chat/status"),
      ]);
      setConversations(chats.conversations);
      setFriends(friendList.friends);
      setLlm(status);
    } catch {
      // The empty state covers it.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function startChat(userId: string) {
    setStarting(userId);
    try {
      const data = await api.post<{ conversation: Conversation }>("/api/chat/conversations", { userId });
      setConversations((prev) => [data.conversation, ...prev.filter((c) => c.id !== data.conversation.id)]);
    } catch {
      // ignore
    } finally {
      setStarting(null);
    }
  }

  const visible = friends.filter(
    (friend) =>
      !search.trim() ||
      friend.name.toLowerCase().includes(search.trim().toLowerCase()) ||
      friend.email.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[20px] font-bold text-ink">聊天</h1>
          {llm && (
            <span
              className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                llm.reachable
                  ? "bg-[#e4f6e8] text-[#1a7f37]"
                  : llm.llm
                    ? "bg-[#fde7e9] text-[#b3243a]"
                    : "bg-[#f0f2f5] text-muted"
              }`}
              title={
                llm.llm
                  ? `OpenCode：${llm.model ?? "預設模型"}${llm.reachable ? "" : "（無法連線）"}`
                  : "尚未設定語言模型，NPC 會使用內建回覆"
              }
            >
              {llm.reachable
                ? `🤖 AI 已連線${llm.model ? ` · ${llm.model}` : ""}`
                : llm.llm
                  ? "⚠️ AI 無法連線"
                  : "💬 NPC 為內建回覆"}
            </span>
          )}
        </div>
      </Card>

      {loading ? (
        <Card>
          <Spinner label="載入中…" />
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <h2 className="mb-3 text-[16px] font-semibold text-ink">對話</h2>
            {conversations.length === 0 ? (
              <EmptyState
                title="還沒有對話"
                description="從下面挑一位好友開始聊天吧。"
              />
            ) : (
              <ul className="divide-y divide-line">
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <Link
                      to={`/chat/${conversation.id}`}
                      className="flex items-center gap-3 py-3 hover:bg-[#f0f2f5] sm:rounded-lg sm:px-2"
                    >
                      <Avatar user={conversation.peer} size={48} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[15px] font-semibold text-ink">
                            {conversation.peer.name}
                          </span>
                          {conversation.peerIsNpc && (
                            <span className="rounded-full bg-brand-light px-1.5 py-0.5 text-[10px] font-bold text-brand">
                              NPC
                            </span>
                          )}
                          {conversation.unread > 0 && (
                            <span className="rounded-full bg-[#f3425f] px-2 py-0.5 text-[11px] font-bold text-white">
                              {conversation.unread}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[13px] text-muted">
                          {conversation.lastMessage?.body ?? "開始對話"}
                        </p>
                      </div>
                      <span className="shrink-0 text-[12px] text-muted">
                        {conversation.lastMessage
                          ? timeAgo(conversation.lastMessage.createdAt)
                          : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-[16px] font-semibold text-ink">開始新對話</h2>
            <Input
              label="搜尋好友"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="用姓名或電子郵件搜尋"
              className="mb-3"
            />
            {visible.length === 0 ? (
              <p className="py-6 text-center text-[14px] text-muted">沒有符合的好友</p>
            ) : (
              <ul className="divide-y divide-line">
                {visible.map((friend) => (
                  <li key={friend.id} className="flex items-center gap-3 py-3">
                    <Avatar user={friend} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold text-ink">{friend.name}</p>
                      <p className="truncate text-[13px] text-muted">{friend.email}</p>
                    </div>
                    <Button
                      size="sm"
                      loading={starting === friend.id}
                      onClick={() => void startChat(friend.id)}
                    >
                      聊天
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
