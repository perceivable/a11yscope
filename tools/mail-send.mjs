#!/usr/bin/env node
/**
 * Send one plain-text mail from perceivablehq@gmail.com over SMTP (no library).
 * Replies thread correctly: the original's Message-ID goes into In-Reply-To /
 * References, fetched over IMAP by uid (same uids tools/mail.mjs prints).
 *
 *   node tools/mail-send.mjs --reply <uid> --body msg.txt [--cc a@b.c] [--dry-run]
 *   node tools/mail-send.mjs --to a@b.c --subject "..." --body msg.txt [--dry-run]
 *
 * --dry-run prints the exact message and sends nothing. Gmail files what this
 * sends under Sent Mail by itself. Password: ~/.config/perceivable/gmail.apppw.
 */
import { connect } from "node:tls";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { hostname } from "node:os";

const USER = "perceivablehq@gmail.com";
const NAME = "Perceivable";
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const pw = (await readFile(join(homedir(), ".config", "perceivable", "gmail.apppw"), "utf8")).trim();
if (!val("--body")) { console.error("need --body <file>"); process.exit(2); }
const bodyText = (await readFile(val("--body"), "utf8")).replace(/\r?\n/g, "\r\n").replace(/\s+$/, "") + "\r\n";

/* ---------- line-oriented TLS client used for both IMAP and SMTP ---------- */
function client(host, port, isDone) {
  const sock = connect({ host, port, servername: host });
  let buf = "";
  const waiters = [];
  sock.setEncoding("utf8");
  sock.on("data", (d) => { buf += d; pump(); });
  sock.on("error", (e) => { console.error(`${host}: ${e.message}`); process.exit(1); });
  function pump() {
    while (waiters.length) {
      const w = waiters[0];
      const end = isDone(buf, w.tag);
      if (end < 0) return;
      const chunk = buf.slice(0, end);
      buf = buf.slice(end);
      waiters.shift();
      w.resolve(chunk);
    }
  }
  const send = (text, tag) => new Promise((resolve) => { waiters.push({ tag, resolve }); if (text !== null) sock.write(text); });
  const ready = new Promise((r) => sock.once("secureConnect", r));
  return { sock, send, ready };
}

/* ---------- original message headers (for --reply) ---------- */
const header = (block, name) => {
  const m = block.match(new RegExp(`^${name}:[ \\t]*([^\\r\\n]*(?:\\r\\n[ \\t][^\\r\\n]*)*)`, "im"));
  return m ? m[1].replace(/\r\n[ \t]+/g, " ").trim() : "";
};
let to = val("--to"), subject = val("--subject"), inReplyTo = "", references = "";
if (val("--reply")) {
  let n = 0;
  const imap = client("imap.gmail.com", 993, (b, tag) => {
    const m = b.match(new RegExp(`(^|\\r\\n)${tag} (OK|NO|BAD)[^\\r\\n]*\\r\\n`));
    return m ? m.index + m[0].length : -1;
  });
  await imap.ready;
  await imap.send(null, "*"); // greeting: wait for the untagged OK line
  const cmd = (t) => { const tag = `A${String(++n).padStart(3, "0")}`; return imap.send(`${tag} ${t}\r\n`, tag); };
  await cmd(`LOGIN "${USER}" "${pw}"`);
  await cmd("SELECT INBOX");
  const r = await cmd(`UID FETCH ${val("--reply")} (BODY.PEEK[HEADER.FIELDS (MESSAGE-ID REFERENCES FROM REPLY-TO SUBJECT)])`);
  if (!/FETCH/.test(r)) { console.error(`uid ${val("--reply")} not found in INBOX`); process.exit(1); }
  const msgId = header(r, "Message-ID");
  to ||= header(r, "Reply-To") || header(r, "From");
  const orig = header(r, "Subject");
  subject ||= /^re:/i.test(orig) ? orig : `Re: ${orig}`;
  inReplyTo = msgId;
  references = [header(r, "References"), msgId].filter(Boolean).join(" ");
  await cmd("LOGOUT");
  imap.sock.end();
}
if (!to || !subject) { console.error("need --to and --subject (or --reply <uid>)"); process.exit(2); }

/* ---------- build the message ---------- */
const encWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const addrs = (s) => s.split(",").map((a) => a.trim()).filter(Boolean);
const cc = val("--cc") ? addrs(val("--cc")) : [];
const rcpts = [...addrs(to), ...cc].map((a) => a.match(/<([^>]+)>/)?.[1] || a);
const msgid = `<${Date.now()}.${Math.random().toString(36).slice(2)}@perceivable.mail>`;
const lines = [
  `From: ${NAME} <${USER}>`,
  `To: ${to}`,
  ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
  `Subject: ${encWord(subject)}`,
  `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
  `Message-ID: ${msgid}`,
  ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${references}`] : []),
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: 8bit",
  "",
  bodyText.replace(/^\./gm, ".."), // dot-stuffing
];
const message = lines.join("\r\n");

if (flag("--dry-run")) {
  console.log(`[dry-run] would send to ${rcpts.join(", ")}\n`);
  console.log(message);
  process.exit(0);
}

/* ---------- SMTP ---------- */
const smtp = client("smtp.gmail.com", 465, (b) => {
  // A reply is complete at the first line whose 4th char is a space (not '-').
  const m = b.match(/(^|\r\n)\d{3} [^\r\n]*\r\n/);
  return m ? m.index + m[0].length : -1;
});
await smtp.ready;
const expect = async (text, code) => {
  const r = await smtp.send(text, null);
  const last = r.trim().split("\r\n").pop();
  if (!last.startsWith(code)) { console.error(`smtp: expected ${code}, got: ${last}`); process.exit(1); }
  return last;
};
await expect(null, "220");
await expect(`EHLO ${hostname() || "localhost"}\r\n`, "250");
await expect(`AUTH PLAIN ${Buffer.from(`\0${USER}\0${pw}`).toString("base64")}\r\n`, "235");
await expect(`MAIL FROM:<${USER}>\r\n`, "250");
for (const r of rcpts) await expect(`RCPT TO:<${r}>\r\n`, "250");
await expect("DATA\r\n", "354");
const ok = await expect(`${message}\r\n.\r\n`, "250");
await expect("QUIT\r\n", "221");
smtp.sock.end();
console.log(`sent to ${rcpts.join(", ")} — ${ok}`);
