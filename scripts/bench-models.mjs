/**
 * Quick latency / reliability check for the models the OpenCode server can use.
 *
 *   node scripts/bench-models.mjs
 */

const BASE = process.env.OPENCODE_URL ?? "http://127.0.0.1:4096";
const PASSWORD = process.env.OPENCODE_SERVER_PASSWORD ?? "";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Basic ${Buffer.from(`opencode:${PASSWORD}`).toString("base64")}`,
};

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: text };
  }
}

const models = [
  "minimax-m3.1-flash-free",
  "flint-40b-free",
  "glm-5.3-flash-free",
  "deepseek-v4.1-flash-free",
  "beam-free",
  "mimo-v2.6-flash-free",
];

async function trial(model) {
  const created = await api("POST", "/api/session", { agent: "npc" });
  if (created.status !== 200) return { model, ok: false, ms: 0, note: "session failed" };
  const id = created.json?.data?.id;

  const started = Date.now();
  const sent = await api("POST", `/api/session/${id}/prompt`, {
    text: "用一句話說你是誰。",
    model: { providerID: "opencode", modelID: model },
  });
  if (sent.status !== 200) return { model, ok: false, ms: 0, note: `prompt ${sent.status}` };

  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const list = await api("GET", `/api/session/${id}/message`);
    const messages = list.json?.data ?? [];
    let latest = null;
    for (let j = messages.length - 1; j >= 0; j--) {
      if (messages[j]?.type === "assistant") {
        latest = messages[j];
        break;
      }
    }
    if (!latest) continue;
    const text = (latest.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
    if (text) return { model, ok: true, ms: Date.now() - started, note: text.slice(0, 40) };
    const failed = (latest.content ?? []).some((c) => c.type === "error" || c.error);
    if (failed) return { model, ok: false, ms: Date.now() - started, note: "provider error" };
  }
  return { model, ok: false, ms: Date.now() - started, note: "timeout" };
}

console.log("\nmodel                      ok   time    note");
console.log("-".repeat(70));

for (const model of models) {
  const result = await trial(model);
  console.log(
    `${result.model.padEnd(26)} ${result.ok ? "yes" : "NO "}  ${String(result.ms).padStart(5)}ms  ${result.note}`,
  );
}
console.log();
