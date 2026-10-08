/**
 * Generates Chrome Web Store screenshots.
 *
 * The panel normally gets its report from the service worker, which needs a
 * real tab and a real user gesture. Rather than add a test hook to shipping
 * code, this stubs the two chrome APIs the panel calls, before the panel's own
 * scripts run. The report itself is genuine — produced by running the real
 * engine over store/demo-site.html.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer";
import { highlightElement } from "../src/content/highlight.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "store", "screenshots");

// `--lang=ko` renders the panel in Korean and writes panel.ko.png instead;
// the default pins English so the store set does not follow the machine's
// locale.
const LANG = process.argv.find((arg) => arg.startsWith("--lang="))?.slice(7) ?? "en";
const SUFFIX = LANG === "en" ? "" : `.${LANG}`;

const PAGE_WIDTH = 880;
const PANEL_WIDTH = 400;
const HEIGHT = 800;

const DEPENDENCIES = [
  "src/lib/color.js",
  "src/lib/dom.js",
  "src/rules/text-alternatives.js",
  "src/rules/contrast.js",
  "src/rules/structure.js",
  "src/rules/interaction.js",
];

await mkdir(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--force-device-scale-factor=1",
    "--hide-scrollbars",
  ],
});

try {
  /* ---------- 1. the page under test, and a real report for it ---------- */

  const site = await browser.newPage();
  await site.setViewport({ width: PAGE_WIDTH, height: HEIGHT, deviceScaleFactor: 2 });
  await site.goto(pathToFileURL(join(root, "store", "demo-site.html")).href, {
    waitUntil: "load",
  });

  for (const file of DEPENDENCIES) {
    await site.evaluate(await readFile(join(root, file), "utf8"));
  }
  const report = await site.evaluate(await readFile(join(root, "src/content/engine.js"), "utf8"));

  // Capture the page with a finding highlighted, not idle. The connection
  // between "the panel says this" and "that element, there" is the whole
  // product, and a screenshot of an untouched page does not show it.
  const featured = report.rules
    .find((rule) => rule.id === "input-label")
    ?.violations[0];
  if (!featured) throw new Error("demo page no longer trips input-label");

  await site.evaluate(highlightElement, featured.selector);
  // The overlay fades after 2.4s by design; capture inside that window.
  await new Promise((resolve) => setTimeout(resolve, 250));
  await site.screenshot({ path: join(outDir, "page.png") });

  // Make the URL presentable: a file:// path in a screenshot looks like a bug.
  report.url = "https://northbrook-dental.example/book";
  await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));

  console.log(
    `demo page → ${report.summary.violations} violations, ` +
      `${report.summary.review} to review across ${report.summary.rulesRun} checks`
  );

  /* ---------- 2. the panel, fed that report ---------- */

  const workerTarget = browser.targets().find((t) => t.type() === "service_worker");
  if (!workerTarget) throw new Error("extension service worker did not start");
  const extensionId = new URL(workerTarget.url()).host;

  const panel = await browser.newPage();
  await panel.setViewport({ width: PANEL_WIDTH, height: HEIGHT, deviceScaleFactor: 2 });

  panel.on("pageerror", (error) => console.error("  panel error:", error.message));
  panel.on("console", (message) => {
    if (message.type() === "error") console.error("  panel console:", message.text());
  });

  await panel.evaluateOnNewDocument((canned) => {
    // `chrome` itself is non-configurable on extension pages, so swap the one
    // method the panel uses to reach the service worker and leave the rest of
    // the real API in place.
    const passThrough = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (message) => {
      if (message?.type === "a11yscope:scan") return { report: canned };
      if (message?.type === "a11yscope:highlight") {
        return { ok: true, rect: { width: 208, height: 38 } };
      }
      return passThrough(message);
    };
  }, report);

  await panel.goto(`chrome-extension://${extensionId}/src/panel/panel.html?lang=${LANG}`, {
    waitUntil: "networkidle0",
  });

  await panel.click("#scan");
  await panel.waitForSelector(".rule", { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 350)); // let layout settle

  // Select the same finding that is highlighted on the page, so the two halves
  // of the screenshot are visibly about the same element.
  const selected = await panel.evaluate((needle) => {
    const target = [...document.querySelectorAll(".finding")].find((el) =>
      el.textContent.includes(needle)
    );
    if (!target) return false;
    target.click();
    return true;
  }, LANG === "ko" ? "만 있습니다" : "has only a placeholder");
  if (!selected) throw new Error("could not find the placeholder finding in the panel");
  await new Promise((resolve) => setTimeout(resolve, 200));

  await panel.screenshot({ path: join(outDir, `panel${SUFFIX}.png`) });

  // A second panel state: the footer, where the limits are stated. Being
  // up-front about what the tool cannot do belongs in the store listing too.
  await panel.evaluate(() => {
    document.querySelector(".footer")?.scrollIntoView({ block: "end" });
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await panel.screenshot({ path: join(outDir, `panel-footer${SUFFIX}.png`) });

  const rendered = await panel.evaluate(() => ({
    rules: document.querySelectorAll(".rule").length,
    findings: document.querySelectorAll(".finding").length,
    violations: document.getElementById("count-violations")?.textContent,
  }));
  console.log(
    `panel     → ${rendered.rules} rule cards, ${rendered.findings} findings, ` +
      `${rendered.violations} violations shown`
  );
} finally {
  await browser.close();
}
