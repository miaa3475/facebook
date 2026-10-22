import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Post } from "../api";
import PostCard from "../components/PostCard";
import { Alert, Card, Spinner } from "../components/ui";

/**
 * The permalink for a single post. Notifications and comment links point
 * here so a specific post can always be reached directly.
 */
export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<{ post: Post }>(`/api/posts/${id}`)
      .then((data) => {
        setPost(data.post);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "載入貼文失敗"))
      .finally(() => setLoading(false));
  }, [id]);

  // Jump to the comment a notification pointed at.
  useEffect(() => {
    if (!post) return;
    const hash = window.location.hash;
    if (!hash) return;

    const scroll = () => {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
      return false;
    };

    if (scroll()) return;
    const timer = setInterval(() => {
      if (scroll()) clearInterval(timer);
    }, 200);
    const stop = setTimeout(() => clearInterval(timer), 5000);
    return () => {
      clearInterval(timer);
      clearTimeout(stop);
    };
  }, [post]);

  if (loading) {
    return (
      <Card>
        <Spinner label="載入貼文…" />
      </Card>
    );
  }

  if (error || !post) {
    return (
      <div className="space-y-4">
        <Alert kind="error">{error ?? "找不到這則貼文，可能已經被刪除了。"}</Alert>
        <Link to="/" className="inline-block font-semibold text-brand hover:underline">
          ← 回到動態牆
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link to="/" className="inline-block text-[14px] font-semibold text-brand hover:underline">
        ← 回到動態牆
      </Link>
      <PostCard post={post} defaultExpanded />
    </div>
  );
}
