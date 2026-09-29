/**
 * Public signals, no logins: store users and rating, and comments on the
 * launch posts. Everything here is what any visitor can see.
 *
 *   node tools/pulse.mjs
 */
import puppeteer from "puppeteer";

const STORE = "https://chromewebstore.google.com/detail/ldbmeaihgdlghenedbhafkfikefnmicb";
const POSTS = [
  ["velog", "https://velog.io/@perceivable/%EC%A0%91%EA%B7%BC%EC%84%B1-%EA%B2%80%EC%82%AC%EA%B8%B0%EB%A5%BC-%EB%A7%8C%EB%93%A4%EC%96%B4-gov.uk%EC%97%90-%EB%8F%8C%EB%A0%B8%EB%8D%94%EB%8B%88-72%EA%B1%B4%EC%9D%B4-%EB%82%98%EC%99%94%EB%8B%A4-%EC%A0%84%EB%B6%80-%EB%82%B4-%EB%B2%84%EA%B7%B8%EC%98%80%EB%8B%A4"],
];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
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
} finally {
  await browser.close();
}
