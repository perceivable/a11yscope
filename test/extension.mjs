/**
 * Smoke test for the packaged extension itself.
 *
 * The rule tests exercise the engine in a bare page, which would still pass if
 * manifest.json were malformed or the service worker failed to import. This
 * loads the real extension into Chromium and checks that the worker boots and
 * the panel renders.
 */
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

const browser = await puppeteer.launch({
  headless: true,
  args: [
    `--disable-extensions-except=${root}`,
    `--load-extension=${root}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});

try {
  // The worker registers asynchronously; poll rather than sleep a fixed time.
  let worker = null;
  for (let attempt = 0; attempt < 40 && !worker; attempt += 1) {
    worker = browser.targets().find((t) => t.type() === "service_worker");
    if (!worker) await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!worker) {
    problems.push("service worker never registered — check manifest.json and the worker's imports");
  } else {
    console.log(`service worker  → ${worker.url()}`);

    const extensionId = new URL(worker.url()).host;
    const workerHandle = await worker.worker();

    const apis = await workerHandle.evaluate(() => ({
      scripting: typeof chrome?.scripting?.executeScript === "function",
      sidePanel: typeof chrome?.sidePanel?.setPanelBehavior === "function",
      storage: typeof chrome?.storage?.local?.get === "function",
    }));
    for (const [name, present] of Object.entries(apis)) {
      if (!present) problems.push(`chrome.${name} is unavailable to the service worker`);
    }
    console.log(`worker APIs     → ${Object.keys(apis).filter((k) => apis[k]).join(", ")}`);

    /* ---------- panel ---------- */

    const panel = await browser.newPage();
    const consoleErrors = [];
    panel.on("pageerror", (error) => consoleErrors.push(String(error.message)));
    panel.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await panel.goto(`chrome-extension://${extensionId}/src/panel/panel.html`, {
      waitUntil: "networkidle0",
    });

    const wired = await panel.evaluate(() => ({
      title: document.title,
      hasScanButton: !!document.getElementById("scan"),
      hasResults: !!document.getElementById("results"),
      chipCount: document.querySelectorAll(".chip").length,
      disclaimerPresent: document.body.textContent.includes("roughly a third"),
    }));

    if (!wired.hasScanButton) problems.push("panel is missing the scan button");
    if (!wired.hasResults) problems.push("panel is missing the results region");
    if (wired.chipCount !== 4) problems.push(`expected 4 filter chips, found ${wired.chipCount}`);
    if (!wired.disclaimerPresent) problems.push("panel is missing the automated-testing disclaimer");

    for (const error of consoleErrors) {
      problems.push(`panel console error: ${error}`);
    }

    console.log(
      `panel           → "${wired.title}", ${wired.chipCount} filters, ` +
        `${consoleErrors.length} console errors`
    );
  }

  console.log("");
  if (problems.length) {
    console.log(`FAILED — ${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  · ${problem}`);
    process.exitCode = 1;
  } else {
    console.log("PASSED — extension loads, worker boots, panel renders clean.");
  }
} finally {
  await browser.close();
}
