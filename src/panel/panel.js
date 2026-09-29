/**
 * Side panel controller.
 *
 * Holds the last report in memory, renders it, and talks to the service worker
 * for anything that needs tab access.
 */
import { isPro } from "../lib/license.js";
import { buildReport } from "./report.js";

const els = {
  scan: document.getElementById("scan"),
  status: document.getElementById("status"),
  summary: document.getElementById("summary"),
  toolbar: document.getElementById("toolbar"),
  results: document.getElementById("results"),
  exportButton: document.getElementById("export"),
  exportBadge: document.getElementById("export-badge"),
  countViolations: document.getElementById("count-violations"),
  countReview: document.getElementById("count-review"),
  countPassed: document.getElementById("count-passed"),
  scanMeta: document.getElementById("scan-meta"),
};

let report = null;
let filter = "all";
let tabId = null;
let pro = false;

function setStatus(text, variant) {
  els.status.hidden = false;
  els.status.className = `status${variant ? ` status--${variant}` : ""}`;
  els.status.textContent = text;
}

async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

let scanning = false;

/** Put the panel back to "nothing scanned yet", with a message. */
function clearResults(message, variant) {
  report = null;
  els.summary.hidden = true;
  els.toolbar.hidden = true;
  els.results.replaceChildren();
  setStatus(message, variant);
}

async function runScan(targetTabId) {
  if (scanning) return;
  scanning = true;
  els.scan.disabled = true;
  setStatus("Scanning…", "busy");

  try {
    tabId = targetTabId ?? (await activeTabId());
    if (tabId === null) {
      setStatus("No active tab found. Click a page first, then scan.", "error");
      return;
    }

    const response = await chrome.runtime.sendMessage({ type: "a11yscope:scan", tabId });

    if (!response || response.error) {
      // Not having been granted access yet is the normal state of any page
      // the user has not clicked the icon on. It is an instruction, not a
      // failure, and painting it red made a working extension look broken.
      const variant = response?.code === "needs-grant" ? "hint" : "error";
      clearResults(response?.error ?? "The scan failed for an unknown reason.", variant);
      return;
    }

    report = response.report;
    render();
  } catch (error) {
    setStatus(String(error?.message ?? error), "error");
  } finally {
    scanning = false;
    els.scan.disabled = false;
  }
}

// The toolbar icon was clicked while this panel was already open: access to
// that tab has just been granted, so scan it rather than making the user click
// Scan as well.
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "a11yscope:granted") runScan(message.tabId);
});

// Results belong to one page. When the user switches tab, or the scanned tab
// navigates, the old findings would describe something no longer on screen —
// and the old grant no longer applies either.
const NEXT_PAGE_HINT =
  "Click the A11yScope icon in the toolbar to scan this page.";

chrome.tabs.onActivated.addListener(({ tabId: activated }) => {
  if (activated !== tabId) clearResults(NEXT_PAGE_HINT, "hint");
});

chrome.tabs.onUpdated.addListener((updated, change) => {
  if (updated === tabId && change.status === "loading") {
    clearResults(NEXT_PAGE_HINT, "hint");
  }
});

function render() {
  if (!report) return;

  const { summary } = report;
  els.countViolations.textContent = String(summary.violations);
  els.countReview.textContent = String(summary.review);
  els.countPassed.textContent = String(summary.rulesPassed);

  const seconds = (summary.durationMs / 1000).toFixed(summary.durationMs < 1000 ? 2 : 1);
  const stats = document.createTextNode(
    `${summary.rulesRun} checks over ${summary.elementsScanned.toLocaleString()} elements in ${seconds}s`
  );
  const url = document.createElement("span");
  url.className = "meta__url";
  url.textContent = report.url;
  url.title = report.url; // the full value stays available on hover
  els.scanMeta.replaceChildren(stats, url);

  els.summary.hidden = false;
  els.toolbar.hidden = false;
  els.status.hidden = true;

  if (report.engineErrors?.length) {
    setStatus(
      `${report.engineErrors.length} check(s) could not run on this page: ` +
        report.engineErrors.map((e) => e.id).join(", "),
      "error"
    );
  }

  renderResults();
}

function visibleRules() {
  if (!report) return [];
  switch (filter) {
    case "violations":
      return report.rules.filter((rule) => rule.violations.length > 0);
    case "review":
      return report.rules.filter((rule) => rule.review.length > 0);
    case "passed":
      return report.rules.filter((rule) => rule.passed);
    default:
      return report.rules.filter((rule) => !rule.passed);
  }
}

function renderResults() {
  const rules = visibleRules();
  els.results.replaceChildren();

  if (!rules.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    if (filter === "all" && report.summary.violations === 0 && report.summary.review === 0) {
      const big = document.createElement("span");
      big.className = "empty__big";
      big.textContent = "No automated issues found";
      empty.append(big, document.createTextNode(
        "Manual keyboard and screen reader testing is still needed before you can call this page accessible."
      ));
    } else {
      empty.textContent = "Nothing matches this filter.";
    }
    els.results.append(empty);
    return;
  }

  for (const rule of rules) {
    els.results.append(renderRule(rule));
  }
}

function renderRule(rule) {
  const wrapper = document.createElement("section");
  const state = rule.violations.length ? "fail" : rule.review.length ? "review" : "pass";
  wrapper.className = `rule rule--${state}`;

  const panelId = `panel-${rule.id}`;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "rule__toggle";
  toggle.setAttribute("aria-expanded", state === "fail" ? "true" : "false");
  toggle.setAttribute("aria-controls", panelId);

  const marker = document.createElement("span");
  marker.className = "rule__marker";
  marker.setAttribute("aria-hidden", "true");
  marker.textContent = state === "fail" ? "!" : state === "review" ? "?" : "✓";

  const body = document.createElement("div");
  body.className = "rule__body";

  const title = document.createElement("h2");
  title.className = "rule__title";
  title.textContent = rule.title;

  const tags = document.createElement("div");
  tags.className = "rule__tags";
  for (const criterion of rule.wcag) {
    tags.append(makeTag(`WCAG ${criterion}`));
  }
  tags.append(makeTag(rule.level), makeTag(rule.impact));

  body.append(title, tags);

  const count = document.createElement("span");
  count.className = "rule__count";
  const total = rule.violations.length + rule.review.length;
  count.textContent = total ? String(total) : "";
  const countLabel =
    rule.violations.length && rule.review.length
      ? `${rule.violations.length} violations, ${rule.review.length} to review`
      : rule.violations.length
        ? `${rule.violations.length} violations`
        : rule.review.length
          ? `${rule.review.length} to review`
          : "passed";
  toggle.setAttribute("aria-label", `${rule.title} — ${countLabel}`);

  toggle.append(marker, body, count);

  const panel = document.createElement("div");
  panel.id = panelId;
  panel.className = "rule__panel";
  panel.hidden = state !== "fail";

  const help = document.createElement("p");
  help.className = "rule__help";
  help.textContent = rule.help;
  panel.append(help);

  if (total) {
    const list = document.createElement("ul");
    list.className = "findings";
    for (const finding of rule.violations) list.append(renderFinding(finding, false));
    for (const finding of rule.review) list.append(renderFinding(finding, true));
    panel.append(list);
  }

  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!open));
    panel.hidden = open;
  });

  wrapper.append(toggle, panel);
  return wrapper;
}

function makeTag(text) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
}

function renderFinding(finding, isReview) {
  const item = document.createElement("li");

  const button = document.createElement("button");
  button.type = "button";
  button.className = `finding${isReview ? " finding--review" : ""}`;

  const message = document.createElement("span");
  message.className = "finding__message";
  message.textContent = finding.message;
  button.append(message);

  if (finding.data?.foreground && finding.data?.background) {
    const swatches = document.createElement("span");
    swatches.className = "swatches";
    for (const colour of [finding.data.foreground, finding.data.background]) {
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = colour;
      swatches.append(swatch);
    }
    button.append(swatches);
  }

  const snippet = document.createElement("code");
  snippet.className = "finding__snippet";
  snippet.textContent = finding.snippet;
  button.append(snippet);

  const hint = document.createElement("span");
  hint.className = "finding__hint";
  hint.textContent = "Select to highlight on the page";
  button.append(hint);

  button.addEventListener("click", () => highlight(finding, button, hint));
  item.append(button);
  return item;
}

async function highlight(finding, button, hintNode) {
  // Only one finding is on screen at a time, so only one should look selected.
  for (const other of els.results.querySelectorAll(".finding--active")) {
    other.classList.remove("finding--active");
    other.setAttribute("aria-current", "false");
  }
  button.classList.add("finding--active");
  button.setAttribute("aria-current", "true");

  if (tabId === null) tabId = await activeTabId();
  const result = await chrome.runtime.sendMessage({
    type: "a11yscope:highlight",
    tabId,
    selector: finding.selector,
  });
  if (!result?.ok) {
    hintNode.textContent = result?.reason
      ? `Could not highlight: ${result.reason}`
      : "Could not highlight this element.";
    button.classList.remove("finding--active");
    button.setAttribute("aria-current", "false");
  } else {
    hintNode.textContent = `Highlighted on the page (${result.rect.width}×${result.rect.height}px)`;
  }
}

/* ---------- filters ---------- */

for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    filter = chip.dataset.filter;
    for (const other of document.querySelectorAll(".chip")) {
      const active = other === chip;
      other.classList.toggle("chip--active", active);
      other.setAttribute("aria-pressed", String(active));
    }
    renderResults();
  });
}

/* ---------- export ---------- */

els.exportButton.addEventListener("click", async () => {
  if (!report) return;

  if (!pro) {
    setStatus(
      "Report export is a Pro feature. Everything you can see on screen is free " +
        "and always will be — Pro adds shareable reports and multi-page scans.",
      "error"
    );
    return;
  }

  const { filename, mime, content } = buildReport(report);
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
});

/* ---------- init ---------- */

els.scan.addEventListener("click", () => runScan());

(async () => {
  pro = await isPro();
  els.exportBadge.hidden = pro;

  // The panel only opens because the user clicked the toolbar icon, which is
  // also what grants access to the tab. Waiting for a second click to show
  // anything would be asking them to say the same thing twice.
  await runScan();
})();
