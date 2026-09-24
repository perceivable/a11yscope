/**
 * Service worker: owns tab access and injection, because the side panel cannot
 * call chrome.scripting itself.
 *
 * Deliberately uses activeTab rather than broad host permissions — the
 * extension can only read a page the user explicitly ran a scan on. That keeps
 * the Web Store permission warning to a minimum, which matters for both review
 * and install conversion.
 */
import { highlightElement } from "../content/highlight.js";

/** Order matters: libs define the namespace, rules register into it. */
const SCAN_DEPENDENCIES = [
  "src/lib/color.js",
  "src/lib/dom.js",
  "src/rules/text-alternatives.js",
  "src/rules/contrast.js",
  "src/rules/structure.js",
  "src/rules/interaction.js",
];

const ENGINE = "src/content/engine.js";

const RESTRICTED_PREFIXES = [
  "chrome://", "chrome-extension://", "edge://", "about:", "devtools://",
  "https://chrome.google.com/webstore", "https://chromewebstore.google.com",
  "view-source:",
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("[A11yScope] panel behavior:", error));
});

function isScannable(url) {
  if (!url) return false;
  return !RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function scanTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isScannable(tab.url)) {
    return {
      error:
        "This page cannot be scanned. Browser pages and the Chrome Web Store " +
        "block extensions for security reasons — open a normal web page and try again.",
    };
  }

  const target = { tabId, allFrames: false };

  await chrome.scripting.executeScript({ target, files: SCAN_DEPENDENCIES });
  const [injection] = await chrome.scripting.executeScript({ target, files: [ENGINE] });

  if (!injection || !injection.result) {
    return { error: "The scan returned no result. Try reloading the page." };
  }
  return { report: injection.result };
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === "a11yscope:scan") {
    scanTab(message.tabId)
      .then(respond)
      .catch((error) => {
        console.error("[A11yScope] scan failed:", error);
        respond({ error: friendlyError(error) });
      });
    return true; // keep the message channel open for the async reply
  }

  if (message?.type === "a11yscope:highlight") {
    chrome.scripting
      .executeScript({
        target: { tabId: message.tabId, allFrames: false },
        func: highlightElement,
        args: [message.selector],
      })
      .then(([injection]) => respond(injection?.result ?? { ok: false }))
      .catch((error) => respond({ ok: false, reason: friendlyError(error) }));
    return true;
  }

  return false;
});

function friendlyError(error) {
  const text = String(error?.message ?? error);
  if (text.includes("Cannot access contents")) {
    return (
      "Chrome blocked access to this page. Click the A11yScope toolbar icon " +
      "while the page is in focus, then scan again."
    );
  }
  if (text.includes("No tab with id")) {
    return "That tab was closed. Open the page again and rescan.";
  }
  return text;
}
