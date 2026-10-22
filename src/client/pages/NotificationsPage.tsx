import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, timeAgo, type AppNotification } from "../api";
import { Alert, Avatar, Button, Card, EmptyState, Spinner } from "../components/ui";

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ notifications: AppNotification[] }>("/api/notifications")
      .then((data) => {
        setItems(data.notifications);
        // Mark everything as read once the list has been seen.
        void api.post("/api/notifications/read");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "載入通知失敗"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h1 className="text-[20px] font-bold text-ink">通知</h1>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}

      <Card className="p-4">
        {loading ? (
          <Spinner />
        ) : items.length === 0 ? (
          <EmptyState title="沒有新通知" description="有人按讚、留言或加你為好友時，會出現在這裡。" />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-3">
                <Link to={`/profile/${item.actor.id}`}>
                  <Avatar user={item.actor} size={40} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-5 text-ink">
                    <Link to={`/profile/${item.actor.id}`} className="font-semibold hover:underline">
                      {item.actor.name}
                    </Link>{" "}
                    {describe(item)}
                  </p>
                  {item.postBody && (
                    <Link
                      to={postLink(item)}
                      className="mt-1 block truncate rounded-lg bg-[#f0f2f5] px-3 py-1.5 text-[13px] text-muted hover:bg-[#e4e6eb] hover:text-ink"
                    >
                      {item.postBody}
                    </Link>
                  )}
                  <p className="mt-1 flex items-center gap-3 text-[12px] text-muted">
                    <span>{timeAgo(item.createdAt)}</span>
                    {item.postId && (
                      <Link to={postLink(item)} className="font-semibold text-brand hover:underline">
                        查看貼文 →
                      </Link>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function describe(item: AppNotification): string {
  switch (item.type) {
    case "like":
      return "讚了你的貼文。";
    case "comment":
      return "留言在你的貼文。";
    case "friend_request":
      return "邀請你加入好友。";
    default:
      return "和你的動態有關。";
  }
}

/**
 * Where a notification points to. Comment notifications jump straight to the
 * comment that triggered them, everything else goes to the post itself.
 */
function postLink(item: AppNotification): string {
  if (!item.postId) return "/notifications";
  return item.type === "comment" && item.commentId
    ? `/post/${item.postId}#comment-${item.commentId}`
    : `/post/${item.postId}`;
}
