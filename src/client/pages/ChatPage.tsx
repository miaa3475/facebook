import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, timeAgo, type ChatMessage, type Conversation } from "../api";
import { useAuth } from "../auth";
import { Alert, Avatar, Button, Card, Input, Spinner } from "../components/ui";

/**
 * A one-to-one chat thread.
 *
 * When the peer is an NPC the reply is produced in the background by the
 * Worker, so the thread polls for new messages while waiting.
 */
export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<{ conversation: Conversation; messages: ChatMessage[] }>(`/api/chat/conversations/${id}`)
      .then((data) => {
        setConversation(data.conversation);
        setMessages(data.messages);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "載入對話失敗"))
      .finally(() => setLoading(false));
  }, [id]);

  // Poll for new messages. The NPC answers in the background, so the thread
  // has to check back in.
  useEffect(() => {
    if (!id || loading) return;
    let stopped = false;

    const tick = async () => {
      try {
        const data = await api.get<{ messages: ChatMessage[] }>(`/api/chat/conversations/${id}`);
        if (stopped) return;
        setMessages((prev) =>
          prev.length === data.messages.length ? prev : data.messages,
        );
        // Show the typing hint while the NPC has not answered yet.
        const last = data.messages[data.messages.length - 1];
        if (conversation?.peerIsNpc && last && last.senderId !== user?.id) {
          setTyping(false);
        } else if (conversation?.peerIsNpc && last && last.senderId === user?.id) {
          setTyping(true);
        }
      } catch {
        // ignore polling errors
      }
    };

    const timer = setInterval(() => void tick(), 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [id, loading, conversation?.peerIsNpc, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || !id) return;

    setSending(true);
    try {
      const data = await api.post<{ message: ChatMessage }>(`/api/chat/conversations/${id}/messages`, {
        body: text,
      });
      setMessages((prev) => [...prev, data.message]);
      setBody("");
      if (conversation?.peerIsNpc) setTyping(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "傳送失敗");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <Spinner label="載入對話…" />
      </Card>
    );
  }

  if (error && !conversation) {
    return (
      <div className="space-y-4">
        <Alert kind="error">{error}</Alert>
        <Link to="/chat" className="inline-block font-semibold text-brand hover:underline">
          ← 回到聊天列表
        </Link>
      </div>
    );
  }

  const peer = conversation?.peer;

  return (
    <div className="space-y-4">
      <Link to="/chat" className="inline-block text-[14px] font-semibold text-brand hover:underline">
        ← 回到聊天列表
      </Link>

      <Card className="flex h-[70vh] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Avatar user={peer!} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{peer?.name}</p>
            <p className="text-[12px] text-muted">
              {conversation?.peerIsNpc ? "🤖 NPC 角色 · 線上" : "在線"}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto bg-canvas px-4 py-4">
          {messages.length === 0 && (
            <p className="py-10 text-center text-[14px] text-muted">
              這是對話的開始，打個招呼吧 👋
            </p>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[14px] leading-6 ${
                  message.mine
                    ? "rounded-br-md bg-brand text-white"
                    : "rounded-bl-md bg-surface text-ink shadow-sm"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{message.body}</p>
                <p
                  className={`mt-0.5 text-[10px] ${
                    message.mine ? "text-white/70" : "text-muted"
                  }`}
                >
                  {timeAgo(message.createdAt)}
                </p>
              </div>
            </div>
          ))}

          {typing && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-md bg-surface px-4 py-3 shadow-sm">
                <span className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-muted" />
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3">
          <div className="flex-1">
            <Input
              label="訊息"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="輸入訊息…"
              maxLength={2000}
              className="!py-2"
            />
          </div>
          <Button type="submit" loading={sending} disabled={!body.trim()}>
            傳送
          </Button>
        </form>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}
    </div>
  );
}
