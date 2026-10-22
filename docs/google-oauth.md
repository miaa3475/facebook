# Google 登入（Sign in with Google）— 已完成啟用

> **狀態：已經啟用並上線。** 線上網站的登入頁有「使用 Google 登入」按鈕。

| 項目 | 值 |
|------|-----|
| 專案 ID | `facebook-social-miaa3475` |
| 專案編號 | `35812470567` |
| 用戶端 ID | `35812470…9t1f.apps.googleusercontent.com`（完整值請看你的 GCP 主控台） |
| 授權的 JavaScript 來源 | `https://facebook-social.fbsocial.workers.dev` |
| 已授權的重新導向 URI | `https://facebook-social.fbsocial.workers.dev/api/auth/google/callback` |
| 密鑰存放 | Worker secret（`GOOGLE_CLIENT_SECRET`），不會出現在前端 bundle 裡 |

要換憑證或改網域時，用：

```bash
node scripts/enable-google-login.mjs <用戶端ID> <用戶端密鑰>
```

---

## 先講錢的事：**完全免費，0 元**

| 項目 | 費用 | 說明 |
|------|------|------|
| Google Cloud 專案 | **免費** | 純 OAuth 用途**連信用卡都不用填**，不會自動扣款 |
| OAuth 2.0 用戶端 | **免費** | 沒有數量或次數限制，沒有 per-user 費用 |
| 同意畫面「測試」模式 | **免費** | 不需要送審、不需要隱私權政策頁 |
| Cloudflare Workers | 免費方案 | 每天 10 萬次請求，綽綽有餘 |
| Cloudflare D1 | 免費方案 | 每天 500 萬次讀取 |
| Resend | 免費方案 | 每月 3,000 封信 |

唯一「成本」是你的時間。**唯一需要動手的地方是 Google 的網頁主控台**（那需要用你的 Google 帳號登入，我沒辦法代勞），
其餘 100% 我來處理。

---

## 快速路線（我會幫你做完 90%）

> **這個專案的 Google Cloud 設定已經幫你做好了：**
>
> | 項目 | 值 |
> |------|-----|
> | 專案 ID | `facebook-social-miaa3475` |
> | 專案編號 | `35812470567` |
> | 已啟用的 API | `identitytoolkit.googleapis.com`、`servicemanagement.googleapis.com` |
> | 專案顯示名稱 | Facebook Social |
>
> 剩下的是兩個主控台表單（Google 關掉了用 API 建立 OAuth 用戶端的功能），
> 下方有直接點開的連結。

### 步驟 1：同意畫面

<https://console.cloud.google.com/auth/branding?project=facebook-social-miaa3475>

| 欄位 | 填什麼 |
|------|--------|
| 對象類型 (Audience) | **外部 (External)** |
| 發布狀態 (Publishing status) | **測試 (Testing)** ← 不用送審、不用隱私權政策 |
| 應用程式名稱 | `Facebook Social` |
| 支援的電子郵件 | `miaa3475@gmail.com` |
| 開發者聯絡資訊 | `miaa3475@gmail.com` |
| 同意畫面 | 電子郵件（預設即可） |

### 步驟 2：把自己加為測試使用者

<https://console.cloud.google.com/auth/audience?project=facebook-social-miaa3475>

把 `miaa3475@gmail.com` 加進「測試使用者」，**只有你能登入**，乾淨又零風險。

### 步驟 3：建立 OAuth 用戶端

<https://console.cloud.google.com/apis/credentials?project=facebook-social-miaa3475>

1. **建立憑證** → **OAuth 用戶端 ID** → 應用程式類型選 **網頁應用程式**
2. 名稱：`Facebook Social`
3. **已授權的 JavaScript 來源**：

   ```
   https://facebook-social.fbsocial.workers.dev
   ```

4. **已授權的重新導向 URI**：

   ```
   https://facebook-social.fbsocial.workers.dev/api/auth/google/callback
   ```

5. 建立 → 複製 **用戶端 ID** 與 **用戶端密鑰**

### 步驟 4：我接手剩下的

```bash
node scripts/enable-google-login.mjs <用戶端ID> <用戶端密鑰>
```

這會把憑證寫入 Worker secret、重新部署，並驗證線上網站的 `googleEnabled` 變成 `true`。

---

## 之後想重做一次？

```bash
npm run gcloud:setup
```

會用 API 建專案、啟用 API，並印出上面那些連結。
（`gcloud auth login` 之後就能用，指令是 `~/.local/gcloud/google-cloud-sdk/bin/gcloud.cmd`。）

---

## 完整手動路線（不想用 gcloud 的話）

### 1. 建立專案

<https://console.cloud.google.com/projectcreate>

- 專案名稱：`Facebook Social`
- 地點：選你自己的（組織留空白）

### 2. 啟用 API

<https://console.cloud.google.com/apis/library> → 搜尋並啟用 **Google Identity Platform**

（不啟用也行，同意畫面建立時會自動處理）

### 3. 同意畫面 — **選「外部」，發布狀態選「測試」**

<https://console.cloud.google.com/apis/credentials/consent>

| 欄位 | 填什麼 |
|------|--------|
| 應用程式名稱 | `Facebook Social` |
| 支援的電子郵件 | 你的 Gmail |
| 開發者聯絡資訊（電子郵件） | 你的 Gmail |
| 同意畫面 | 放「電子郵件」即可 |
| 範圍 | `.../auth/userinfo.email`、`.../auth/userinfo.profile`（預設就有） |

**重點：發布狀態選「測試」** →

- ✅ 不需要送審（Google 不會擋你）
- ✅ 不需要首頁 / 隱私權政策 / 服務條款網址
- ✅ 可以加最多 100 位測試使用者 → **把你自己的 Gmail 加進去**

> 只有「測試使用者」能登入，這正是我們要的：乾淨、免費、零風險。
> 等真的��公開給所有人，再改成「正式發布」並送審即可。

### 4. 建立 OAuth 用戶端

<https://console.cloud.google.com/apis/credentials>

1. 上方 **建立憑證** → **OAuth 用戶端 ID**
2. 應用程式類型：**網頁應用程式**
3. 名稱：`Facebook Social`
4. **已授權的 JavaScript 來源**：

   ```
   https://facebook-social.fbsocial.workers.dev
   ```

5. **已授權的重新導向 URI**：

   ```
   https://facebook-social.fbsocial.workers.dev/api/auth/google/callback
   ```

6. 建立 → 複製 **用戶端 ID** 與 **用戶端密鑰**

### 5. 交給我

```bash
node scripts/enable-google-login.mjs <用戶端ID> <用戶端密鑰>
```

這會寫入 Worker secret、重新部署，並驗證線上網站已啟用。

---

## 本機開發要另外加一組憑證

Google 不允許 `http://` 來源，所以本機要再開一個「網頁應用程式」憑證：

| 欄位 | 值 |
|------|-----|
| 授權的 JavaScript 來源 | `http://localhost:5173` |
| 已授權的重新導向 URI | `http://localhost:5173/api/auth/google/callback` |

填進 `.dev.vars`：

```dotenv
GOOGLE_CLIENT_ID=你的本機用戶端ID
GOOGLE_CLIENT_SECRET=你的本機用戶端密鑰
```

> Google 對 `http://localhost` 開通 OAuth 是官方允許的例外，不需要額外設定。

---

## 不想填表單的話

也可以直接用 Google 的 JS 函式庫（Google Identity Services）做「一鍵登入」按鈕，
但那需要在頁面上載入 Google 的腳本，而且拿不到 client secret（只能做前端流程）。
對我們這種「Worker 後端換 token」的架構，用 OAuth 授權碼流程 + 後端 secret 才是正確做法。

---

## 常見問題

**Q：會不會被收錢？**
不會。純 OAuth 用途的專案不需要綁定付款方式，Cloudflare 也用免費方案。除非你自己在 Console 開了
付費功能（像是 Cloud Run、Cloud SQL），否則不會有任何費用。

**Q：需要送審嗎？**
「測試」模式不用。要正式公開給所有人用才需要送審，那時 Google 會要求首頁、
隱私權政策、服務條款的網址。你的 Worker 網址就可以當首頁。

**Q：跳轉後顯示 `Error 400: invalid_request`？**
重新導向 URI 必須完全對上，包含尾斜線。現在是 `/api/auth/google/callback`（**沒有**尾斜線）。

**Q：跳轉後顯示「redirect_uri_mismatch」？**
Google 會把實際使用的 redirect_uri 顯示在錯誤訊息裡，直接複製到「已授權的重新導向 URI」即可。

**Q：出現 `Access blocked: ... has not completed the Google verification process`？**
那是「正式發布」模式在提醒你還沒送審。**改回「測試」模式**就會正常運作。

**Q：同一個信箱已經用密碼註冊過，再用 Google 登入會怎樣？**
程式會自動把 Google 帳號連結到既有的 email 帳號，不會產生重複帳號，也不會覆蓋原有密碼。

**Q：想改用自訂網域？**
把 `cloudflare.config.ts` 的 `domains` 加上網域，然後把新的網址同步更新到
Google Cloud 的「授權的 JavaScript 來源」與「已授權的重新導向 URI」。
