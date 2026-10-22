/**
 * Scan the files git is about to track for secrets.
 *
 *   node scripts/scan-secrets.mjs
 *
 * Runs before the repository is published so a public repo cannot leak a key.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/**
 * The real secret values, read from the local secret files.
 *
 * Reading them from disk (instead of hardcoding them here) means the scanner
 * always checks against what is actually in use.
 */
const SECRET_FILES = [".dev.vars", ".secrets.prod", "說明.txt"];

function collectLocalSecrets() {
  const values = [];

  for (const file of SECRET_FILES) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
      if (!match) continue;
      const [, key, value] = match;
      // Short values are not worth matching.
      if (value.length < 12) continue;
      values.push({ key, value, file });
    }
  }

  // The account email is not a secret, but it does identify the owner.
  for (const file of SECRET_FILES) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/re_[A-Za-z0-9_-]{20,}/g)) {
      values.push({ key: "Resend API key", value: match[0], file });
    }
  }

  return values;
}

/** Generic patterns that look like credentials. */
const SUSPICIOUS = [
  { name: "Resend API key", pattern: /re_[A-Za-z0-9_-]{20,}/ },
  { name: "Google OAuth client secret", pattern: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "OpenAI style key", pattern: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9._-]{30,}/ },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./ },
  { name: "npm token", pattern: /npm_[A-Za-z0-9]{30,}/ },
];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean);

console.log(`\nScanning ${files.length} files that git would track…\n`);

let problems = 0;

const report = (title, file, value) => {
  problems++;
  const masked = value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
  console.log(`  !! ${title}`);
  console.log(`     in ${file}`);
  console.log(`       ${masked}`);
};

for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  // 1. The exact values that are in use locally.
  for (const secret of collectLocalSecrets()) {
    if (content.includes(secret.value)) {
      report(`${secret.key} (live value from ${secret.file})`, file, secret.value);
    }
  }

  // 2. Generic credential shapes.
  for (const { name, pattern } of SUSPICIOUS) {
    for (const match of content.match(new RegExp(pattern, "g")) ?? []) {
      report(name, file, match);
    }
  }
}

console.log();
if (problems === 0) {
  console.log("No secrets found. Safe to publish.\n");
  process.exit(0);
}

console.log(`${problems} finding(s) — resolve them before publishing.\n`);
process.exit(1);
