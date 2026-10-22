import { bindings, defineConfig } from "cf/config";

import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

export default defineConfig({
  accountId: "0902aacff1b89178e2fb01f4f5e9b58c",
  worker: {
    name: "facebook-social",
    entrypoint,
    compatibilityDate: "2026-10-01",
    compatibilityFlags: ["nodejs_compat"],
    // Serve the Vite SPA build; every /api/* request is handled by the Worker.
    assets: {
      htmlHandling: "none",
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
    workersDev: true,
    env: {
      DB: bindings.d1({ name: "facebook-social" }),
      RESEND_API_KEY: bindings.secret(),
      RESEND_FROM: bindings.text("Facebook Social <noreply@resend.dev>"),
      RESEND_REPLY_TO: bindings.text(""),
      // Optional: override the auto-detected origin (used for email links).
      APP_URL: bindings.text(""),
      // Google OAuth. Both values come from `.dev.vars` locally and from
      // `.secrets.prod` at deploy time. Leave them empty until you create a
      // Google OAuth client — the "Sign in with Google" button stays hidden
      // until both are present.
      GOOGLE_CLIENT_ID: bindings.secret(),
      GOOGLE_CLIENT_SECRET: bindings.secret(),
      // Test-only knobs: point the OAuth flow at a mock provider.
      GOOGLE_AUTH_URL: bindings.text(process.env.GOOGLE_AUTH_URL ?? ""),
      GOOGLE_TOKEN_URL: bindings.text(process.env.GOOGLE_TOKEN_URL ?? ""),
      GOOGLE_USERINFO_URL: bindings.text(process.env.GOOGLE_USERINFO_URL ?? ""),
      // The OpenCode server used to generate NPC chat replies.
      // Empty LLM_BASE_URL means "no language model" — the NPC then answers
      // with the built-in canned replies.
      LLM_BASE_URL: bindings.secret(),
      LLM_USERNAME: bindings.secret(),
      LLM_PASSWORD: bindings.secret(),
      LLM_MODEL: bindings.secret(),
      LLM_DIRECTORY: bindings.secret(),
      LLM_AGENT: bindings.secret(),
    },
  },
});
