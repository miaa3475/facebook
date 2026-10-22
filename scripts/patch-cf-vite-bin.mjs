/**
 * The Cloudflare Vite plugin ships a `bin/cf-vite` launcher with a
 * `#!/usr/bin/env node` shebang. The `cf` CLI spawns that file directly, and
 * on Windows the `/usr/bin/env` interpreter does not exist, so the spawn
 * fails with ENOENT.
 *
 * Rewriting the shebang to an absolute path to the current Node binary fixes
 * it. The patch is idempotent and only touches node_modules.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LAUNCHER = join(process.cwd(), "node_modules", "@cloudflare", "vite-plugin", "bin", "cf-vite");

if (!existsSync(LAUNCHER)) {
  // Plugin not installed yet — nothing to patch.
  process.exit(0);
}

const original = readFileSync(LAUNCHER, "utf8");

if (!original.startsWith("#!")) {
  process.exit(0);
}

const nodePath = process.execPath.replace(/\\/g, "\\\\");
const patched = `#!${nodePath}${original.slice(original.indexOf("\n"))}`;

if (patched !== original) {
  writeFileSync(LAUNCHER, patched);
  console.log("Patched @cloudflare/vite-plugin shebang for Windows.");
}
