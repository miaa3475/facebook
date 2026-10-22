import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api, type AppNotification } from "../api";
import { Avatar, Button } from "./ui";

function NavItem({ to, children, badge }: { to: string; children: React.ReactNode; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center justify-between rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors ${
          isActive ? "bg-brand-light text-brand" : "text-ink hover:bg-[#e4e6eb]"
        }`
      }
    >
      <span>{children}</span>
      {badge ? (
        <span className="rounded-full bg-[#f3425f] px-2 py-0.5 text-[11px] font-bold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </NavLink>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  async function loadUnread() {
    try {
      const data = await api.get<{ unread: number }>("/api/notifications");
      setUnread(data.unread);
    } catch {
      // ignore — the badge is not important enough to surface an error
    }
  }

  useEffect(() => {
    void loadUnread();
    const timer = setInterval(() => void loadUnread(), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-full bg-canvas">
      <header className="sticky top-0 z-50 bg-surface shadow-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-[18px] font-bold text-white"
              aria-hidden="true"
            >
              f
            </span>
            <span className="hidden text-[18px] font-bold text-ink sm:block">Facebook Social</span>
          </Link>

          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q");
              if (typeof q === "string" && q.trim()) {
                navigate(`/friends?q=${encodeURIComponent(q.trim())}`);
              }
            }}
          >
            <input
              name="q"
              type="search"
              placeholder="搜尋朋友"
              aria-label="搜尋朋友"
              className="h-9 w-full max-w-sm rounded-full bg-[#f0f2f5] px-4 text-[14px] outline-none focus:ring-2 focus:ring-brand/30"
            />
          </form>

          <nav className="flex items-center gap-1">
            <NavLink
              to="/friends"
              className={({ isActive }) =>
                `hidden h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold hover:bg-[#e4e6eb] sm:flex ${
                  isActive ? "text-brand" : "text-muted"
                }`
              }
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d="M23 21v-2a4 4 0 0 0-3-3.87"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M16 3.13a4 4 0 0 1 0 7.75"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              好友
            </NavLink>
            <NavLink
              to="/chat"
              className={({ isActive }) =>
                `hidden h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold hover:bg-[#e4e6eb] sm:flex ${
                  isActive ? "text-brand" : "text-muted"
                }`
              }
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              聊天
            </NavLink>
            <NavLink
              to="/notifications"
              className={({ isActive }) =>
                `relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#e4e6eb] ${
                  isActive ? "text-brand" : "text-muted"
                }`
              }
              aria-label={`通知${unread ? `，${unread} 則未讀` : ""}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#f3425f] px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </NavLink>

            {user && (
              <div className="ml-1 flex items-center gap-2">
                <Link to={`/profile/${user.id}`} aria-label="我的個人頁面">
                  <Avatar user={user} size={32} />
                </Link>
                <Button variant="ghost" size="sm" onClick={() => void handleLogout()}>
                  登出
                </Button>
              </div>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-6">
        <aside className="hidden w-60 shrink-0 md:block">
          <nav className="sticky top-20 space-y-1">
            <NavItem to="/">🏠 動態牆</NavItem>
            <NavItem to="/chat">💬 聊天</NavItem>
            <NavItem to="/friends">👥 好友</NavItem>
            <NavItem to="/notifications">🔔 通知</NavItem>
            {user && <NavItem to={`/profile/${user.id}`}>👤 我的個人頁面</NavItem>}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>

        <aside className="hidden w-72 shrink-0 lg:block">
          <FriendsPeek />
        </aside>
      </div>
    </div>
  );
}

function FriendsPeek() {
  const [friends, setFriends] = useState<{ id: string; name: string; avatarColor: string }[]>([]);

  useEffect(() => {
    api
      .get<{ friends: { id: string; name: string; avatarColor: string }[] }>("/api/friends")
      .then((data) => setFriends(data.friends.slice(0, 8)))
      .catch(() => setFriends([]));
  }, []);

  if (friends.length === 0) return null;

  return (
    <div className="sticky top-20 rounded-xl bg-surface p-4 shadow-sm">
      <h2 className="mb-3 text-[15px] font-semibold text-muted">你的好友</h2>
      <ul className="space-y-1">
        {friends.map((friend) => (
          <li key={friend.id}>
            <Link
              to={`/profile/${friend.id}`}
              className="flex items-center gap-3 rounded-lg p-2 hover:bg-[#f0f2f5]"
            >
              <Avatar user={friend} size={36} />
              <span className="truncate text-[14px] font-medium text-ink">{friend.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
