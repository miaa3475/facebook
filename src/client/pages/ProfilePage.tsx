import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type FriendUser, type Post, type User } from "../api";
import { useAuth } from "../auth";
import PostCard from "../components/PostCard";
import { Alert, Avatar, Button, Card, EmptyState, Spinner } from "../components/ui";

interface Profile {
  user: FriendUser;
  posts: Post[];
  friends: User[];
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me, setUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [name, setName] = useState("");

  const isMe = me?.id === id;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get<Profile>(`/api/users/${id}`)
      .then((data) => {
        setProfile(data);
        setBio(data.user.bio);
        setName(data.user.name);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "載入失敗"))
      .finally(() => setLoading(false));
  }, [id]);

  async function addFriend() {
    if (!profile) return;
    setBusy(true);
    try {
      const data = await api.post<{ status: string }>(`/api/friends/${profile.user.id}`);
      setProfile({ ...profile, user: { ...profile.user, relationship: data.status as FriendUser["relationship"] } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  async function acceptFriend() {
    if (!profile) return;
    setBusy(true);
    try {
      await api.post(`/api/friends/${profile.user.id}/accept`);
      setProfile({ ...profile, user: { ...profile.user, relationship: "friends" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  async function removeFriend() {
    if (!profile) return;
    setBusy(true);
    try {
      await api.delete(`/api/friends/${profile.user.id}`);
      setProfile({ ...profile, user: { ...profile.user, relationship: "none" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await api.patch<{ user: User }>("/api/users/me", { name, bio });
      setUser(data.user);
      setEditing(false);
      if (profile) {
        setProfile({ ...profile, user: { ...profile.user, name: data.user.name, bio: data.user.bio } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <Spinner />
      </Card>
    );
  }

  if (error && !profile) {
    return <Alert kind="error">{error}</Alert>;
  }

  if (!profile) return null;

  const { user } = profile;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-brand to-[#42b72a]" />
        <div className="px-5 pb-5">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-end gap-4">
              <div className="rounded-full border-4 border-surface">
                <Avatar user={user} size={92} />
              </div>
              <div className="pb-2">
                <h1 className="text-[24px] font-bold text-ink">{user.name}</h1>
                <p className="text-[14px] text-muted">
                  {user.friendCount ?? 0} 位好友 · {profile.posts.length} 則貼文
                </p>
              </div>
            </div>

            <div className="flex gap-2 pb-2">
              {isMe ? (
                <Button variant="secondary" onClick={() => setEditing((v) => !v)}>
                  {editing ? "取消" : "編輯個人資料"}
                </Button>
              ) : user.relationship === "none" ? (
                <Button onClick={() => void addFriend()} loading={busy}>
                  加好友
                </Button>
              ) : user.relationship === "request_sent" ? (
                <Button variant="secondary" onClick={() => void removeFriend()} loading={busy}>
                  取消邀請
                </Button>
              ) : user.relationship === "request_received" ? (
                <Button onClick={() => void acceptFriend()} loading={busy}>
                  接受邀請
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void removeFriend()} loading={busy}>
                  解除好友
                </Button>
              )}
            </div>
          </div>

          {user.bio && !editing && (
            <p className="mt-3 text-[14px] leading-6 text-ink">{user.bio}</p>
          )}

          {editing && (
            <form onSubmit={saveProfile} className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-muted">姓名</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={2}
                  maxLength={50}
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-[15px] outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-muted">簡介</label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={3}
                  maxLength={300}
                  className="w-full resize-none rounded-lg border border-line px-3 py-2.5 text-[15px] outline-none focus:border-brand"
                />
              </div>
              <Button type="submit" loading={busy}>
                儲存
              </Button>
            </form>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-[16px] font-semibold text-ink">貼文</h2>
        {profile.posts.length === 0 ? (
          <EmptyState title="還沒有貼文" />
        ) : (
          <div className="space-y-4">
            {profile.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </Card>

      {profile.friends.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-3 text-[16px] font-semibold text-ink">好友</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {profile.friends.map((friend) => (
              <li key={friend.id}>
                <Link
                  to={`/profile/${friend.id}`}
                  className="flex items-center gap-2.5 rounded-lg p-2 hover:bg-[#f0f2f5]"
                >
                  <Avatar user={friend} size={36} />
                  <span className="truncate text-[14px] font-medium text-ink">{friend.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
