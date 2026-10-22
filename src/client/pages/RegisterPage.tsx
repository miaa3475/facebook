import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";
import { Alert, Button, Input } from "../components/ui";

export default function RegisterPage() {
  const { register, googleEnabled } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await register(name, email, password);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "註冊失敗");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
        <div className="w-full max-w-md rounded-xl bg-surface p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#e4f6e8] text-[26px]">
            ✓
          </div>
          <h1 className="text-[22px] font-bold text-ink">驗證信已寄出</h1>
          <p className="mt-2 text-[14px] leading-6 text-muted">
            我們已經把驗證信寄到 <strong className="text-ink">{email}</strong>。
            <br />
            請點信中的連結，或輸入信中的 6 位數驗證碼。
          </p>
          <Button
            className="mt-5 w-full"
            onClick={() => navigate(`/verify?email=${encodeURIComponent(email)}`)}
          >
            輸入驗證碼
          </Button>
          <Link to="/login" className="mt-3 block text-[14px] text-brand hover:underline">
            回到登入頁
          </Link>
        </div>
      </div>
    );
  }

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
          <h1 className="text-[28px] font-bold text-ink">建立你的帳號</h1>
          <p className="mt-1 text-[14px] text-muted">只需幾秒鐘，就能加入 Facebook Social</p>
        </div>

        <div className="rounded-xl bg-surface p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <Input
              label="姓名"
              name="name"
              required
              minLength={2}
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="王小明"
              hint="朋友會看到這個名字"
            />
            <Input
              label="電子郵件"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <Input
              label="密碼"
              type="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 8 個字元"
            />

            {error && <Alert kind="error">{error}</Alert>}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              建立帳號
            </Button>
          </form>

          {googleEnabled && (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-[13px] text-muted">或</span>
                <span className="h-px flex-1 bg-line" />
              </div>
              <a
                href="/api/auth/google"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white text-[15px] font-semibold text-ink transition-colors hover:bg-[#f0f2f5]"
              >
                使用 Google 註冊
              </a>
            </>
          )}

          <div className="mt-5 border-t border-line pt-4 text-center text-[14px]">
            已經有帳號了？{" "}
            <Link to="/login" className="font-semibold text-brand hover:underline">
              前往登入
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
