import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, timeAgo, type Comment, type Post } from "../api";
import { useAuth } from "../auth";
import { Avatar, Button, Input } from "./ui";

export default function PostCard({
  post,
  onChange,
  defaultExpanded = false,
}: {
  post: Post;
  onChange?: (updated: Post) => void;
  /** Open the comment thread straight away (used on the permalink page). */
  defaultExpanded?: boolean;
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [comments, setComments] = useState<Comment[]>(post.comments ?? []);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    try {
      const data = await api.get<{ post: Post }>(`/api/posts/${post.id}`);
      setComments(data.post.comments ?? []);
      onChange?.(data.post);
    } catch {
      setError("載入留言失敗");
    } finally {
      setLoadingComments(false);
    }
  }, [post.id, onChange]);

  // Fetch the thread as soon as it is opened.
  useEffect(() => {
    if (expanded && !post.comments) void loadComments();
  }, [expanded, post.comments, loadComments]);

  async function toggleLike() {
    if (!user) return;
    // Optimistic update, reverted if the request fails.
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((n) => n + (nextLiked ? 1 : -1));

    try {
      if (nextLiked) {
        await api.post(`/api/posts/${post.id}/like`);
      } else {
        await api.delete(`/api/posts/${post.id}/like`);
      }
    } catch {
      setLiked(!nextLiked);
      setLikeCount((n) => n + (nextLiked ? -1 : 1));
    }
  }

  async function toggleComments() {
    setExpanded((prev) => !prev);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentBody.trim();
    if (!body) return;

    setSubmitting(true);
    setError(null);
    try {
      const data = await api.post<{ comment: Comment }>(`/api/posts/${post.id}/comments`, { body });
      setComments((prev) => [...prev, data.comment]);
      setCommentBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "留言失敗");
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePost() {
    if (!confirm("確定要刪除這則貼文嗎？")) return;
    try {
      await api.delete(`/api/posts/${post.id}`);
      onChange?.({ ...post, id: "__deleted__" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "刪除失敗");
    }
  }

  return (
    <article className="rounded-xl bg-surface shadow-sm">
      <div className="flex items-start gap-3 p-4 pb-2">
        <Link to={`/profile/${post.author.id}`}>
          <Avatar user={post.author} size={44} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={`/profile/${post.author.id}`}
            className="text-[15px] font-semibold text-ink hover:underline"
          >
            {post.author.name}
          </Link>
          <p className="text-[12px] text-muted">
            <Link to={`/post/${post.id}`} className="hover:underline">
              {timeAgo(post.createdAt)}
            </Link>{" "}
            · 🌐 公開
          </p>
        </div>
        {user?.id === post.author.id && (
          <button
            onClick={() => void deletePost()}
            className="rounded-full p-2 text-muted hover:bg-[#e4e6eb]"
            aria-label="刪除貼文"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      <p className="whitespace-pre-wrap px-4 pb-3 text-[15px] leading-6 text-ink">{post.body}</p>

      <div className="flex items-center justify-between border-t border-line px-4 py-1.5 text-[13px] text-muted">
        <span>{likeCount > 0 ? `👍 ${likeCount}` : ""}</span>
        <button
          onClick={() => void toggleComments()}
          className="py-1 hover:underline"
          aria-expanded={expanded}
        >
          {post.commentCount > 0 ? `${post.commentCount} 則留言` : ""}
        </button>
      </div>

      <div className="flex border-t border-line px-2 py-1">
        <button
          onClick={() => void toggleLike()}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[14px] font-semibold transition-colors hover:bg-[#f0f2f5] ${
            liked ? "text-brand" : "text-muted"
          }`}
          aria-pressed={liked}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill={liked ? "currentColor" : "none"} aria-hidden="true">
            <path
              d="M7 22V11l5-9a2.5 2.5 0 0 1 2.4 3.2L13.5 9H19a2.5 2.5 0 0 1 2.4 3.1l-1.6 8A2.5 2.5 0 0 1 17.4 22H7Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          讚
        </button>
        <button
          onClick={() => void toggleComments()}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[14px] font-semibold text-muted transition-colors hover:bg-[#f0f2f5]"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          留言
        </button>
      </div>

      {expanded && (
        <div className="border-t border-line px-4 py-3">
          {loadingComments && <p className="py-2 text-[13px] text-muted">載入留言中…</p>}

          {comments.length > 0 && (
            <ul className="mb-3 space-y-3">
              {comments.map((comment) => (
                <li
                  key={comment.id}
                  id={`comment-${comment.id}`}
                  className="flex scroll-mt-24 gap-2 rounded-lg transition-colors target:bg-brand-light"
                >
                  <Link to={`/profile/${comment.author.id}`}>
                    <Avatar user={comment.author} size={32} />
                  </Link>
                  <div className="min-w-0 flex-1 rounded-2xl bg-[#f0f2f5] px-3 py-2">
                    <Link
                      to={`/profile/${comment.author.id}`}
                      className="text-[13px] font-semibold text-ink hover:underline"
                    >
                      {comment.author.name}
                    </Link>
                    <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-5 text-ink">
                      {comment.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mb-2 text-[13px] text-[#f3425f]">{error}</p>}

          <form onSubmit={submitComment} className="flex items-center gap-2">
            <Input
              label="留言"
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="寫下你的想法…"
              className="!py-2"
            />
            <Button type="submit" size="sm" loading={submitting} disabled={!commentBody.trim()}>
              送出
            </Button>
          </form>
        </div>
      )}
    </article>
  );
}
