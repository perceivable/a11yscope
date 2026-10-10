/**
 * Post to GeekNews (news.hada.io) as the Perceivable account. GeekNews has no
 * API, so this drives a real Chrome with a persistent profile that stays logged
 * in: ~/.config/perceivable/geeknews-profile (mode 700, outside every repo).
 *
 *   node tools/geeknews.mjs --login                       # once: a window opens, sign in (check "remember"), it closes itself
 *   node tools/geeknews.mjs --inspect                     # print the /write form fields (logged in)
 *   node tools/geeknews.mjs --post post.json --dry-run    # fill the form, do not submit, close
 *   node tools/geeknews.mjs --post post.json              # fill the form and hand the window to a human
 *
 * The /write form is gated by a Cloudflare Turnstile that keeps the "등록"
 * button disabled until a human passes it. CAPTCHAs are the user's job, so the
 * tool never submits: it fills everything, leaves the window open, and the user
 * solves the challenge and presses 등록. Afterwards check the public profile
 * (https://news.hada.io/user?id=perceivable) for the new post.
 *
 * post.json: { "type": "show" | "url" | "ask", "title": "...", "url": "...", "text": "..." }
 * (verified 2026-10-10: /write has radios #type_url/#type_ask/#type_show, #title, #url, #contents)
 */
import puppeteer from "puppeteer";
import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PROFILE = join(homedir(), ".config", "perceivable", "geeknews-profile");
const SITE = "https://news.hada.io";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);

mkdirSync(PROFILE, { recursive: true, mode: 0o700 });
chmodSync(PROFILE, 0o700);

const launch = () =>
  puppeteer.launch({
    headless: false,
    userDataDir: PROFILE,
    defaultViewport: null,
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1100,900"],
    protocolTimeout: 30000,
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Logged out, the header shows a "로그인" link; logged in, it shows the username.
const loggedIn = (page) => page.evaluate(() => !document.querySelector('a[href="/login"]'));

async function gotoNew(page) {
  await page.goto(`${SITE}/write`, { waitUntil: "networkidle2", timeout: 45000 });
  if (!(await loggedIn(page))) throw new Error("not logged in — run with --login first");
}

const browser = await launch();
try {
  const page = (await browser.pages())[0];
  // A native dialog (alert/confirm) blocks every CDP call; log it and dismiss.
  page.on("dialog", async (d) => { console.log(`dialog [${d.type()}]: ${d.message()}`); await d.dismiss(); });
  const step = (m) => console.log(`· ${m}`);

  if (flag("--login")) {
    await page.goto(`${SITE}/login`, { waitUntil: "networkidle2", timeout: 45000 });
    if (await loggedIn(page)) {
      console.log("already logged in — nothing to do");
    } else {
      await page.evaluate(() => { const r = document.querySelector("#remember"); if (r && !r.checked) r.click(); });
      console.log("sign in to GeekNews in the window (username + password, remember is pre-checked). Waiting up to 30 minutes…");
      const deadline = Date.now() + 30 * 60 * 1000;
      let ok = false;
      while (Date.now() < deadline) {
        await sleep(3000);
        if (await loggedIn(page).catch(() => false)) { ok = true; break; }
      }
      if (!ok) throw new Error("no login within 30 minutes");
      await sleep(1500);
      console.log("logged in — session saved to", PROFILE);
    }
  } else if (flag("--inspect")) {
    await gotoNew(page);
    console.log(page.url(), "|", await page.title());
    console.log(await page.evaluate(() =>
      [...document.querySelectorAll("form, input, textarea, select, button, label")]
        .map((e) => `<${e.tagName.toLowerCase()} ${["id", "name", "type", "action", "method", "for", "placeholder", "maxlength", "required"].filter((a) => e.hasAttribute(a)).map((a) => `${a}=${e.getAttribute(a)}`).join(" ")}> ${e.textContent.trim().replace(/\s+/g, " ").slice(0, 40)}`)
        .join("\n")));
  } else if (value("--post")) {
    const post = JSON.parse(readFileSync(value("--post"), "utf8"));
    for (const k of ["title", "url", "text"]) if (!post[k]) throw new Error(`post.json is missing "${k}"`);
    await gotoNew(page);
    const typeSel = `#type_${post.type || "show"}`;
    await page.waitForSelector(typeSel, { timeout: 20000 });
    // Puppeteer mouse clicks (Input.dispatchMouseEvent) hang on this Mac, like
    // Page.captureScreenshot does; drive the form from page JavaScript instead.
    await page.$eval(`label[for="${typeSel.slice(1)}"]`, (el) => el.click());
    if (!(await page.$eval(typeSel, (el) => el.checked))) throw new Error(`${typeSel} did not get checked`);
    const F = { title: "#title", url: "#url", text: "#contents" };
    step("type selected");
    for (const [k, sel] of Object.entries(F)) {
      await page.waitForSelector(sel, { visible: true, timeout: 20000 });
      // Plain server-rendered form: set the value and fire input/change so any
      // listeners see it. Typing 1,500 characters key by key took minutes.
      await page.$eval(sel, (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, post[k]);
      const got = await page.$eval(sel, (el) => el.value);
      if (got !== post[k]) throw new Error(`${k}: field content differs after filling (${got.length} vs ${post[k].length} chars)`);
      step(`${k} filled (${got.length} chars)`);
    }
    const submit = await page.$("#write-submit");
    if (!submit) throw new Error("submit button #write-submit not found");
    const disabled = await submit.evaluate((el) => el.disabled);
    step(`form filled; 등록 button ${disabled ? "disabled (Turnstile pending)" : "enabled"}`);
    if (flag("--dry-run")) {
      console.log(`dry run: type=${post.type || "show"}, title ${post.title.length} chars, url ${post.url}, text ${post.text.length} chars — not submitted`);
    } else {
      console.log("handing over: the window stays open — pass the Turnstile check if shown, read the form once more, and press 등록.");
      await browser.disconnect();
      process.exit(0);
    }
  } else {
    console.error("usage: --login | --inspect | --post post.json [--dry-run]");
    process.exitCode = 2;
  }
} finally {
  await browser.close();
}
