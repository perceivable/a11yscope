#!/usr/bin/env node
/**
 * Bluesky for the Perceivable account, over the public AT Protocol API.
 *
 *   node tools/bluesky.mjs --profile name.json      {displayName, description, avatar?: path}
 *   node tools/bluesky.mjs --post post.json [--dry-run]
 *       {text, link?: url}  — links in text become clickable (facets); `link`
 *       adds a preview card fetched from the page's og: tags.
 *   node tools/bluesky.mjs --search "#a11y" [--limit 25]
 *   node tools/bluesky.mjs --notifications
 *
 * Credentials: ~/.config/perceivable/bluesky.apppw (an app password, not the
 * account password). Never printed, never written anywhere else.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, extname } from "node:path";

const HANDLE = "perceivable.bsky.social";
const PDS = "https://bsky.social";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const val = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const password = (await readFile(join(homedir(), ".config", "perceivable", "bluesky.apppw"), "utf8")).trim();
const session = await xrpc("com.atproto.server.createSession", { identifier: HANDLE, password });
const auth = { Authorization: `Bearer ${session.accessJwt}` };

async function xrpc(method, body, headers = {}) {
  const r = await fetch(`${PDS}/xrpc/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method}: ${j.error} ${j.message}`);
  return j;
}
async function get(method, params) {
  const r = await fetch(`${PDS}/xrpc/${method}?${new URLSearchParams(params)}`, { headers: auth });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method}: ${j.error} ${j.message}`);
  return j;
}
async function uploadBlob(path) {
  const bytes = await readFile(path);
  const type = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[extname(path)] || "application/octet-stream";
  const r = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, { method: "POST", headers: { ...auth, "Content-Type": type }, body: bytes });
  const j = await r.json();
  if (!r.ok) throw new Error(`uploadBlob: ${j.error} ${j.message}`);
  return j.blob;
}

/** Byte-offset facets so URLs are clickable; Bluesky counts graphemes but facets use UTF-8 bytes. */
function linkFacets(text) {
  const enc = new TextEncoder();
  const facets = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) {
    const start = enc.encode(text.slice(0, m.index)).length;
    facets.push({ index: { byteStart: start, byteEnd: start + enc.encode(m[0]).length }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
  }
  return facets;
}

async function linkCard(url) {
  const html = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
  const og = (p) => html.match(new RegExp(`<meta[^>]+property=["']og:${p}["'][^>]+content=["']([^"']*)`, "i"))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:${p}["']`, "i"))?.[1];
  const title = og("title") || html.match(/<title[^>]*>([^<]*)/i)?.[1] || url;
  const description = og("description") || "";
  const external = { uri: url, title, description };
  const image = og("image");
  if (image) {
    try {
      const r = await fetch(image);
      const bytes = new Uint8Array(await r.arrayBuffer());
      if (bytes.length < 950_000) {
        const up = await fetch(`${PDS}/xrpc/com.atproto.repo.uploadBlob`, { method: "POST", headers: { ...auth, "Content-Type": r.headers.get("content-type") || "image/jpeg" }, body: bytes });
        if (up.ok) external.thumb = (await up.json()).blob;
      }
    } catch { /* card without thumbnail */ }
  }
  return { $type: "app.bsky.embed.external", external };
}

if (val("--profile")) {
  const p = JSON.parse(await readFile(val("--profile"), "utf8"));
  const existing = await get("com.atproto.repo.getRecord", { repo: session.did, collection: "app.bsky.actor.profile", rkey: "self" }).catch(() => null);
  const record = { ...(existing?.value || {}), $type: "app.bsky.actor.profile", displayName: p.displayName, description: p.description };
  if (p.avatar) record.avatar = await uploadBlob(p.avatar);
  await xrpc("com.atproto.repo.putRecord", { repo: session.did, collection: "app.bsky.actor.profile", rkey: "self", record, ...(existing ? { swapRecord: existing.cid } : {}) }, auth);
  console.log(`profile updated: ${p.displayName}`);
} else if (val("--post")) {
  const p = JSON.parse(await readFile(val("--post"), "utf8"));
  const graphemes = [...new Intl.Segmenter().segment(p.text)].length;
  if (graphemes > 300) throw new Error(`post is ${graphemes} graphemes; limit 300`);
  const record = { $type: "app.bsky.feed.post", text: p.text, facets: linkFacets(p.text), createdAt: new Date().toISOString(), langs: p.langs || ["en"] };
  if (p.link) record.embed = await linkCard(p.link);
  if (flag("--dry-run")) { console.log(JSON.stringify({ ...record, embed: record.embed && { ...record.embed, external: { ...record.embed.external, thumb: record.embed.external.thumb ? "(blob)" : undefined } } }, null, 2)); process.exit(0); }
  const r = await xrpc("com.atproto.repo.createRecord", { repo: session.did, collection: "app.bsky.feed.post", record }, auth);
  console.log(`posted: https://bsky.app/profile/${HANDLE}/post/${r.uri.split("/").pop()}`);
} else if (val("--search")) {
  const r = await get("app.bsky.feed.searchPosts", { q: val("--search"), limit: val("--limit") || "25", sort: "latest" });
  for (const p of r.posts) console.log(`${p.indexedAt.slice(0, 10)} @${p.author.handle} ♥${p.likeCount} 💬${p.replyCount}\n  ${p.record.text.replace(/\s+/g, " ").slice(0, 160)}\n  https://bsky.app/profile/${p.author.handle}/post/${p.uri.split("/").pop()}`);
} else if (flag("--notifications")) {
  const r = await get("app.bsky.notification.listNotifications", { limit: "30" });
  for (const n of r.notifications) console.log(`${n.indexedAt.slice(0, 16)} ${n.reason.padEnd(8)} @${n.author.handle} ${n.record?.text ? "— " + n.record.text.slice(0, 100) : ""}`);
  if (!r.notifications.length) console.log("(no notifications)");
} else {
  console.log("usage: --profile p.json | --post p.json [--dry-run] | --search q [--limit n] | --notifications");
}
