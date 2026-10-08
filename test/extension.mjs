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

    // Pinned to English: on a Korean-language machine Chrome for Testing
    // inherits the system locale, and the panel would follow it.
    await panel.goto(`chrome-extension://${extensionId}/src/panel/panel.html?lang=en`, {
      waitUntil: "networkidle0",
    });

    const wired = await panel.evaluate(() => {
      // Anything marked hidden must actually be invisible. The browser's
      // [hidden] rule loses to any class that sets display, which is how the
      // filter chips once showed before the first scan had run.
      const stillVisible = [...document.querySelectorAll("[hidden]")]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 || rect.height > 0;
        })
        .map((el) => el.id || el.className || el.tagName.toLowerCase());

      return {
        title: document.title,
        hasScanButton: !!document.getElementById("scan"),
        hasResults: !!document.getElementById("results"),
        chipCount: document.querySelectorAll(".chip").length,
        disclaimerPresent: document.body.textContent.includes("roughly a third"),
        stillVisible,
      };
    });

    if (!wired.hasScanButton) problems.push("panel is missing the scan button");
    if (!wired.hasResults) problems.push("panel is missing the results region");
    if (wired.chipCount !== 4) problems.push(`expected 4 filter chips, found ${wired.chipCount}`);
    if (!wired.disclaimerPresent) problems.push("panel is missing the automated-testing disclaimer");
    for (const id of wired.stillVisible) {
      problems.push(`element marked [hidden] is rendered anyway: ${id}`);
    }

    for (const error of consoleErrors) {
      problems.push(`panel console error: ${error}`);
    }

    console.log(
      `panel           → "${wired.title}", ${wired.chipCount} filters, ` +
        `${consoleErrors.length} console errors`
    );

    /* ---------- the same panel in Korean ---------- */

    // Chrome's UI language cannot be switched from here, so the panel's
    // ?lang= override stands in for it. What this proves is the wiring: the
    // dictionary loads as a module, the static strings get swapped before
    // first paint, and the manifest's __MSG_ placeholders resolve.
    const errorsBefore = consoleErrors.length;
    await panel.goto(`chrome-extension://${extensionId}/src/panel/panel.html?lang=ko`, {
      waitUntil: "networkidle0",
    });
    const korean = await panel.evaluate(() => ({
      lang: document.documentElement.lang,
      scan: document.getElementById("scan").textContent.trim(),
      disclaimer: document.body.textContent.includes("3분의 1"),
      manifestName: chrome.runtime.getManifest().name,
      leftover: [...document.querySelectorAll("[data-i18n]")]
        .map((el) => el.dataset.i18n)
        .filter((key) => /^[A-Za-z ,.…'-]+$/.test(document.querySelector(`[data-i18n="${key}"]`).textContent.trim())),
    }));
    if (korean.lang !== "ko") problems.push(`ko panel: <html lang> is "${korean.lang}"`);
    if (korean.scan !== "이 페이지 검사") problems.push(`ko panel: scan button reads "${korean.scan}"`);
    if (!korean.disclaimer) problems.push("ko panel: disclaimer is not in Korean");
    if (korean.manifestName.includes("__MSG_")) {
      problems.push(`manifest name did not localise: ${korean.manifestName}`);
    }
    for (const key of korean.leftover) problems.push(`ko panel: "${key}" is still in English`);
    for (const error of consoleErrors.slice(errorsBefore)) problems.push(`ko panel console error: ${error}`);

    console.log(
      `panel (ko)      → lang="${korean.lang}", "${korean.scan}", ` +
        `manifest "${korean.manifestName}"`
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
