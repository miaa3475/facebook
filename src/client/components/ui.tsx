import type { ReactNode } from "react";
import { initials, type User } from "../api";

/** A coloured circle with the user's initials — no image hosting needed. */
export function Avatar({
  user,
  size = 40,
  className = "",
}: {
  user: Pick<User, "name" | "avatarColor">;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: user.avatarColor,
        fontSize: Math.round(size * 0.38),
      }}
      aria-hidden="true"
    >
      {initials(user.name)}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark disabled:bg-brand/50",
    secondary: "bg-[#e4e6eb] text-ink hover:bg-[#d8dadf] disabled:opacity-50",
    ghost: "bg-transparent text-muted hover:bg-[#e4e6eb] disabled:opacity-50",
    danger: "bg-[#f3425f] text-white hover:bg-[#d63b55] disabled:opacity-50",
  } as const;

  const sizes = {
    sm: "h-8 px-3 text-[13px]",
    md: "h-10 px-4 text-[15px]",
    lg: "h-12 px-6 text-[16px]",
  } as const;

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading && (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}

export function Input({
  label,
  error,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-muted">{label}</span>
      <input
        {...props}
        className={`w-full rounded-lg border bg-white px-3 py-2.5 text-[15px] text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 ${
          error ? "border-[#f3425f]" : "border-line"
        } ${props.className ?? ""}`}
        aria-invalid={error ? true : undefined}
      />
      {error ? (
        <span className="mt-1 block text-[12px] text-[#f3425f]">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-surface shadow-sm ${className}`}>{children}</div>;
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-[17px] font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-[14px] text-muted">{description}</p>}
    </div>
  );
}

export function Spinner({ label = "載入中" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-muted" role="status">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent"
        aria-hidden="true"
      />
      <span className="text-[14px]">{label}</span>
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "success" | "info"; children: ReactNode }) {
  const styles = {
    error: "bg-[#fde7e9] text-[#b3243a] border-[#f5b8c0]",
    success: "bg-[#e4f6e8] text-[#1a7f37] border-[#b7e0c2]",
    info: "bg-brand-light text-[#0b5fd0] border-[#bcd7ff]",
  } as const;

  return (
    <div
      className={`rounded-lg border px-3.5 py-2.5 text-[14px] ${styles[kind]}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
