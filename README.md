# Facebook Social

一個以 Facebook 為藍圖的社群平台：電子郵件驗證註冊、Google 登入、動態牆、留言、按讚、好友邀請與通知。
後端跑在 Cloudflare Workers，資料庫用 D1，驗證信透過 Resend 寄出。

**線上網址：** <https://facebook-social.fbsocial.workers.dev>

---

## 功能

| 類別 | 功能 |
|------|------|
| 帳號 | Email + 密碼註冊、驗證碼／驗證連結、登入、登出、忘記密碼、Google OAuth（已接好，憑證待設定） |
| 動態牆 | 發佈貼文、依時間排序、只顯示自己與好友的貼文、分頁載入 |
| 互動 | 按讚／取消讚、留言、刪除自己的貼文與留言 |
| 好友 | 搜尋使用者、送出／接受／忽略好友邀請、解除好友 |
| 通知 | 讚、留言、好友邀請三種通知，支援未讀徽章與全部標記已讀 |
| 聊天 | 一對一對話、訊息氣泡、未讀數、即時輪詢更新、**AI NPC 角色** |
| 個人頁 | 頭像（自動配色 + 縮寫）、簡介、貼文列表、好友列表、編輯個人資料 |

---

## 技術堆疊

| 層 | 技術 |
|----|------|
| 邊緣 runtime | Cloudflare Workers（`nodejs_compat`） |
| API | Hono 4 + Zod 4 |
| 資料庫 | Cloudflare D1（SQLite） |
| 前端 | React 19 + Vite 8 + Tailwind CSS 4 + React Router 7 |
| 寄信 | Resend + React Email（`@react-email/components`） |
| 部署 | `cf` CLI（Cloudflare 官方新 CLI）+ `cloudflare.config.ts` |

密碼雜湊使用 Web Crypto 的 PBKDF2-HMAC-SHA256（100,000 次），所有 token 只存 SHA-256 雜湊。

---

## 目錄結構

```
.
├── cloudflare.config.ts        # Worker 設定（名稱、綁定、assets 策略）
├── vite.config.ts              # Vite + Cloudflare 插件 + Tailwind
├── migrations/                 # D1 migration（SQL schema）
├── scripts/
│   ├── e2e-test.mjs            # 對線上環境跑完整端到端測試
│   ├── seed.mjs                # 直接寫入測試帳號（略過信箱驗證）
│   └── patch-cf-vite-bin.mjs   # Windows 上修正 cf CLI 的 shebang 問題
├── src/
│   ├── worker/                 # 後端（跑在 Workers）
│   │   ├── index.ts            # Hono app 入口
│   │   ├── auth.ts             # session 與 requireAuth middleware
│   │   ├── types.ts            # Env 與共用型別
│   │   ├── lib/
│   │   │   ├── crypto.ts       # PBKDF2、隨機 token、PKCE
│   │   │   ├── http.ts         # cookie、JSON 回應、rate limit
│   │   │   └── google.ts       # Google OAuth 2.0 + PKCE
│   │   ├── emails/
│   │   │   ├── templates.tsx   # React Email 模板
│   │   │   └── send.tsx        # Resend 寄信（idempotency + 重試）
│   │   └── routes/             # auth / posts / users / friends / notifications
│   └── client/                 # 前端 SPA
│       ├── main.tsx            # 路由
│       ├── auth.tsx            # AuthContext
│       ├── api.ts              # fetch wrapper 與型別
│       ├── components/         # Layout、PostCard、共用 UI
│       └── pages/              # Login、Register、Verify、Feed、Friends…
```

---

## 快速開始

### 1. 安裝

```bash
npm install
```

> Windows 上 PowerShell 會擋 `npm.ps1` / `npx.ps1`，請改用 `npm.cmd` / `npx.cmd`。

### 2. 本地開發

```bash
npm run dev
```

啟動後開啟 <http://localhost:5173>。本機資料庫由 D1 的 local 模式提供。

第一次建立本機資料庫：

```bash
npm run db:migrate:local
```

### 3. 環境變數

| 變數 | 用途 | 位置 |
|------|------|------|
| `RESEND_API_KEY` | Resend API 金鑰 | `.dev.vars`（本機）／Worker secret（線上） |
| `RESEND_FROM` | 寄件人顯示名稱與信箱 | `cloudflare.config.ts` |
| `RESEND_REPLY_TO` | 回覆信箱（交易信建議填真實信箱） | `cloudflare.config.ts` |
| `GOOGLE_CLIENT_ID` | Google OAuth 用戶端 ID | `cloudflare.config.ts` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 用戶端密鑰 | `.secrets.prod`（Worker secret） |
| `APP_URL` | 覆寫寄信連結的網域（留空則自動偵測） | `cloudflare.config.ts` |

本機機密放在 `.dev.vars`（已 gitignore），線上機密放在 `.secrets.prod`（已 gitignore）。

---

## 部署

```bash
npm run deploy
```

這會依序執行 `vite build` 產生 Build Output，再呼叫 `cf deploy --prebuilt` 上傳 Worker 與 D1 綁定。

> **為什麼不用 `cf deploy` 直接部署？**
> `cf` CLI 在 Windows 上會 spawn `node_modules/@cloudflare/vite-plugin/bin/cf-vite`，
> 而該檔案的 shebang 是 `#!/usr/bin/env node`，Windows 沒有 `/usr/bin/env` 因此會出現 `ENOENT`。
> `scripts/patch-cf-vite-bin.mjs`（`postinstall` 會自動執行）會把 shebang 改成絕對路徑；
> 若你用 macOS／Linux 則不受影響。

### 資料庫 migration

```bash
npm run db:migrate          # 套用到線上 D1
npm run db:migrate:local    # 套用到本機 D1（會自動開一個 dev server）
npm run db:query -- "SELECT * FROM users"
```

> **本機 D1 的小眉角：** Cloudflare Vite 插件的本機 D1 跟 `cf d1 migrations apply --local`
> 寫入的是不同的資料庫，所以本機要用 `npm run db:migrate:local`（走插件的 Local Explorer API）。
> 線上則一律用 `npm run db:migrate`。

---

## Google 登入設定

程式碼已完整接好並通過測試（含 PKCE、state 驗證、email 自動連結既有帳號）。
**憑證已經填好並上線** — 登入頁的「使用 Google 登入」按鈕已經可以使用。

| 項目 | 值 |
|------|-----|
| 專案 ID | `facebook-social-miaa3475` |
| 用戶端 ID | `35812470…9t1f.apps.googleusercontent.com`（完整值在 `docs/google-oauth.md` 與你的 GCP 主控台） |
| 重新導向 URI | `https://facebook-social.fbsocial.workers.dev/api/auth/google/callback` |

要換憑證或改網域：

```bash
node scripts/enable-google-login.mjs <用戶端ID> <用戶端密鑰>
```

完整申請步驟、免費額度說明請看 **[docs/google-oauth.md](docs/google-oauth.md)**。

> **Google 登入完全免費** — 專案不用綁信用卡，OAuth 用戶端沒有費用，
> 同意畫面用「測試」模式不用送審。

---

## Resend 寄信注意事項

目前寄件人使用 `onboarding@resend.dev`，這是 Resend 的**沙盒模式**：

> 沙盒只能寄到 **Resend 帳號本身的信箱**（本專案為 `miaa3475@gmail.com`），
> 寄到其他信箱會收到 `403`。

要讓任何人都能註冊，需要在 Resend 後台驗證自己的網域：

1. Resend Dashboard → **Domains** → Add Domain（例如 `mail.yourdomain.com`）
2. 把 Resend 提供的 SPF / DKIM 記錄加到 DNS
3. 把 `RESEND_FROM` 改成 `Facebook Social <noreply@yourdomain.com>`
4. 重新部署

驗證完成後記得也要設定 `RESEND_REPLY_TO`，讓使用者回覆信時寄到有人看信箱。

---

## 聊天功能與 AI NPC

聊天室在左側導覽列的 **💬 聊天**。跟 NPC「小雲 AI」聊天時，訊息會送到
**OpenCode**（`opencode serve`）產生回覆 — 也就是說，你的 OpenCode 就是這個 App 的 LLM 引擎。

### 一次設定

```bash
npm run npc:setup:deploy
```

這個指令會：

1. 啟動 `opencode serve`（無介面的 HTTP API）
2. 開一條 `cloudflared` 快速隧道，讓線上的 Worker 連得到
3. 把隧道網址寫進 `.dev.vars` 與 `.secrets.prod`
4. 重新部署 Worker

> 隧道網址每次重開都會變，所以 opencode 重新啟動後要再跑一次這個指令。

### NPC 的人設在哪裡？

人格設定在 OpenCode 的 agent 檔案：

```
~/.config/opencode/agent/npc.md
```

想改小雲 AI 的個性、語氣、禁忌，直接編輯那個檔案，然後執行 `opencode reload` 即可，
**不需要動這個專案的程式碼**。改了之後新開的對話就會套用新的設定。

### 設定項目

| 變數 | 說明 |
|------|------|
| `LLM_BASE_URL` | OpenCode 伺服器的網址（隧道網址） |
| `LLM_USERNAME` / `LLM_PASSWORD` | OpenCode 的 basic auth |
| `LLM_MODEL` | 模型，格式 `provider/model` |
| `LLM_AGENT` | 人格 agent 的名稱，預設 `npc` |

### 沒有語言模型時會怎樣？

如果 `LLM_BASE_URL` 沒設定，或 OpenCode 連不上，NPC 會改用**內建回覆**（`src/worker/npc.ts`）。
聊天功能本身完全正常，只是回覆不是即時生成的。

聊天頁右上角會顯示目前狀態：`🤖 AI 已連線` / `⚠️ AI 無法連線` / `💬 NPC 為內建回覆`。

> ⚠️ **OpenCode 免費額度有限。** 額度用完時 OpenCode 會回
> `Free usage limit reached`，NPC 就會退回內建回覆。
> 想長期使用，跑 `opencode auth login` 掛上自己的 provider，再重跑 `npm run npc:setup:deploy`。

### 技術細節

| 項目 | 做法 |
|------|------|
| OpenCode API | v2：`POST /api/session`（建立 session 時指定 `agent`）、`POST /api/session/{id}/prompt`、`GET /api/session/{id}/message` |
| 人設傳遞 | 靠 **agent**（`session.agent`），不是 prompt 的 `system` 欄位 — v2 會忽略 `system` |
| 回覆時機 | prompt 是非同步的，Worker 用 `waitUntil()` 在背景等回覆，前端每 2 秒輪詢 |
| 時間上限 | Worker 背景工作最多 30 秒，所以等待上限設為 22 秒，超時就改用內建回覆 |
| 辨識新回覆 | 伺服器會先建立空的 assistant 訊息再填內容，所以用**訊息 id** 判斷是不是新回覆（用筆數會有 race condition） |
| 送出 model | 只有在沒有用 agent 時才送 `model` — 送了會讓伺服器丟掉 agent 的人設 |

---

## 測試

```bash
# 一次跑完四個套件（104 項）
npm test

# 對線上環境跑完整端到端測試（44 項）
npm run test:e2e

# 用假的 Google 伺服器測整條 OAuth 流程（25 項）
npm run test:oauth

# 測試 NPC 聊天（19 項）
npm run test:chat

# 測試通知是否正確連到貼文（16 項）
npm run test:notifications

# 建立一個略過信箱驗證的測試帳號
npm run seed friend@example.com SuperSecret123! "好友測試"

# 建立一個 AI 好友，並產生按讚／留言／好友邀請通知
npm run demo
```

`npm run demo` 會建立一個 AI 好友帳號、跟你的帳號互加好友，並產生按讚／留言／好友邀請
三種通知，讓通知中心有東西可以測。它會先清掉自己上次產生的資料，所以可以重複執行。

| 角色 | Email | 密碼 |
|------|-------|------|
| 你的帳號 | `miaa3475@gmail.com` | `SuperSecret123!` |
| AI 好友 | `ai.helper@facebook-social.app` | `AgentTest123!` |

`scripts/e2e-test.mjs` 會驗證：註冊、登入、權限邊界（未登入 401）、發帖、按讚、留言、
好友邀請與接受、通知產生與已讀、個人頁、登出。

`scripts/test-google-oauth.mjs` 會在本機起一個假的 Google（authorize / token / userinfo），
完整走一次 redirects，並驗證 PKCE challenge、state 防偽、session 發放，
以及「同一個 Google 帳號再次登入會重用同一個使用者而不是建立重複帳號」。
沒有真實 Google 憑證也能驗證 OAuth 程式碼。

---

## 已知限制

| 項目 | 說明 |
|------|------|
| PBKDF2 次數上限 | Cloudflare Workers 拒絕超過 100,000 次的 PBKDF2（`NotSupportedError`）。若改用其他平台，建議提高到 600,000 或改用 Argon2id。 |
| Resend 沙盒 | 未驗證網域前，只能寄到 Resend 帳號信箱。 |
| 圖片上傳 | 目前貼文純文字。 |
| 即時更新 | 通知每 30 秒輪詢一次，不是 WebSocket 即時推送。 |
| 密碼重設 | 會強制所有裝置重新登入。 |

---

## 安全性設計

- 密碼：PBKDF2-HMAC-SHA256，100,000 次迭代，16-byte 隨機 salt，常數時間比較
- Session / 驗證 token：32-byte 隨機值，資料庫只存 SHA-256 雜湊
- Cookie：`HttpOnly` + `SameSite=Lax` + `Secure`（HTTPS 自動加上）
- 登入時即使帳號不存在也會執行一次密碼驗證，避免用回應時間判斷帳號是否存在
- 重設密碼／重新寄送驗證信一律回傳相同訊息，不洩漏信箱是否存在
- Rate limit 存在 D1（跨 isolate 有效）：註冊 5/時、登入 20/15 分、寄信 5/時
- 所有 SQL 使用參數化查詢
- 回應標頭：`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`

---

## 授權

此為教學／展示用途的專案。
