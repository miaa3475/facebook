/**
 * Thin fetch wrapper around the Worker's JSON API.
 */

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, message: string, payload: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    credentials: "same-origin",
  });

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { error: text };
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, (body.error as string) ?? "請求失敗，請稍後再試", body);
  }

  return body as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  delete: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

// ------------------------------------------------------------------ types

export interface User {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  bio: string;
  emailVerified: boolean;
  createdAt: number;
}

export type Relationship = "none" | "friends" | "request_sent" | "request_received";

export interface FriendUser extends User {
  friendCount?: number;
  relationship?: Relationship;
  requestedAt?: number;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: number;
  author: User;
}

export interface Post {
  id: string;
  body: string;
  createdAt: number;
  author: User;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  comments?: Comment[];
}

export interface AppNotification {
  id: string;
  type: "like" | "comment" | "friend_request";
  postId: string | null;
  commentId: string | null;
  read: boolean;
  createdAt: number;
  actor: User;
  postBody: string | null;
}

export interface ChatMessage {
  id: string;
  body: string;
  createdAt: number;
  senderId: string;
  mine: boolean;
  author: User;
}

export interface Conversation {
  id: string;
  peer: User;
  peerIsNpc: boolean;
  lastMessage: { body: string; createdAt: number; senderId: string } | null;
  unread: number;
  updatedAt: number;
}

// ---------------------------------------------------------------- helpers

/** "3 分鐘前" / "2 小時前" / "2026/10/22" */
export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(ts).toLocaleDateString("zh-TW", { year: "numeric", month: "numeric", day: "numeric" });
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // Handle CJK names by taking the last one or two characters.
  if (/[\u4e00-\u9fff]/.test(trimmed)) return trimmed.slice(-2);
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
