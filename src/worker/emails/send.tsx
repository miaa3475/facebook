import { Resend } from "resend";
import type { ReactElement } from "react";
import type { Env } from "../types.ts";
import {
  PasswordResetEmail,
  VerifyEmail,
  WelcomeEmail,
  type PasswordResetEmailProps,
  type VerifyEmailProps,
  type WelcomeEmailProps,
} from "./templates.tsx";

/**
 * A sender that fails should never break the request that triggered it, so
 * every failure is logged and reported back to the caller as `null`.
 */
export type SendResult = { id: string } | null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Mailer {
  private resend: Resend;
  private from: string;
  private replyTo: string;

  constructor(env: Env) {
    this.resend = new Resend(env.RESEND_API_KEY);
    this.from = env.RESEND_FROM || "Facebook Social <noreply@resend.dev>";
    // Transactional mail should go to a monitored inbox, not a black hole.
    this.replyTo = env.RESEND_REPLY_TO || env.RESEND_FROM || "support@resend.dev";
  }

  /**
   * Send with bounded retries and exponential backoff.
   *
   * `idempotencyKey` follows the Resend convention `<event-type>/<entity-id>`
   * so a retry of the same logical email never delivers twice.
   */
  private async send(
    args: {
      to: string;
      subject: string;
      react: ReactElement;
      idempotencyKey: string;
    },
  ): Promise<SendResult> {
    const attempts = 3;
    let lastError = "unknown error";

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const { data, error } = await this.resend.emails.send(
          {
            from: this.from,
            to: [args.to],
            subject: args.subject,
            react: args.react,
            replyTo: this.replyTo,
          },
          { idempotencyKey: args.idempotencyKey },
        );

        if (error) {
          lastError = error.message;
          // 4xx other than 429 will not succeed on retry.
          const status = "statusCode" in error ? Number(error.statusCode) : 0;
          const retriable = status === 429 || status >= 500;
          console.error(`[mail] attempt ${attempt} failed: ${error.message}`);
          if (!retriable) return null;
        } else if (data) {
          return { id: data.id };
        } else {
          lastError = "empty response";
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        console.error(`[mail] attempt ${attempt} threw: ${lastError}`);
      }

      if (attempt < attempts) await sleep(2 ** attempt * 500);
    }

    console.error(`[mail] giving up on "${args.subject}" to ${args.to}: ${lastError}`);
    return null;
  }

  async sendVerificationEmail(
    to: string,
    props: VerifyEmailProps & { userId: string },
  ): Promise<SendResult> {
    const { userId, ...emailProps } = props;
    return this.send({
      to,
      subject: `驗證你的 ${"Facebook Social"} 電子郵件地址`,
      react: <VerifyEmail {...emailProps} />,
      idempotencyKey: `verify-email/${userId}`,
    });
  }

  async sendWelcomeEmail(to: string, props: WelcomeEmailProps & { userId: string }): Promise<SendResult> {
    const { userId, ...emailProps } = props;
    return this.send({
      to,
      subject: "歡迎加入 Facebook Social",
      react: <WelcomeEmail {...emailProps} />,
      idempotencyKey: `welcome-email/${userId}`,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    props: PasswordResetEmailProps & { userId: string },
  ): Promise<SendResult> {
    const { userId, ...emailProps } = props;
    return this.send({
      to,
      subject: "重設你的 Facebook Social 密碼",
      react: <PasswordResetEmail {...emailProps} />,
      idempotencyKey: `password-reset/${userId}`,
    });
  }
}
