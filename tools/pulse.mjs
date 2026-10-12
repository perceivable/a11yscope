/**
 * Public signals, no logins: store users and rating, and comments on the
 * launch posts. Everything here is what any visitor can see.
 *
 *   node tools/pulse.mjs
 */
import puppeteer from "puppeteer";

const STORE = "https://chromewebstore.google.com/detail/ldbmeaihgdlghenedbhafkfikefnmicb?hl=en";
const POSTS = [
  ["velog", "https://velog.io/@perceivable/%EC%A0%91%EA%B7%BC%EC%84%B1-%EA%B2%80%EC%82%AC%EA%B8%B0%EB%A5%BC-%EB%A7%8C%EB%93%A4%EC%96%B4-gov.uk%EC%97%90-%EB%8F%8C%EB%A0%B8%EB%8D%94%EB%8B%88-72%EA%B1%B4%EC%9D%B4-%EB%82%98%EC%99%94%EB%8B%A4-%EC%A0%84%EB%B6%80-%EB%82%B4-%EB%B2%84%EA%B7%B8%EC%98%80%EB%8B%A4"],
];
const DEVTO = [4795578, 4831117];
const AWESOME_PRS = [16165];
const GEEKNEWS = "https://news.hada.io/user?id=perceivable"; // profile lists each post with points and comment count
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--lang=en-US"] });
try {
  const page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

  await page.goto(STORE, { waitUntil: "networkidle2", timeout: 45000 });
  const store = await page.evaluate(() => {
    const text = document.body.innerText;
    const users = text.match(/([\d,]+)\s+users?/i)?.[1] ?? "0";
    const rating = text.match(/(\d(?:\.\d)?)\s*out of 5/i)?.[1] ?? null;
    const ratings = text.match(/([\d,]+)\s+ratings?/i)?.[1] ?? "0";
    const version = text.match(/Version\s*\n?\s*([\d.]+)/i)?.[1] ?? "?";
    return { users, rating, ratings, version };
  });
  console.log(`store   users ${store.users} · ratings ${store.ratings}${store.rating ? ` (avg ${store.rating})` : ""} · live v${store.version}`);

  for (const [name, url] of POSTS) {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
    await new Promise((r) => setTimeout(r, 1200));
    const post = await page.evaluate(() => {
      const text = document.body.innerText;
      const count = text.match(/(\d+)\s*개의 댓글/)?.[1] ?? "0";
      const likes = document.querySelector("[class*='like'] span, [class*='Like']")?.textContent?.trim();
      const bodies = [...document.querySelectorAll("[class*='comment'] p, [class*='Comment'] p")]
        .map((p) => p.textContent.trim()).filter(Boolean).slice(0, 5);
      return { count, likes, bodies };
    });
    console.log(`${name.padEnd(7)} comments ${post.count}${post.likes ? ` · likes ${post.likes}` : ""}`);
    for (const b of post.bodies) console.log(`        › ${b.slice(0, 100)}`);
  }

  // GeekNews: the public profile shows "N점 · 댓글 M개" per post.
  await page.goto(GEEKNEWS, { waitUntil: "domcontentloaded", timeout: 45000 });
  const gn = await page.evaluate(() => {
    const text = document.body.innerText;
    return [...text.matchAll(/(Show GN: [^\n]{0,60})[^\n]*\n?[^\n]*?(\d+)점 · 댓글 (\d+)개/g)].map((m) => ({ title: m[1].trim(), points: m[2], comments: m[3] }));
  });
  for (const g of gn) console.log(`geeknews points ${g.points} · comments ${g.comments} — ${g.title.slice(0, 50)}`);
  if (!gn.length) console.log("geeknews (no posts parsed)");

  // dev.to blocks headless page loads, but its public API serves the same counts.
  for (const id of DEVTO) {
    const a = await (await fetch(`https://dev.to/api/articles/${id}`, { headers: { "User-Agent": UA } })).json();
    console.log(`dev.to  comments ${a.comments_count ?? "?"} · reactions ${a.public_reactions_count ?? "?"}`);
  }

  // 2호: MCP server. npm downloads (api.npmjs.org lags a day), registry versions, awesome-list PR.
  const j = async (url) => (await fetch(url, { headers: { "User-Agent": UA } })).json();
  const [week, month, npmDoc] = await Promise.all([
    j("https://api.npmjs.org/downloads/point/last-week/a11yscope-mcp"),
    j("https://api.npmjs.org/downloads/point/last-month/a11yscope-mcp"),
    j("https://registry.npmjs.org/a11yscope-mcp"),
  ]);
  console.log(`npm     downloads week ${week.downloads ?? "?"} · month ${month.downloads ?? "?"} · latest ${npmDoc["dist-tags"]?.latest}`);
  const reg = await j("https://registry.modelcontextprotocol.io/v0.1/servers?search=a11yscope");
  const regVersions = (reg.servers || []).map((s) => `${s.server.version}:${s._meta?.["io.modelcontextprotocol.registry/official"]?.status}`);
  console.log(`registry ${regVersions.join(" ") || "(not listed)"}`);
  const glama = await fetch("https://glama.ai/mcp/servers/perceivable/a11yscope", { headers: { "User-Agent": UA } });
  console.log(`glama   ${glama.status === 200 ? "listed" : `not listed (${glama.status})`} — submitted 2026-10-11`);
  // SNS: follower counts and unread-ish activity. Posting tools: bluesky.mjs, mastodon.mjs.
  const bsky = await j("https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=perceivable.bsky.social");
  console.log(`bluesky followers ${bsky.followersCount ?? "?"} · posts ${bsky.postsCount ?? "?"} (notifications: node tools/bluesky.mjs --notifications)`);
  const masto = await j("https://mastodon.social/api/v1/accounts/lookup?acct=perceivable");
  console.log(`mastodon followers ${masto.followers_count ?? "?"} · posts ${masto.statuses_count ?? "?"} (notifications: node tools/mastodon.mjs --notifications)`);
  for (const pr of AWESOME_PRS) {
    const p = await j(`https://api.github.com/repos/punkpeye/awesome-mcp-servers/pulls/${pr}`);
    console.log(`awesome PR #${pr} ${p.merged_at ? "merged" : p.state} · comments ${p.comments ?? "?"}`);
  }

  // Inbox (read-only IMAP, tools/mail.mjs): unread count and the newest unread subjects.
  {
    const { execFileSync } = await import("node:child_process");
    try {
      const lines = execFileSync(process.execPath, ["tools/mail.mjs", "--unseen", "--days", "14"], { encoding: "utf8", timeout: 30000 }).trim().split("\n").filter((l) => /#\d+$/.test(l));
      console.log(`mail    unread ${lines.length} (node tools/mail.mjs · --read <uid>)`);
      for (const l of lines.slice(-5)) console.log(`        › ${l.slice(0, 110)}`);
    } catch (e) {
      console.log(`mail    (unavailable: ${String(e.message).split("\n")[0].slice(0, 60)})`);
    }
  }
} finally {
  await browser.close();
}
