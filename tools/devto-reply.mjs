/**
 * Reply to a dev.to comment as `perceivable`. The public API cannot create
 * comments (POST /api/comments → 404), so this drives a real Chrome with a
 * persistent profile that stays logged in. The profile lives outside every
 * repo, next to the API key:  ~/.config/perceivable/devto-profile  (mode 700).
 *
 *   node tools/devto-reply.mjs --login                       # once: a window opens, sign in, it closes itself
 *   node tools/devto-reply.mjs --reply 3geh2 --file reply.md # post the file as a reply to comment 3geh2
 *   node tools/devto-reply.mjs --reply 3geh2 --file reply.md --dry-run   # fill the form, do not submit
 *
 * No screenshots: Page.captureScreenshot hangs on this Mac (see NEXT_STEPS).
 *
 * The comment id is the `id_code` from the API (the last path segment of
 * https://dev.to/<user>/comment/<id_code>). After posting, the script re-reads
 * the thread through the API and prints the new reply, so what it says is what
 * is actually on the site.
 */
import puppeteer from "puppeteer";
import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROFILE = join(homedir(), ".config", "perceivable", "devto-profile");
const ARTICLE = 4795578;
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

mkdirSync(PROFILE, { recursive: true, mode: 0o700 });
chmodSync(PROFILE, 0o700);

const launch = () =>
  puppeteer.launch({
    headless: false, // dev.to refuses headless page loads
    userDataDir: PROFILE,
    defaultViewport: null,
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1100,900", "--lang=en-US"],
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loggedIn(page) {
  // Logged out, /dashboard redirects to the sign-in page (/enter or /magic_links/new).
  await page.goto("https://dev.to/dashboard", { waitUntil: "domcontentloaded", timeout: 45000 });
  return page.url().startsWith("https://dev.to/dashboard");
}

async function api(path) {
  const res = await fetch(`https://dev.to/api${path}`, { headers: { "User-Agent": "a11yscope-devto-reply" } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function findReply(comments, parentCode, since) {
  for (const c of comments) {
    if (c.id_code === parentCode) {
      return c.children.find((r) => r.user.username === "perceivable" && new Date(r.created_at) >= since) ?? null;
    }
    const inner = findReply(c.children ?? [], parentCode, since);
    if (inner) return inner;
  }
  return null;
}

if (flag("--login")) {
  const browser = await launch();
  try {
    const page = (await browser.pages())[0];
    if (await loggedIn(page)) {
      console.log("already logged in — nothing to do");
    } else {
      await page.goto("https://dev.to/enter", { waitUntil: "domcontentloaded" });
      console.log("sign in to dev.to in the window (one-time email code to perceivablehq@gmail.com, or the GitHub button). Waiting up to 10 minutes…");
      const deadline = Date.now() + 10 * 60 * 1000;
      let ok = false;
      while (Date.now() < deadline) {
        await sleep(3000);
        const cookies = await page.cookies("https://dev.to");
        const signedIn = await page.evaluate(() => document.querySelector('meta[name="user-signed-in"]')?.content === "true").catch(() => false);
        if (signedIn || cookies.some((c) => c.name === "remember_user_token")) { ok = true; break; }
      }
      if (!ok) throw new Error("no login within 10 minutes");
      await sleep(2000);
      if (!(await loggedIn(page))) throw new Error("cookie set but /dashboard still redirects to sign-in");
      console.log("logged in — session saved to", PROFILE);
    }
  } finally {
    await browser.close();
  }
  process.exit(0);
}

const parentCode = value("--reply");
const file = value("--file");
if (!parentCode || !file) {
  console.error("usage: --login | --reply <id_code> --file <markdown> [--dry-run]");
  process.exit(2);
}
const body = readFileSync(file, "utf8").trim();
if (!body) throw new Error(`${file} is empty`);

const parent = await api(`/comments/${parentCode}`);
const permalink = `https://dev.to/${parent.user.username}/comment/${parentCode}`;
console.log(`replying to @${parent.user.username} — ${permalink}`);
const started = new Date(Date.now() - 60 * 1000);

const browser = await launch();
try {
  const page = (await browser.pages())[0];
  if (!(await loggedIn(page))) throw new Error("not logged in — run with --login first");

  await page.goto(permalink, { waitUntil: "networkidle2", timeout: 45000 });

  // The permalink page renders the comment as #comment-node-<numeric id>; the
  // API only gives id_code, which is the numeric id in base 26. The "Reply"
  // button reveals a form scoped to that comment (verified 2026-10-09).
  const id = parseInt(parentCode, 26);
  const commentSel = `#comment-node-${id}`;
  await page.waitForSelector(commentSel, { timeout: 20000 });
  const replyButton = await page.$(`${commentSel} button[data-testid="reply-button-${id}"]`);
  if (!replyButton) throw new Error(`reply button not found in ${commentSel}`);
  await replyButton.click();

  // Focusing the textarea swaps it for an enhanced editor, so never keep a
  // handle across the click: re-query by id after the swap settles.
  const taSel = `#textarea-for-${id}`;
  await page.waitForSelector(taSel, { visible: true, timeout: 20000 });
  await page.click(taSel);
  await sleep(1500);
  await page.focus(taSel);
  await page.type(taSel, body, { delay: 2 });
  await sleep(500);
  const typed = await page.$eval(taSel, (el) => el.value);
  if (typed.trim() !== body) throw new Error(`textarea content differs from the file after typing:\n${JSON.stringify(typed)}`);
  const parentField = await page.$eval(`#new-comment-${id} input[name="comment[parent_id]"]`, (el) => el.value);
  if (parentField !== String(id)) throw new Error(`form parent_id ${parentField} ≠ ${id}`);

  if (flag("--dry-run")) {
    const submits = await page.$$eval(`#new-comment-${id} button[type="submit"]`, (els) => els.map((e) => e.textContent.trim()));
    if (submits.length !== 1) throw new Error(`expected one submit button, found ${submits.length}: ${submits.join(" | ")}`);
    console.log(`dry run: form for comment ${id} filled with ${typed.length} chars, submit button "${submits[0]}" present, not submitted`);
  } else {
    const submit = await page.$(`#new-comment-${id} button[type="submit"]`);
    if (!submit) throw new Error("submit button not found");
    await submit.click();
    // Confirm through the API, not the DOM: the reply must exist on the server.
    let reply = null;
    for (let i = 0; i < 10 && !reply; i++) {
      await sleep(3000);
      reply = findReply(await api(`/comments?a_id=${ARTICLE}`), parentCode, started);
    }
    if (!reply) throw new Error("submitted, but the reply did not appear in the API within 30s — check the site");
    console.log(`posted: https://dev.to/perceivable/comment/${reply.id_code} (${reply.created_at})`);
  }
} finally {
  await browser.close();
}
