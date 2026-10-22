import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Alert, Button, Input } from "../components/ui";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await api.post<{ message: string }>("/api/auth/forgot-password", { email });
      setMessage(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失敗");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="忘記密碼" subtitle="輸入你的電子郵件，我們會寄送重設連結給你。">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <Input
          label="電子郵件"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
        {error && <Alert kind="error">{error}</Alert>}
        {message && <Alert kind="success">{message}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          寄送重設連結
        </Button>
      </form>
      <div className="mt-4 border-t border-line pt-4 text-center text-[14px]">
        <Link to="/login" className="font-semibold text-brand hover:underline">
          回到登入頁
        </Link>
      </div>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("兩次輸入的密碼不一致");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      navigate("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "重設失敗");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="連結無效" subtitle="這個重設連結不完整，請重新申請。">
        <Link to="/forgot-password" className="block text-center font-semibold text-brand hover:underline">
          重新申請重設連結
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="設定新密碼" subtitle="請輸入一個新的密碼。">
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <Input
          label="新密碼"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 8 個字元"
        />
        <Input
          label="確認新密碼"
          type="password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="再次輸入新密碼"
        />
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          更新密碼
        </Button>
      </form>
    </AuthShell>
  );
}

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span
            className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-[30px] font-bold text-white"
            aria-hidden="true"
          >
            f
          </span>
          <h1 className="text-[28px] font-bold text-ink">{title}</h1>
          <p className="mt-1 text-[14px] text-muted">{subtitle}</p>
        </div>
        <div className="rounded-xl bg-surface p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
