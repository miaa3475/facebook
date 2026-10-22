import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, type FriendUser } from "../api";
import { Alert, Avatar, Button, Card, EmptyState, Input, Spinner } from "../components/ui";

export default function FriendsPage() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";

  const [search, setSearch] = useState(query);
  const [results, setResults] = useState<FriendUser[]>([]);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [requests, setRequests] = useState<FriendUser[]>([]);
  const [sent, setSent] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFriends = useCallback(async () => {
    try {
      const data = await api.get<{ friends: FriendUser[]; requests: FriendUser[]; sent: FriendUser[] }>(
        "/api/friends",
      );
      setFriends(data.friends);
      setRequests(data.requests);
      setSent(data.sent);
    } catch {
      // handled by the empty state
    } finally {
      setLoading(false);
    }
  }, []);

  const runSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const data = await api.get<{ users: FriendUser[] }>(`/api/users?q=${encodeURIComponent(q)}`);
      setResults(data.users);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "搜尋失敗");
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    void loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    if (query) void runSearch(query);
  }, [query, runSearch]);

  async function sendRequest(user: FriendUser) {
    try {
      const data = await api.post<{ status: string }>(`/api/friends/${user.id}`);
      setResults((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, relationship: data.status as FriendUser["relationship"] } : u)),
      );
      await loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    }
  }

  async function acceptRequest(user: FriendUser) {
    try {
      await api.post(`/api/friends/${user.id}/accept`);
      await loadFriends();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    }
  }

  async function removeFriend(user: FriendUser) {
    try {
      await api.delete(`/api/friends/${user.id}`);
      await loadFriends();
      setResults((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, relationship: "none" as const } : u)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    }
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = search.trim();
    setParams(q ? { q } : {});
    if (!q) {
      setResults([]);
      return;
    }
    void runSearch(q);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h1 className="mb-3 text-[20px] font-bold text-ink">好友</h1>
        <form onSubmit={submitSearch} className="flex items-end gap-3">
          <div className="flex-1">
            <Input
              label="搜尋"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="用姓名或電子郵件搜尋人"
            />
          </div>
          <Button type="submit" loading={searching}>
            搜尋
          </Button>
        </form>
      </Card>

      {error && <Alert kind="error">{error}</Alert>}

      {query && (
        <Card className="p-4">
          <h2 className="mb-3 text-[16px] font-semibold text-ink">搜尋結果</h2>
          {searching ? (
            <Spinner label="搜尋中…" />
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-muted">找不到符合「{query}」的使用者</p>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  onAdd={() => void sendRequest(user)}
                  onRemove={() => void removeFriend(user)}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      {requests.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-[16px] font-semibold text-ink">好友邀請（{requests.length}）</h2>
          <ul className="divide-y divide-line">
            {requests.map((user) => (
              <li key={user.id} className="flex items-center gap-3 py-3">
                <Link to={`/profile/${user.id}`}>
                  <Avatar user={user} size={44} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/profile/${user.id}`} className="font-semibold text-ink hover:underline">
                    {user.name}
                  </Link>
                  <p className="text-[13px] text-muted">{user.friendCount ?? 0} 位好友</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void acceptRequest(user)}>
                    接受
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void removeFriend(user)}>
                    忽略
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sent.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-[16px] font-semibold text-ink">已送出的邀請</h2>
          <ul className="divide-y divide-line">
            {sent.map((user) => (
              <li key={user.id} className="flex items-center gap-3 py-3">
                <Link to={`/profile/${user.id}`}>
                  <Avatar user={user} size={44} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link to={`/profile/${user.id}`} className="font-semibold text-ink hover:underline">
                    {user.name}
                  </Link>
                  <p className="text-[13px] text-muted">等待對方回覆</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => void removeFriend(user)}>
                  取消
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">我的好友（{friends.length}）</h2>
        {loading ? (
          <Spinner />
        ) : friends.length === 0 ? (
          <EmptyState title="還沒有好友" description="用上方的搜尋找找人，開始建立你的好友圈。" />
        ) : (
          <ul className="divide-y divide-line">
            {friends.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onRemove={() => void removeFriend(user)}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function UserRow({
  user,
  onAdd,
  onRemove,
}: {
  user: FriendUser;
  onAdd?: () => void;
  onRemove?: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Link to={`/profile/${user.id}`}>
        <Avatar user={user} size={44} />
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/profile/${user.id}`} className="font-semibold text-ink hover:underline">
          {user.name}
        </Link>
        <p className="truncate text-[13px] text-muted">
          {user.friendCount ?? 0} 位好友{user.bio ? ` · ${user.bio}` : ""}
        </p>
      </div>
      {user.relationship === "none" && onAdd && (
        <Button size="sm" onClick={onAdd}>
          加好友
        </Button>
      )}
      {user.relationship === "request_sent" && (
        <span className="text-[13px] font-medium text-muted">已送出邀請</span>
      )}
      {user.relationship === "request_received" && (
        <span className="text-[13px] font-medium text-brand">待你回覆</span>
      )}
      {user.relationship === "friends" && onRemove && (
        <Button size="sm" variant="secondary" onClick={onRemove}>
          解除好友
        </Button>
      )}
    </li>
  );
}
