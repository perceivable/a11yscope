#!/usr/bin/env node
/**
 * Mastodon (mastodon.social/@perceivable) over the REST API.
 *
 *   node tools/mastodon.mjs --profile p.json      {displayName, note, avatar?: path}
 *   node tools/mastodon.mjs --post p.json [--dry-run]   {text, lang?}  — a URL in the
 *       text gets a preview card automatically; 500 chars max.
 *   node tools/mastodon.mjs --search "#a11y" [--limit 20]
 *   node tools/mastodon.mjs --notifications
 *
 * Token: ~/.config/perceivable/mastodon.token (app "edward", scopes read profile write).
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename } from "node:path";

const BASE = "https://mastodon.social";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const token = (await readFile(join(homedir(), ".config", "perceivable", "mastodon.token"), "utf8")).trim();
const auth = { Authorization: `Bearer ${token}` };

async function api(path, { method = "GET", body, form } = {}) {
  const headers = { ...auth };
  let payload;
  if (form) payload = form;
  else if (body) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${j.error || JSON.stringify(j).slice(0, 200)}`);
  return j;
}

if (val("--profile")) {
  const p = JSON.parse(await readFile(val("--profile"), "utf8"));
  const form = new FormData();
  form.set("display_name", p.displayName);
  form.set("note", p.note);
  form.set("bot", "false");
  if (p.avatar) form.set("avatar", new Blob([await readFile(p.avatar)], { type: "image/png" }), basename(p.avatar));
  (p.fields || []).forEach((f, i) => { form.set(`fields_attributes[${i}][name]`, f.name); form.set(`fields_attributes[${i}][value]`, f.value); });
  const a = await api("/api/v1/accounts/update_credentials", { method: "PATCH", form });
  console.log(`profile updated: ${a.display_name} ${a.url}`);
} else if (val("--post")) {
  const p = JSON.parse(await readFile(val("--post"), "utf8"));
  // Mastodon counts every URL as 23 characters.
  const counted = p.text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
  if (counted > 500) throw new Error(`post is ${counted} chars; limit 500`);
  if (flag("--dry-run")) { console.log(p.text); console.log(`(${counted} chars)`); process.exit(0); }
  const s = await api("/api/v1/statuses", { method: "POST", body: { status: p.text, language: p.lang || "en", visibility: "public" } });
  console.log(`posted: ${s.url}`);
} else if (val("--search")) {
  const q = val("--search");
  const path = q.startsWith("#")
    ? `/api/v1/timelines/tag/${encodeURIComponent(q.slice(1))}?limit=${val("--limit") || 20}`
    : `/api/v2/search?type=statuses&q=${encodeURIComponent(q)}&limit=${val("--limit") || 20}`;
  const r = await api(path);
  const statuses = Array.isArray(r) ? r : r.statuses;
  for (const s of statuses) {
    const text = s.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.log(`${s.created_at.slice(0, 10)} @${s.account.acct} ♥${s.favourites_count} 💬${s.replies_count}\n  ${text.slice(0, 160)}\n  ${s.url}`);
  }
} else if (flag("--notifications")) {
  const r = await api("/api/v1/notifications?limit=30");
  for (const n of r) console.log(`${n.created_at.slice(0, 16)} ${n.type.padEnd(9)} @${n.account.acct}${n.status ? " — " + n.status.content.replace(/<[^>]+>/g, " ").trim().slice(0, 100) : ""}`);
  if (!r.length) console.log("(no notifications)");
} else {
  console.log("usage: --profile p.json | --post p.json [--dry-run] | --search q [--limit n] | --notifications");
}
