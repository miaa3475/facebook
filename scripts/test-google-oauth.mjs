/**
 * End-to-end test of the Google OAuth flow against a mock provider.
 *
 *   node scripts/test-google-oauth.mjs
 *
 * Starts a fake Google (authorize / token / userinfo) on localhost, boots the
 * Worker locally with `vite dev` pointed at the mock, and walks the whole
 * redirect flow — including PKCE verification and the state check.
 *
 * This exists because the real OAuth endpoints cannot be reached without
 * Google credentials, and shipping untested redirect code is how you end up
 * with a login button that silently does nothing.
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";

const APP_PORT = 5199;
const MOCK_PORT = 5198;
const APP = `http://localhost:${APP_PORT}`;

const CLIENT_ID = "mock-client-id.apps.googleusercontent.com";
const CLIENT_SECRET = "mock-client-secret";

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------------- mock Google

const issuedCodes = new Map(); // code -> { codeChallenge, redirectUri }
const mockRequests = [];

function startMockProvider() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${MOCK_PORT}`);

    if (req.method === "GET" && url.pathname === "/authorize") {
      const state = url.searchParams.get("state");
      const challenge = url.searchParams.get("code_challenge");
      const redirectUri = url.searchParams.get("redirect_uri");
      mockRequests.push({ endpoint: "authorize", params: Object.fromEntries(url.searchParams) });

      const code = `mock-code-${Math.random().toString(36).slice(2)}`;
      issuedCodes.set(code, { codeChallenge: challenge, redirectUri });

      const target = new URL(redirectUri);
      target.searchParams.set("code", code);
      target.searchParams.set("state", state);
      res.writeHead(302, { Location: target.toString() });
      res.end();
      return;
    }

    if (req.method === "POST" && url.pathname === "/token") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const form = new URLSearchParams(body);
        const code = form.get("code");
        const verifier = form.get("code_verifier");
        const clientId = form.get("client_id");
        const clientSecret = form.get("client_secret");
        const redirectUri = form.get("redirect_uri");
        mockRequests.push({ endpoint: "token", params: Object.fromEntries(form) });

        const record = issuedCodes.get(code);
        if (!record) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant" }));
          return;
        }
        if (clientId !== CLIENT_ID || clientSecret !== CLIENT_SECRET) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_client" }));
          return;
        }
        if (record.redirectUri !== redirectUri) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "redirect_uri_mismatch" }));
          return;
        }

        // PKCE: the client must prove it holds the verifier for the challenge.
        const computed = createHash("sha256").update(verifier ?? "").digest("base64url");
        if (computed !== record.codeChallenge) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "PKCE mismatch" }));
          return;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ access_token: "mock-access-token", token_type: "Bearer" }));
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/userinfo") {
      mockRequests.push({ endpoint: "userinfo", auth: req.headers.authorization });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          sub: "mock-google-sub-12345",
          email: "oauth.user@gmail.com",
          email_verified: true,
          name: "OAuth 測試者",
          picture: null,
        }),
      );
      return;
    }

    res.writeHead(404).end();
  });

  return new Promise((resolve) => server.listen(MOCK_PORT, "127.0.0.1", () => resolve(server)));
}

// --------------------------------------------------------- dev server setup

const DEV_VARS = ".dev.vars";

/** The original contents, so the file is restored exactly as it was. */
let devVarsOriginal = null;

function writeDevVars() {
  devVarsOriginal = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, "utf8") : null;

  writeFileSync(
    DEV_VARS,
    [
      `RESEND_API_KEY=local-test-key-not-a-real-secret`,
      `GOOGLE_CLIENT_ID=${CLIENT_ID}`,
      `GOOGLE_CLIENT_SECRET=${CLIENT_SECRET}`,
      "",
    ].join("\n"),
  );
}

function restoreDevVars() {
  if (devVarsOriginal === null) {
    rmSync(DEV_VARS, { force: true });
  } else {
    writeFileSync(DEV_VARS, devVarsOriginal);
  }
  devVarsOriginal = null;
}

async function waitForServer(url, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const text = await res.text();
        // The dev server answers with a plain-text error while the Worker is
        // still starting up, so check the body, not just the status code.
        if (text.includes('"ok":true')) {
          await sleep(500);
          return true;
        }
      }
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  return false;
}

// ------------------------------------------------------------------- runner

const mock = await startMockProvider();
writeDevVars();

const devLog = [];
// Run Vite directly through node so that `kill()` really stops the server
// (going through npx + shell leaves an orphaned process holding the port).
const viteBin = new URL("../node_modules/vite/bin/vite.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const dev = spawn(process.execPath, [viteBin, "dev"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    // The port must come from vite.config.ts, not a --port flag.
    PORT: String(APP_PORT),
    // The config reads these from the OS environment to point the flow at
    // the mock provider.
    GOOGLE_AUTH_URL: `http://127.0.0.1:${MOCK_PORT}/authorize`,
    GOOGLE_TOKEN_URL: `http://127.0.0.1:${MOCK_PORT}/token`,
    GOOGLE_USERINFO_URL: `http://127.0.0.1:${MOCK_PORT}/userinfo`,
  },
});

dev.stdout.on("data", (d) => devLog.push(d.toString()));
dev.stderr.on("data", (d) => devLog.push(d.toString()));

let cleanupDone = false;
function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  try {
    dev.kill();
  } catch {}
  try {
    mock.close();
  } catch {}
  restoreDevVars();
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});

console.log("\nGoogle OAuth flow test (mock provider)\n");

try {
  const ready = await waitForServer(`${APP}/api/health`);
  if (!ready) {
    console.error("The dev server did not start in time.");
    console.error(devLog.join(""));
    process.exit(1);
  }

  // The Vite plugin keeps its local D1 in memory, so seed it through the
  // Local Explorer API before exercising anything that touches the database.
  {
    const dbs = await (await fetch(`${APP}/cdn-cgi/local/explorer/api/d1/database`)).json();
    const dbId = dbs?.result?.[0]?.uuid;
    if (!dbId) {
      console.error("The dev server did not report a D1 database.");
      process.exit(1);
    }

    const raw = (sql) =>
      fetch(`${APP}/cdn-cgi/local/explorer/api/d1/database/${dbId}/raw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql, params: [] }),
      });

    const probe = await raw("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    const alreadyThere = (await probe.text()).includes('"users"');

    if (alreadyThere) {
      console.log("  (schema already applied, skipping)");
    } else {
      const schema = readFileSync(
        new URL("../migrations/0001_init_schema.sql", import.meta.url),
        "utf8",
      );
      const mig = await raw(schema);
      check("the local schema was applied", mig.ok, `HTTP ${mig.status}`);
    }
  }

  // ------------------------------------------------------------- enabled?
  {
    const res = await fetch(`${APP}/api/auth/session`);
    const body = await res.json();
    check("googleEnabled is true once credentials are set", body.googleEnabled === true, JSON.stringify(body));
  }
  // ------------------------------------------------- step 1: /api/auth/google
  let oauthCookie = "";
  let authorizeUrl = "";
  {
    const res = await fetch(`${APP}/api/auth/google`, { redirect: "manual" });
    check("GET /api/auth/google redirects", res.status === 302, `status ${res.status}`);

    authorizeUrl = res.headers.get("location") ?? "";
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const oauth = setCookie.find((c) => c.startsWith("fb_oauth="));
    oauthCookie = oauth ? oauth.split(";")[0] : "";

    check("redirect goes to the provider", authorizeUrl.startsWith(`http://127.0.0.1:${MOCK_PORT}/authorize`), authorizeUrl);
    check("state parameter is present", authorizeUrl.includes("state="));
    check("PKCE challenge is sent", authorizeUrl.includes("code_challenge=") && authorizeUrl.includes("code_challenge_method=S256"));
    check("an oauth cookie is set", oauthCookie.length > 0);
  }

  // ------------------------------------------- step 2: the provider consents
  let callbackUrl = "";
  {
    const res = await fetch(authorizeUrl, { redirect: "manual" });
    check("provider redirects back to the callback", res.status === 302, `status ${res.status}`);
    callbackUrl = res.headers.get("location") ?? "";
    check(
      "callback points at our callback route",
      callbackUrl.includes("/api/auth/google/callback"),
      callbackUrl,
    );
    check("callback carries the code and state", callbackUrl.includes("code=") && callbackUrl.includes("state="));
  }

  // -------------------------------------------- step 3: the callback runs
  let sessionCookie = "";
  {
    const res = await fetch(callbackUrl, { redirect: "manual", headers: { Cookie: oauthCookie } });
    check("callback redirects into the app", res.status === 302, `status ${res.status}`);
    check("callback redirects to /?google=1", (res.headers.get("location") ?? "").includes("google=1"), res.headers.get("location") ?? "");

    const setCookie = res.headers.getSetCookie?.() ?? [];
    const session = setCookie.find((c) => c.startsWith("fb_session="));
    sessionCookie = session ? session.split(";")[0] : "";
    check("a session cookie is issued", sessionCookie.length > 0);
  }

  // ------------------------------------------ step 4: we are signed in
  {
    const res = await fetch(`${APP}/api/auth/session`, { headers: { Cookie: sessionCookie } });
    const body = await res.json();
    check("session returns the Google user", body.user?.email === "oauth.user@gmail.com", JSON.stringify(body));
    check("the Google user is marked verified", body.user?.emailVerified === true);
    check("the display name comes from Google", body.user?.name === "OAuth 測試者", body.user?.name);
  }

  // --------------------------------------- step 5: PKCE was really verified
  {
    const tokenCall = mockRequests.find((r) => r.endpoint === "token");
    check("the token endpoint was called", !!tokenCall);
    check(
      "the client secret was sent to the token endpoint",
      tokenCall?.params?.client_secret === CLIENT_SECRET,
    );
    check(
      "the redirect_uri matches the one used to start the flow",
      tokenCall?.params?.redirect_uri?.includes("/api/auth/google/callback"),
      tokenCall?.params?.redirect_uri,
    );
    check("a code_verifier was sent (PKCE)", !!tokenCall?.params?.code_verifier);
    check(
      "the mock provider accepted the PKCE challenge",
      !mockRequests.some((r) => r.endpoint === "token" && r.params?.error),
    );
  }

  // -------------------------------------- step 6: a tampered state is rejected
  {
    const tampered = new URL(callbackUrl);
    tampered.searchParams.set("state", "tampered-state-value");
    const res = await fetch(tampered.toString(), { redirect: "manual", headers: { Cookie: oauthCookie } });
    check("a tampered state is rejected", res.status === 302, `status ${res.status}`);
    check(
      "the rejection redirects to the login page with an error",
      (res.headers.get("location") ?? "").includes("error=state_mismatch"),
      res.headers.get("location") ?? "",
    );
    const setCookie = res.headers.getSetCookie?.() ?? [];
    check("no session is issued for a rejected callback", !setCookie.some((c) => c.startsWith("fb_session=")));
  }

  // ------------------------------- step 7: the account is reused, not cloned
  {
    const first = await (await fetch(`${APP}/api/auth/session`, { headers: { Cookie: sessionCookie } })).json();

    // Walk the flow a second time with the same Google identity.
    const start = await fetch(`${APP}/api/auth/google`, { redirect: "manual" });
    const cookie2 = (start.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("fb_oauth="));
    const consent = await fetch(start.headers.get("location"), { redirect: "manual" });
    const callback2 = await fetch(consent.headers.get("location"), {
      redirect: "manual",
      headers: { Cookie: cookie2.split(";")[0] },
    });
    const cookie2Session = (callback2.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("fb_session="));

    const second = await (
      await fetch(`${APP}/api/auth/session`, { headers: { Cookie: cookie2Session.split(";")[0] } })
    ).json();

    check("signing in again returns the same user", first.user?.id === second.user?.id, `${first.user?.id} vs ${second.user?.id}`);
    check("the Google user id is stable", !!first.user?.id);
  }
} catch (err) {
  console.error("\nThe test threw:");
  console.error(err);
  console.error("\n--- dev server output ---");
  console.error(devLog.join(""));
  failed++;
} finally {
  cleanup();
}

if (failed > 0) {
  console.error("\n--- dev server output ---");
  console.error(devLog.join(""));
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
