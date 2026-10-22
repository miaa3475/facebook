import { readCloudflareToken } from "./lib/cf-token.mjs";

const ACCOUNT_ID = "0902aacff1b89178e2fb01f4f5e9b58c";
const DATABASE_ID = "003a7e35-b747-42ca-94f6-43bc01026a57";

const sql = process.argv.slice(2).join(" ") || "SELECT 1";
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${readCloudflareToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params: [] }),
  },
);
const body = await res.json();
console.log(JSON.stringify(body.results ?? body, null, 2));
