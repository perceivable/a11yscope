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

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "store", "screenshots");

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
  await site.screenshot({ path: join(outDir, "page.png") });

  for (const file of DEPENDENCIES) {
    await site.evaluate(await readFile(join(root, file), "utf8"));
  }
  const report = await site.evaluate(await readFile(join(root, "src/content/engine.js"), "utf8"));

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

  await panel.goto(`chrome-extension://${extensionId}/src/panel/panel.html`, {
    waitUntil: "networkidle0",
  });

  await panel.click("#scan");
  await panel.waitForSelector(".rule", { timeout: 5000 });
  await new Promise((resolve) => setTimeout(resolve, 350)); // let layout settle

  await panel.screenshot({ path: join(outDir, "panel.png") });

  // A second panel state: the footer, where the limits are stated. Being
  // up-front about what the tool cannot do belongs in the store listing too.
  await panel.evaluate(() => {
    document.querySelector(".footer")?.scrollIntoView({ block: "end" });
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  await panel.screenshot({ path: join(outDir, "panel-footer.png") });

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
