import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { ApiError } from "../api";
import { Alert, Button, Input } from "../components/ui";

export default function LoginPage() {
  const { login, googleEnabled } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNeedsVerification(null);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.payload.needsVerification) {
        setNeedsVerification(err.payload.email as string);
      } else {
        setError(err instanceof Error ? err.message : "登入失敗");
      }
    } finally {
      setLoading(false);
    }
  }

  const oauthError = params.get("error");

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
          <h1 className="text-[28px] font-bold text-ink">Facebook Social</h1>
          <p className="mt-1 text-[14px] text-muted">登入以繼續使用你的帳號</p>
        </div>

        <div className="rounded-xl bg-surface p-6 shadow-sm">
          {oauthError && (
            <div className="mb-4">
              <Alert kind="error">
                {oauthError === "google_denied"
                  ? "你取消了 Google 登入。"
                  : "Google 登入失敗，請改用電子郵件登入。"}
              </Alert>
            </div>
          )}

          {needsVerification && (
            <div className="mb-4">
              <Alert kind="info">
                這個信箱還沒驗證。{" "}
                <Link to={`/verify?email=${encodeURIComponent(needsVerification)}`} className="font-semibold underline">
                  前往驗證
                </Link>
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            {error && <Alert kind="error">{error}</Alert>}

            <Button type="submit" size="lg" className="w-full" loading={loading}>
              登入
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
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3Z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 46c6 0 11-2 14.6-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.7-3.9-12.4-9.2H4.3v5.7C7.9 41.3 15.4 46 24 46Z"
                  />
                  <path fill="#FBBC05" d="M11.6 28.1a13 13 0 0 1 0-8.2v-5.7H4.3a22 22 0 0 0 0 19.6l7.3-5.7Z" />
                  <path
                    fill="#EA4335"
                    d="M24 10.7c3.3 0 6.2 1.1 8.5 3.3l6.4-6.4C35 4 30 2 24 2 15.4 2 7.9 6.7 4.3 14.2l7.3 5.7c1.7-5.3 6.6-9.2 12.4-9.2Z"
                  />
                </svg>
                使用 Google 登入
              </a>
            </>
          )}

          <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-[14px]">
            <Link to="/forgot-password" className="text-brand hover:underline">
              忘記密碼？
            </Link>
            <Link to="/register" className="font-semibold text-brand hover:underline">
              建立新帳號
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
