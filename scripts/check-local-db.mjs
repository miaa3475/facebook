import { DatabaseSync } from "node:sqlite";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(
  process.env.APPDATA ?? "",
  "xdg.config",
  "cloudflare",
  "state",
  "v3",
  "d1",
  "miniflare-D1DatabaseObject",
);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".sqlite")) out.push(full);
  }
  return out;
}

for (const file of walk(root)) {
  console.log(`\n--- ${file}`);
  try {
    const db = new DatabaseSync(file, { readOnly: true });
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    console.log("tables:", rows.map((r) => r.name).join(", "));
  } catch (err) {
    console.log("error:", err.message);
  }
}
