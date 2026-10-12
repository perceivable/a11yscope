#!/usr/bin/env node
/**
 * Read-only view of the perceivablehq@gmail.com inbox over IMAP. No library:
 * a tagged-command loop over TLS is all Gmail needs for list/read.
 *
 *   node tools/mail.mjs                 # last 7 days: date, unread marker, from, subject, uid
 *   node tools/mail.mjs --days 30
 *   node tools/mail.mjs --unseen        # only unread
 *   node tools/mail.mjs --read <uid>    # body as text (PEEK: does not mark it read)
 *
 * Password: ~/.config/perceivable/gmail.apppw (Google app password, mode 600).
 * This tool never sends, deletes or flags anything.
 */
import { connect } from "node:tls";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const USER = "perceivablehq@gmail.com";
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const pw = (await readFile(join(homedir(), ".config", "perceivable", "gmail.apppw"), "utf8")).trim();

/* ---------- tiny IMAP client ---------- */
const sock = connect({ host: "imap.gmail.com", port: 993, servername: "imap.gmail.com" });
let buf = "";
let n = 0;
const waiters = [];
sock.setEncoding("utf8");
sock.on("data", (d) => { buf += d; pump(); });
sock.on("error", (e) => { console.error(`imap: ${e.message}`); process.exit(1); });
function pump() {
  while (waiters.length) {
    const w = waiters[0];
    const m = buf.match(new RegExp(`(^|\\r\\n)${w.tag} (OK|NO|BAD)([^\\r\\n]*)\\r\\n`));
    if (!m) return;
    const end = m.index + m[0].length;
    const chunk = buf.slice(0, end);
    buf = buf.slice(end);
    waiters.shift();
    m[2] === "OK" ? w.resolve(chunk) : w.reject(new Error(`${w.cmd.split(" ")[0]}: ${m[2]}${m[3]}`));
  }
}
function cmd(text) {
  const tag = `A${String(++n).padStart(3, "0")}`;
  return new Promise((resolve, reject) => {
    waiters.push({ tag, cmd: text, resolve, reject });
    sock.write(`${tag} ${text}\r\n`);
  });
}
await new Promise((r) => sock.once("secureConnect", r));
await new Promise((r) => { const check = () => (/\* OK/.test(buf) ? (buf = "", r()) : sock.once("data", check)); check(); });

/* ---------- decoding ---------- */
function decodeWord(s) {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, enc, text) => {
    const bytes = enc.toUpperCase() === "B"
      ? Buffer.from(text, "base64")
      : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16))), "latin1");
    try { return new TextDecoder(cs.toLowerCase()).decode(bytes); } catch { return bytes.toString("utf8"); }
  }).replace(/\?=\s+=\?/g, "?==?");
}
const header = (block, name) => {
  const m = block.match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*(?:\\r\\n[ \\t][^\\r\\n]*)*)`, "im"));
  return m ? decodeWord(m[1].replace(/\r\n[ \t]+/g, " ")).trim() : "";
};
function bodyText(raw) {
  // Pick the text/plain part when it is a multipart message, else the whole body.
  const boundary = raw.match(/boundary="?([^"\r\n;]+)"?/i)?.[1];
  let part = raw;
  if (boundary) {
    const parts = raw.split(`--${boundary}`);
    part = parts.find((p) => /content-type:\s*text\/plain/i.test(p)) || parts.find((p) => /content-type:\s*text\/html/i.test(p)) || raw;
  }
  const [head, ...rest] = part.split(/\r\n\r\n/);
  let body = rest.join("\r\n\r\n");
  const enc = (head.match(/content-transfer-encoding:\s*([^\r\n]+)/i)?.[1] || "").trim().toLowerCase();
  if (enc === "base64") body = Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  else if (enc === "quoted-printable") body = Buffer.from(body.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8");
  if (/content-type:\s*text\/html/i.test(head)) body = body.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  return body.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/* ---------- commands ---------- */
try {
  await cmd(`LOGIN "${USER}" "${pw}"`);
  await cmd("SELECT INBOX");
  if (val("--read")) {
    const uid = val("--read");
    const r = await cmd(`UID FETCH ${uid} (BODY.PEEK[])`);
    const raw = r.slice(r.indexOf("\r\n") + 2, r.lastIndexOf(")\r\n"));
    console.log(`From: ${header(raw, "From")}\nDate: ${header(raw, "Date")}\nSubject: ${header(raw, "Subject")}\n`);
    console.log(bodyText(raw).slice(0, Number(val("--chars") || 4000)));
  } else {
    const days = Number(val("--days") || 7);
    const since = new Date(Date.now() - days * 86400e3);
    const sinceStr = `${since.getDate()}-${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][since.getMonth()]}-${since.getFullYear()}`;
    const s = await cmd(`UID SEARCH ${flag("--unseen") ? "UNSEEN " : ""}SINCE ${sinceStr}`);
    const uids = (s.match(/\* SEARCH([^\r\n]*)/)?.[1] || "").trim().split(/\s+/).filter(Boolean);
    if (!uids.length) { console.log(`(no mail in the last ${days} days${flag("--unseen") ? ", unread" : ""})`); }
    else {
      const f = await cmd(`UID FETCH ${uids.join(",")} (FLAGS BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`);
      const msgs = [...f.matchAll(/\* \d+ FETCH \(UID (\d+) FLAGS \(([^)]*)\) BODY\[[^\]]*\] \{\d+\}\r\n([\s\S]*?)\r\n\r\n\)/g)];
      for (const [, uid, flags, head] of msgs) {
        const unread = /\\Seen/.test(flags) ? " " : "●";
        const date = new Date(header(head, "Date"));
        const from = header(head, "From").replace(/\s*<[^>]+>/, "");
        console.log(`${isNaN(date) ? "??" : date.toISOString().slice(5, 16).replace("T", " ")} ${unread} ${from.slice(0, 28).padEnd(28)} ${header(head, "Subject").slice(0, 80)}  #${uid}`);
      }
    }
  }
  await cmd("LOGOUT");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  sock.end();
}
