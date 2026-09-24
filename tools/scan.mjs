/**
 * Command-line scanner: runs the real engine against a URL or local file and
 * prints the findings.
 *
 *   node tools/scan.mjs https://example.com
 *   node tools/scan.mjs store/privacy-site/index.html
 *   node tools/scan.mjs https://example.com --json
 *
 * Used to hunt false positives on real sites, which is the work that decides
 * whether anyone trusts this tool.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import puppeteer from "puppeteer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEPENDENCIES = [
  "src/lib/color.js",
  "src/lib/dom.js",
  "src/rules/text-alternatives.js",
  "src/rules/contrast.js",
  "src/rules/structure.js",
  "src/rules/interaction.js",
];

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const showReview = args.includes("--review");
const target = args.find((arg) => !arg.startsWith("--"));

if (!target) {
  console.error("usage: node tools/scan.mjs <url|file> [--json] [--review]");
  process.exit(1);
}

const url = /^https?:\/\//.test(target)
  ? target
  : pathToFileURL(resolve(root, target)).href;

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  // A real-world user agent: some sites serve a stripped page to headless.
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
  );

  await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

  for (const file of DEPENDENCIES) {
    await page.evaluate(await readFile(join(root, file), "utf8"));
  }
  const report = await page.evaluate(await readFile(join(root, "src/content/engine.js"), "utf8"));

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const { summary } = report;
    console.log(`\n${report.title || "(untitled)"}`);
    console.log(`${report.url}\n`);
    console.log(
      `${summary.violations} violations · ${summary.review} to review · ` +
        `${summary.rulesPassed}/${summary.rulesRun} checks passed · ` +
        `${summary.elementsScanned} elements · ${summary.durationMs}ms\n`
    );

    for (const rule of report.rules.filter((r) => r.violations.length)) {
      console.log(`[${rule.impact}] ${rule.title}  (WCAG ${rule.wcag.join(", ")})`);
      for (const finding of rule.violations.slice(0, 8)) {
        console.log(`   · ${finding.message}`);
        console.log(`     ${finding.selector}`);
      }
      if (rule.violations.length > 8) {
        console.log(`   … and ${rule.violations.length - 8} more`);
      }
      console.log("");
    }

    if (showReview) {
      for (const rule of report.rules.filter((r) => r.review.length)) {
        console.log(`[review] ${rule.title}`);
        for (const finding of rule.review.slice(0, 8)) {
          console.log(`   · ${finding.message}`);
        }
        console.log("");
      }
    }

    if (report.engineErrors.length) {
      console.log("engine errors:");
      for (const failure of report.engineErrors) {
        console.log(`   · ${failure.id}: ${failure.error}`);
      }
    }
  }
} finally {
  await browser.close();
}
