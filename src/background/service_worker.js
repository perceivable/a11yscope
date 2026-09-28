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
});

async function scanTab(tabId) {
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
      .catch((error) => respond({ error: friendlyError(error) }));
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

/**
 * Turn Chrome's injection errors into something that tells the user what to do.
 *
 * The distinction that matters: a page extensions may never touch, versus a
 * page we simply have not been granted access to yet. The second is one click
 * away from working, and saying so is the difference between a bug report and
 * a solved problem.
 */
function friendlyError(error) {
  const text = String(error?.message ?? error);

  if (/chrome:\/\/|chrome-extension:\/\/|edge:\/\/|about:|devtools:\/\//.test(text)) {
    return (
      "Browser pages cannot be scanned — Chrome blocks extensions there for " +
      "security reasons. Open an ordinary web page and scan again."
    );
  }
  if (text.includes("Cannot access contents") || text.includes("must request permission")) {
    return (
      "A11yScope has not been given access to this tab yet. Click the " +
      "A11yScope icon in the toolbar while this page is open, then scan again. " +
      "Access lasts until you navigate away, and is never granted to pages you " +
      "have not scanned."
    );
  }
  if (text.includes("No tab with id")) {
    return "That tab was closed. Open the page again and rescan.";
  }
  if (text.includes("The extensions gallery cannot be scripted")) {
    return (
      "The Chrome Web Store cannot be scanned — Chrome blocks extensions " +
      "there. Open an ordinary web page and scan again."
    );
  }
  return text;
}
