import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Post } from "../api";
import { useAuth } from "../auth";
import PostCard from "../components/PostCard";
import { Alert, Avatar, Button, Card, EmptyState, Spinner } from "../components/ui";

export default function FeedPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);

  // A banner for "you just arrived" moments, cleared on the next navigation.
  const justVerified = params.get("verified") === "1";
  const justSignedInWithGoogle = params.get("google") === "1";

  useEffect(() => {
    if (!justVerified && !justSignedInWithGoogle) return;
    const timer = setTimeout(() => {
      params.delete("verified");
      params.delete("google");
      setParams(params, { replace: true });
    }, 6000);
    return () => clearTimeout(timer);
  }, [justVerified, justSignedInWithGoogle, params, setParams]);

  async function loadFeed(offset = 0, append = false) {
    try {
      const data = await api.get<{ posts: Post[]; nextOffset: number | null }>(
        `/api/feed?limit=15&offset=${offset}`,
      );
      setPosts((prev) => (append ? [...prev, ...data.posts] : data.posts));
      setNextOffset(data.nextOffset);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入動態牆失敗");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void loadFeed(0, false);
  }, []);

  function handleUpdated(updated: Post) {
    if (updated.id === "__deleted__") {
      setPosts((prev) => prev.filter((p) => p.id !== updated.id));
      return;
    }
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }

  return (
    <div className="space-y-4">
      {justSignedInWithGoogle && (
        <Alert kind="success">已使用 Google 帳號登入，歡迎加入！</Alert>
      )}
      {justVerified && <Alert kind="success">信箱驗證完成，歡迎加入！</Alert>}

      {user && <Composer onPosted={(post) => setPosts((prev) => [post, ...prev])} />}

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <Card>
          <Spinner label="載入動態牆…" />
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <EmptyState
            title="你的動態牆是空的"
            description="分享第一則貼文，或加入好友看看他們的近況。"
          />
        </Card>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} onChange={handleUpdated} />)
      )}

      {nextOffset !== null && (
        <div className="flex justify-center py-2">
          <Button
            variant="secondary"
            loading={loadingMore}
            onClick={() => {
              setLoadingMore(true);
              void loadFeed(nextOffset, true);
            }}
          >
            載入更多
          </Button>
        </div>
      )}
    </div>
  );
}

function Composer({ onPosted }: { onPosted: (post: Post) => void }) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;

    setLoading(true);
    setError(null);
    try {
      const data = await api.post<{ post: Post }>("/api/posts", { body: text });
      onPosted(data.post);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "發文失敗");
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit}>
        <div className="flex gap-3">
          <Avatar user={user} size={44} />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="你在想什麼？"
            aria-label="貼文內容"
            rows={3}
            maxLength={5000}
            className="w-full resize-none rounded-2xl bg-[#f0f2f5] px-4 py-3 text-[15px] leading-6 outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/25"
          />
        </div>

        {error && (
          <div className="mt-3">
            <Alert kind="error">{error}</Alert>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
          <span className="text-[12px] text-muted">{body.length} / 5000</span>
          <Button type="submit" loading={loading} disabled={!body.trim()}>
            發佈
          </Button>
        </div>
      </form>
    </Card>
  );
}
