/**
 * Service worker: owns tab access and injection, because the side panel cannot
 * call chrome.scripting itself.
 *
 * The permission model is the whole design here, and getting it wrong is what
 * failed review at 0.1.1:
 *
 *   `activeTab` is granted when the user *invokes* the extension, and it is
 *   the click on the toolbar icon that counts. Letting Chrome open the panel
 *   automatically (`openPanelOnActionClick`) consumes that click without
 *   granting anything, so every injection afterwards failed. The action click
 *   is therefore handled here: it grants access to that tab, and then opens
 *   the panel.
 *
 *   Nor can the URL be read to decide whether a page is scannable —
 *   `tab.url` is undefined without the `tabs` permission, which we do not ask
 *   for. So nothing is pre-judged: the injection is attempted, and Chrome's
 *   own refusal is translated into something the user can act on.
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

chrome.runtime.onInstalled.addListener(() => {
  // Fires on update too, which matters: installs carrying the old behaviour
  // need it turned off.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error) => console.error("[A11yScope] panel behavior:", error));
});

chrome.action.onClicked.addListener(async (tab) => {
  // Reaching this listener means the user invoked the extension, so activeTab
  // is now granted for this tab. Opening the panel needs that same gesture.
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error("[A11yScope] could not open the side panel:", error);
  }

  // If the panel was already open it does not reload, so it would sit there
  // showing the old page's results while the user wonders why the click did
  // nothing. Tell it to scan the tab that was just granted. A panel that is
  // still loading scans on its own and simply is not listening yet.
  chrome.runtime
    .sendMessage({ type: "a11yscope:granted", tabId: tab.id })
    .catch(() => {});
});

async function scanTab(tabId) {
  const target = { tabId, allFrames: false };

  await chrome.scripting.executeScript({ target, files: SCAN_DEPENDENCIES });
  const [injection] = await chrome.scripting.executeScript({ target, files: [ENGINE] });

  if (!injection || !injection.result) {
    return { error: "The scan returned no result. Try reloading the page.", code: "no-result" };
  }
  return { report: injection.result };
}

chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  if (message?.type === "a11yscope:scan") {
    scanTab(message.tabId)
      .then(respond)
      .catch((error) => respond(refusal(error)));
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
      .catch((error) => respond({ ok: false, reason: refusal(error).error }));
    return true;
  }

  return false;
});

/**
 * Turn Chrome's injection errors into something that tells the user what to do.
 *
 * The distinction that matters: a page extensions may never touch, versus a
 * page we simply have not been granted access to yet. The second is one click
 * away from working, and saying so is the difference between a bug report and
 * a solved problem. "needs-grant" is therefore not a failure, and the panel
 * presents it as an instruction rather than an error.
 *
 * The `code` is what the panel translates on; the English `error` is the
 * fallback and what ends up in a bug report.
 */
function refusal(error) {
  const text = String(error?.message ?? error);

  if (/chrome:\/\/|chrome-extension:\/\/|edge:\/\/|about:|devtools:\/\//.test(text)) {
    return {
      code: "browser-page",
      error:
        "Browser pages cannot be scanned — Chrome blocks extensions there for " +
        "security reasons. Open an ordinary web page and scan again.",
    };
  }
  if (text.includes("Cannot access contents") || text.includes("must request permission")) {
    return {
      code: "needs-grant",
      error:
        "To scan this page, click the A11yScope icon in the toolbar. Chrome " +
        "only lets the extension read a page after you click it there, so it " +
        "never sees pages you have not asked it to check.",
    };
  }
  if (text.includes("No tab with id")) {
    return { code: "tab-closed", error: "That tab was closed. Open the page again and rescan." };
  }
  if (text.includes("The extensions gallery cannot be scripted")) {
    return {
      code: "web-store",
      error:
        "The Chrome Web Store cannot be scanned — Chrome blocks extensions " +
        "there. Open an ordinary web page and scan again.",
    };
  }
  return { code: "failed", error: text };
}
