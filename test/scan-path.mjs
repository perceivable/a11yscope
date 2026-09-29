/**
 * Exercises a scan against a real tab, which nothing else did — and that gap
 * is why 0.1.1 failed review. Every other test loaded the panel, or ran the
 * engine by injecting it directly, and both skipped the part that was broken:
 * the service worker deciding whether it may touch the page at all.
 *
 * What the reviewer saw was every ordinary page reporting "Browser pages and
 * the Chrome Web Store block extensions for security reasons". Two faults
 * behind it: `tab.url` is undefined without the `tabs` permission, so the
 * scannability check failed on everything; and `activeTab` was never granted,
 * because Chrome opening the panel on the action click consumed the very
 * gesture that grants it.
 *
 * The grant itself cannot be reproduced headlessly — it needs a real click on
 * the toolbar icon. What can be asserted, and is asserted here, is that when
 * access has not been granted the extension says so accurately and tells the
 * user what to do, rather than blaming the page.
 */
import { readFile } from "node:fs/promises";
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
  let target = null;
  for (let attempt = 0; attempt < 40 && !target; attempt += 1) {
    target = browser.targets().find((t) => t.type() === "service_worker");
    if (!target) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!target) throw new Error("service worker never registered");
  const worker = await target.worker();

  /* ---------- the worker must not depend on reading tab.url ---------- */

  const page = await browser.newPage();
  await page.goto("https://example.com", { waitUntil: "load" });
  await new Promise((resolve) => setTimeout(resolve, 400));

  const observed = await worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((t) => t.id >= 0);
    const seen = await chrome.tabs.get(tab.id);
    return { tabId: tab.id, url: seen.url ?? null };
  });

  if (observed.url !== null) {
    // If this ever starts returning a URL, the permission model changed and
    // the reasoning in service_worker.js needs revisiting.
    console.log(`  note: tab.url is readable here (${observed.url}) — unexpected but harmless`);
  }

  /* ---------- the refusal must be accurate and actionable ---------- */

  // Sent from the panel, not the worker: a context does not receive its own
  // runtime messages, so asking the worker to message itself proves nothing.
  const extensionId = new URL(target.url()).host;
  const panel = await browser.newPage();
  await panel.goto(`chrome-extension://${extensionId}/src/panel/panel.html`, {
    waitUntil: "domcontentloaded",
  });

  const outcome = await panel.evaluate(
    (tabId) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "a11yscope:scan", tabId }, resolve);
      }),
    observed.tabId
  );

  const message = outcome?.error ?? "";
  console.log(`  ungranted scan of https://example.com → ${message.slice(0, 72)}…`);

  if (outcome?.report) {
    console.log("  a scan succeeded without an explicit grant — nothing to assert");
  } else {
    if (!message) {
      problems.push("a failed scan returned neither a report nor an error message");
    }
    if (/browser pages|chrome web store/i.test(message)) {
      problems.push(
        `an ordinary https page was described as a browser page: "${message.slice(0, 90)}"`
      );
    }
    if (!/toolbar|icon/i.test(message)) {
      problems.push(
        `the message does not tell the user how to grant access: "${message.slice(0, 90)}"`
      );
    }
    if (outcome?.code !== "needs-grant") {
      problems.push(
        `an ungranted page was not classified as needs-grant (got ${outcome?.code}), ` +
          "so the panel would paint an instruction as an error"
      );
    }
    if (/Cannot access contents|must request permission/i.test(message)) {
      problems.push("Chrome's raw error text was shown to the user unmodified");
    }
  }

  /* ---------- the action click must be ours to handle ---------- */

  const source = await readFile(join(root, "src/background/service_worker.js"), "utf8");
  if (/openPanelOnActionClick:\s*true/.test(source)) {
    problems.push(
      "openPanelOnActionClick is true — Chrome consumes the click that grants activeTab"
    );
  }
  if (!/a11yscope:granted/.test(source)) {
    problems.push("an already-open panel is not told to rescan when the icon is clicked");
  }
  if (!/chrome\.action\.onClicked\.addListener/.test(source)) {
    problems.push("nothing handles the action click, so activeTab is never granted");
  }

  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (manifest.action?.default_popup) {
    problems.push("a default_popup would swallow the action click as well");
  }

  console.log("");
  if (problems.length) {
    console.log(`FAILED — ${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  · ${problem}`);
    process.exitCode = 1;
  } else {
    console.log("PASSED — refusals are accurate, and the action click is ours to grant on.");
  }
} finally {
  await browser.close();
}
