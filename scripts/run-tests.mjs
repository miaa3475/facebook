/**
 * Run one of the test scripts and print a compact summary.
 *
 *   node scripts/run-tests.mjs [e2e|chat|notifications|oauth|all]
 */

import { spawnSync } from "node:child_process";

const SUITES = {
  e2e: "scripts/e2e-test.mjs",
  chat: "scripts/test-chat.mjs",
  notifications: "scripts/test-notification-links.mjs",
  oauth: "scripts/test-google-oauth.mjs",
};

const which = process.argv[2] ?? "all";
const names = which === "all" ? Object.keys(SUITES) : [which];

let totalPassed = 0;
let totalFailed = 0;

for (const name of names) {
  const script = SUITES[name];
  if (!script) {
    console.error(`Unknown suite: ${name}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, [script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const lines = out.split(/\r?\n/);

  const failures = lines.filter((l) => l.includes("FAIL"));
  const summary = lines.find((l) => l.includes("passed,")) ?? "(no summary)";

  const passed = Number(summary.match(/(\d+) passed/)?.[1] ?? 0);
  const failed = Number(summary.match(/(\d+) failed/)?.[1] ?? 0);
  totalPassed += passed;
  totalFailed += failed;

  console.log(`${name.padEnd(14)} ${summary.trim()}`);
  for (const failure of failures) console.log(`   ${failure.trim()}`);
}

console.log(`\nTOTAL           ${totalPassed} passed, ${totalFailed} failed`);
process.exit(totalFailed === 0 ? 0 : 1);
