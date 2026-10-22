import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactElement } from "react";

/**
 * Brand palette. Facebook blue, with the neutrals used throughout the app.
 */
export const BRAND = {
  blue: "#1877f2",
  blueDark: "#0b5fd0",
  text: "#1c1e21",
  muted: "#606770",
  border: "#dfe1e5",
  bg: "#f0f2f5",
  white: "#ffffff",
  code: "#0f1419",
} as const;

export const APP_NAME = "Facebook Social";

interface LayoutProps {
  preview: string;
  children: ReactElement | ReactElement[];
}

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="zh-Hant" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: BRAND.bg,
          margin: 0,
          padding: "24px 12px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans TC", sans-serif',
        }}
      >
        <Container
          style={{
            backgroundColor: BRAND.white,
            maxWidth: "600px",
            margin: "0 auto",
            borderRadius: "12px",
            border: `1px solid ${BRAND.border}`,
            overflow: "hidden",
          }}
        >
          {children}
        </Container>
      </Body>
    </Html>
  );
}

export function Header({ subtitle }: { subtitle: string }) {
  return (
    <Section style={{ backgroundColor: BRAND.blue, padding: "28px 32px" }}>
      <Heading
        as="h1"
        style={{
          color: BRAND.white,
          fontSize: "24px",
          lineHeight: "30px",
          fontWeight: 700,
          margin: 0,
        }}
      >
        {APP_NAME}
      </Heading>
      <Text style={{ color: "#dbeafe", fontSize: "15px", lineHeight: "22px", margin: "6px 0 0" }}>
        {subtitle}
      </Text>
    </Section>
  );
}

export function Footer({ supportEmail }: { supportEmail: string }) {
  return (
    <Section style={{ padding: "20px 32px 28px" }}>
      <Hr style={{ borderColor: BRAND.border, borderStyle: "solid", margin: "0 0 16px" }} />
      <Text style={{ color: BRAND.muted, fontSize: "13px", lineHeight: "20px", margin: "0 0 8px" }}>
        如果您沒有申請帳號，請忽略這封信，您的信箱不會被改動。
      </Text>
      <Text style={{ color: BRAND.muted, fontSize: "13px", lineHeight: "20px", margin: 0 }}>
        需要協助嗎？請回覆此信或聯絡{" "}
        <Link href={`mailto:${supportEmail}`} style={{ color: BRAND.blue }}>
          {supportEmail}
        </Link>
        。
      </Text>
    </Section>
  );
}

export function PrimaryButton({ href, children }: { href: string; children: string }) {
  return (
    <Button
      href={href}
      style={{
        boxSizing: "border-box",
        display: "block",
        width: "100%",
        backgroundColor: BRAND.blue,
        color: BRAND.white,
        fontSize: "16px",
        fontWeight: 600,
        lineHeight: "20px",
        padding: "14px 24px",
        borderRadius: "8px",
        textDecoration: "none",
        textAlign: "center",
      }}
    >
      {children}
    </Button>
  );
}

/** Large, copyable one-time code block. */
export function CodeBlock({ code }: { code: string }) {
  return (
    <Section style={{ padding: "8px 32px 0" }}>
      <Text
        style={{
          color: BRAND.text,
          fontSize: "15px",
          lineHeight: "22px",
          margin: "0 0 12px",
          textAlign: "center",
        }}
      >
        請在應用程式輸入以下驗證碼：
      </Text>
      <Text
        style={{
          margin: "0 0 8px",
          padding: "18px 0",
          backgroundColor: BRAND.bg,
          border: `1px solid ${BRAND.border}`,
          borderRadius: "8px",
          color: BRAND.code,
          fontSize: "32px",
          fontWeight: 700,
          letterSpacing: "8px",
          textAlign: "center",
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
        }}
      >
        {code}
      </Text>
    </Section>
  );
}

export interface VerifyEmailProps {
  name: string;
  code: string;
  verificationUrl: string;
  supportEmail: string;
  expiresInHours: number;
}

export function VerifyEmail({
  name,
  code,
  verificationUrl,
  supportEmail,
  expiresInHours,
}: VerifyEmailProps): ReactElement {
  return (
    <Layout preview={`${code} 是你的 ${APP_NAME} 驗證碼，${expiresInHours} 小時內有效`}>
      <Header subtitle="請驗證你的電子郵件地址" />
      <Section style={{ padding: "28px 32px 8px" }}>
        <Text style={{ color: BRAND.text, fontSize: "16px", lineHeight: "24px", margin: "0 0 16px" }}>
          嗨 <strong>{name}</strong>，歡迎加入 {APP_NAME}！
        </Text>
        <Text style={{ color: BRAND.text, fontSize: "16px", lineHeight: "24px", margin: "0 0 16px" }}>
          點擊下方按鈕完成信箱驗證，驗證後就可以開始使用你的帳號。
        </Text>
      </Section>
      <CodeBlock code={code} />
      <Section style={{ padding: "8px 32px 8px" }}>
        <Text style={{ color: BRAND.muted, fontSize: "14px", lineHeight: "20px", margin: "16px 0 20px" }}>
          驗證碼將在 {expiresInHours} 小時後失效。
        </Text>
        <PrimaryButton href={verificationUrl}>驗證電子郵件</PrimaryButton>
        <Text style={{ color: BRAND.muted, fontSize: "13px", lineHeight: "20px", margin: "16px 0 0" }}>
          按鈕無法使用？請複製以下網址貼到瀏覽器：
          <br />
          <Link href={verificationUrl} style={{ color: BRAND.blue, wordBreak: "break-all" }}>
            {verificationUrl}
          </Link>
        </Text>
      </Section>
      <Footer supportEmail={supportEmail} />
    </Layout>
  );
}

VerifyEmail.PreviewProps = {
  name: "小明",
  code: "123456",
  verificationUrl: "https://example.com/verify?token=abc",
  supportEmail: "support@example.com",
  expiresInHours: 24,
} satisfies VerifyEmailProps;

export interface WelcomeEmailProps {
  name: string;
  supportEmail: string;
}

export function WelcomeEmail({ name, supportEmail }: WelcomeEmailProps): ReactElement {
  return (
    <Layout preview={`${name}，歡迎加入 ${APP_NAME}！`}>
      <Header subtitle="信箱驗證成功" />
      <Section style={{ padding: "28px 32px 8px" }}>
        <Text style={{ color: BRAND.text, fontSize: "16px", lineHeight: "24px", margin: "0 0 16px" }}>
          <strong>{name}</strong>，你的信箱已經驗證完成 🎉
        </Text>
        <Text style={{ color: BRAND.text, fontSize: "16px", lineHeight: "24px", margin: "0 0 16px" }}>
          你的帳號現在可以使用了。認識新朋友、分享動態、或在動態牆上看看大家都在做什麼。
        </Text>
        <Text style={{ color: BRAND.text, fontSize: "16px", lineHeight: "24px", margin: 0 }}>
          祝你使用愉快！
        </Text>
      </Section>
      <Footer supportEmail={supportEmail} />
    </Layout>
  );
}

WelcomeEmail.PreviewProps = {
  name: "小明",
  supportEmail: "support@example.com",
} satisfies WelcomeEmailProps;

export interface PasswordResetEmailProps {
  name: string;
  resetUrl: string;
  supportEmail: string;
  expiresInMinutes: number;
}

export function PasswordResetEmail({
  name,
  resetUrl,
  supportEmail,
  expiresInMinutes,
}: PasswordResetEmailProps): ReactElement {
  return (
    <Layout preview={`重設 ${APP_NAME} 密碼的連結，${expiresInMinutes} 分鐘內有效`}>
      <Header subtitle="重設密碼" />
      <Section style={{ padding: "28px 32px 8px" }}>
        <Text style={{ color: BRAND.text, fontSize: "16px", lineHeight: "24px", margin: "0 0 16px" }}>
          嗨 <strong>{name}</strong>，我們收到了重設密碼的請求。
        </Text>
        <Text style={{ color: BRAND.text, fontSize: "16px", lineHeight: "24px", margin: "0 0 16px" }}>
          點擊下方按鈕設定新密碼。這個連結在 {expiresInMinutes} 分鐘後失效。
        </Text>
      </Section>
      <Section style={{ padding: "8px 32px 8px" }}>
        <PrimaryButton href={resetUrl}>重設密碼</PrimaryButton>
        <Text style={{ color: BRAND.muted, fontSize: "13px", lineHeight: "20px", margin: "16px 0 0" }}>
          按鈕無法使用？請複製以下網址貼到瀏覽器：
          <br />
          <Link href={resetUrl} style={{ color: BRAND.blue, wordBreak: "break-all" }}>
            {resetUrl}
          </Link>
        </Text>
      </Section>
      <Footer supportEmail={supportEmail} />
    </Layout>
  );
}

PasswordResetEmail.PreviewProps = {
  name: "小明",
  resetUrl: "https://example.com/reset?token=abc",
  supportEmail: "support@example.com",
  expiresInMinutes: 60,
} satisfies PasswordResetEmailProps;
