import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Alert, Button, Input } from "../components/ui";

export default function VerifyPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await api.post("/api/auth/verify", { email, code });
      setInfo("驗證成功，正在前往登入…");
      setTimeout(() => navigate("/login"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "驗證失敗");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email) {
      setError("請先輸入電子郵件");
      return;
    }
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const data = await api.post<{ message: string }>("/api/auth/resend-verification", { email });
      setInfo(data.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "寄送失敗");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-sm">
        <h1 className="text-[24px] font-bold text-ink">驗證你的電子郵件</h1>
        <p className="mt-1.5 text-[14px] leading-6 text-muted">
          我們已經把 6 位數驗證碼寄到你的信箱。請在下方輸入驗證碼，或直接點擊信中的連結。
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          <Input
            label="電子郵件"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="驗證碼"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="text-center !text-[20px] font-semibold tracking-[8px]"
          />

          {error && <Alert kind="error">{error}</Alert>}
          {info && <Alert kind="success">{info}</Alert>}

          <Button type="submit" size="lg" className="w-full" loading={loading} disabled={code.length !== 6}>
            驗證
          </Button>
        </form>

        <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-[14px]">
          <button
            onClick={() => void handleResend()}
            disabled={resending}
            className="text-brand hover:underline disabled:opacity-50"
          >
            {resending ? "寄送中…" : "重新寄送驗證信"}
          </button>
          <Link to="/login" className="font-semibold text-brand hover:underline">
            回到登入頁
          </Link>
        </div>
      </div>
    </div>
  );
}
