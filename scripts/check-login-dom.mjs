import { readFileSync, writeFileSync } from "node:fs";

let t = readFileSync(".login.html", "utf8");
if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
writeFileSync(".login.txt", t, "utf8");

console.log("length", t.length);
for (const p of [
  "使用 Google 登入",
  "建立新帳號",
  "登入以繼續使用你的帳號",
  "忘記密碼",
  "Facebook Social",
  "googleusercontent",
]) {
  console.log("  ", p.padEnd(16), t.includes(p));
}

const i = t.indexOf('<div id="root">');
console.log("--- root snippet ---");
console.log(t.slice(i, i + 900));
