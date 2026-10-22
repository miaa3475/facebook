/**
 * Create the Google Cloud project and OAuth consent screen for the app.
 *
 *   node scripts/gcloud-setup.mjs [projectId] [supportEmail]
 *
 * Requires the gcloud CLI to be installed and signed in:
 *
 *   gcloud auth login
 *
 * This creates the project, enables the APIs and configures the consent
 * screen in "External" + "Testing" mode (no review needed). Creating the
 * OAuth client itself still has to be done in the Cloud Console — Google
 * shut down the API for that in March 2026 — so the script prints a
 * pre-filled console link at the end.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Project IDs are unique across all of Google Cloud, so the default appends
// the account name to avoid clashing with an existing project.
const PROJECT_ID = process.argv[2] ?? "facebook-social-miaa3475";
const PROJECT_NAME = process.argv[3] ?? "Facebook Social";
const SUPPORT_EMAIL = process.argv[4] ?? "miaa3475@gmail.com";

const APP_URL = "https://facebook-social.fbsocial.workers.dev";
const REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

/** Find the gcloud CLI, including a user-local install. */
function findGcloud() {
  const candidates = [
    join(homedir(), ".local", "gcloud", "google-cloud-sdk", "bin", "gcloud.cmd"),
    join(homedir(), ".local", "gcloud", "bin", "gcloud.cmd"),
    "C:\\Program Files (x86)\\Google\\Cloud SDK\\cloudfl.cmd",
    "C:\\Program Files\\Google\\Cloud SDK\\cloudfl.cmd",
    join(process.env.LOCALAPPDATA ?? "", "Google", "Cloud SDK", "cloudfl.cmd"),
  ];
  for (const candidate of candidates) {
    if (candidate !== "gcloud.cmd" && existsSync(candidate)) return candidate;
  }
  return "gcloud.cmd";
}

const GCLOUD = findGcloud();

// The user-local install ships its own Python; point gcloud at it.
const bundledPython = join(
  homedir(),
  ".local",
  "gcloud",
  "google-cloud-sdk",
  "platform",
  "bundledpython",
  "python.exe",
);
if (existsSync(bundledPython)) {
  process.env.CLOUDSDK_PYTHON = bundledPython;
}

function gcloud(args, allowFail = false) {
  // gcloud ships as a .cmd file, so it has to run through the shell — which
  // means the arguments need quoting by hand.
  const command = [GCLOUD, ...args]
    .map((arg) => (/[\s"&|<>]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg))
    .join(" ");

  try {
    const out = execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    return { ok: true, out: out.trim() };
  } catch (err) {
    const message = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    if (allowFail) return { ok: false, out: message };
    throw new Error(`gcloud ${args.join(" ")} failed:\n${message}`);
  }
}

console.log("\nSetting up Google Cloud for the Facebook Social app\n");

// ------------------------------------------------------------------ auth

{
  const res = gcloud(["auth", "print-access-token"], true);
  if (!res.ok) {
    console.error("You are not signed in to gcloud. Run:\n\n  gcloud auth login\n");
    process.exit(1);
  }
  console.log("1. Signed in to gcloud ✓");
}

const token = gcloud(["auth", "print-access-token"]).out;

// --------------------------------------------------------------- project

let projectNumber = null;
{
  const res = gcloud(["projects", "describe", PROJECT_ID, "--format=json"], true);
  if (res.ok) {
    projectNumber = JSON.parse(res.out).projectNumber;
    console.log(`2. Project ${PROJECT_ID} already exists (number ${projectNumber}) ✓`);
  } else {
    console.log(`2. Creating project ${PROJECT_ID}…`);
    gcloud(["projects", "create", PROJECT_ID, "--name", PROJECT_NAME]);
    const created = JSON.parse(gcloud(["projects", "describe", PROJECT_ID, "--format=json"]).out);
    projectNumber = created.projectNumber;
    console.log(`   Created (number ${projectNumber}) ✓`);
  }
}

// ------------------------------------------------------------------ apis

console.log("3. Enabling APIs…");
// oauth2.googleapis.com is an internal service and cannot be enabled — the
// OAuth endpoints are always available.
gcloud([
  "services",
  "enable",
  "identitytoolkit.googleapis.com",
  `servicemanagement.googleapis.com`,
  `--project=${PROJECT_ID}`,
]);
console.log("   identitytoolkit + servicemanagement ✓");

// -------------------------------------------------------- consent screen
//
// The consent screen (the OAuth "brand") can only be created in the console:
// the identitytoolkit config does not exist until it is set up there, and
// the IAP OAuth Admin API that used to create brands was retired in March
// 2026. Creating the OAuth client creates the brand as part of the flow.

console.log("4. The consent screen and the OAuth client have to be made in the console.");

// ------------------------------------------------------------- next step

const credentialsUrl = `https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}`;
const brandingUrl = `https://console.cloud.google.com/auth/branding?project=${PROJECT_ID}`;
const audienceUrl = `https://console.cloud.google.com/auth/audience?project=${PROJECT_ID}`;

console.log(`
Everything that can be done from the API is done:

  project    ${PROJECT_ID} (number ${projectNumber})
  APIs       identitytoolkit, servicemanagement

Two short steps left in the browser:

STEP 1 — consent screen (${brandingUrl})

  Audience          : External
  Publishing status : Testing        <-- no review, no privacy policy needed
  App name          : ${PROJECT_NAME}
  Support email     : ${SUPPORT_EMAIL}

STEP 2 — add yourself as a test user (${audienceUrl})

  Add ${SUPPORT_EMAIL} so only you can sign in while testing.

STEP 3 — create the OAuth client (${credentialsUrl})

  Create credentials  >  OAuth client ID  >  Web application
  Authorized JavaScript origins : ${APP_URL}
  Authorized redirect URIs     : ${REDIRECT_URI}

Then copy the Client ID and Client secret and run:

  node scripts/enable-google-login.mjs <CLIENT_ID> <CLIENT_SECRET>
`);
