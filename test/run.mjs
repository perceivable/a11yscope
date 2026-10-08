/**
 * Runs the scan engine against two fixture pages in a real Chromium instance.
 *
 * A real browser rather than a DOM shim, because half the rules depend on
 * layout and computed styles — getBoundingClientRect and getComputedStyle are
 * exactly what a shim gets wrong, and they are what contrast and target-size
 * are built on.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer";
import { DICTIONARIES, translator } from "../src/panel/i18n.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const DEPENDENCIES = [
  "src/lib/color.js",
  "src/lib/dom.js",
  "src/rules/text-alternatives.js",
  "src/rules/contrast.js",
  "src/rules/structure.js",
  "src/rules/interaction.js",
];

/** Rules the broken fixture must trip. */
const MUST_FIRE = [
  "img-alt",
  "img-alt-redundant",
  "input-label",
  "button-name",
  "link-name",
  "iframe-title",
  "contrast-text",
  "contrast-placeholder",
  "doc-lang",
  "heading-order",
  "heading-empty",
  "landmark-main",
  "table-headers",
  "list-structure",
  "duplicate-id",
  "viewport-scalable",
  "tabindex-positive",
  "aria-hidden-focusable",
  "nested-interactive",
  "target-size",
  "autoplay-media",
  "aria-role-valid",
  "aria-required-attr",
  "autocomplete-attr",
];

/**
 * Rules that must raise a *review* item on the broken fixture rather than a
 * violation. These are judgement calls the standard leaves open — reporting
 * them as failures would be overreach.
 */
const MUST_REVIEW = ["link-generic-text", "media-captions", "svg-name"];

/** Rules that must stay quiet even on the broken page. */
const MUST_NOT_FIRE_ON_FIXTURE = ["doc-title", "page-has-h1"];

async function scan(page, fixture) {
  await page.goto(pathToFileURL(join(here, fixture)).href, { waitUntil: "load" });

  for (const file of DEPENDENCIES) {
    await page.evaluate(await readFile(join(root, file), "utf8"));
  }
  return page.evaluate(await readFile(join(root, "src/content/engine.js"), "utf8"));
}

function byId(report) {
  return new Map(report.rules.map((rule) => [rule.id, rule]));
}

const problems = [];
const note = (message) => problems.push(message);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  /* ---------- broken fixture ---------- */

  const broken = await scan(page, "fixture.html");
  const brokenRules = byId(broken);

  console.log(
    `fixture.html  → ${broken.summary.violations} violations, ` +
      `${broken.summary.review} to review, ` +
      `${broken.summary.elementsScanned} elements, ${broken.summary.durationMs}ms`
  );

  if (broken.engineErrors.length) {
    for (const failure of broken.engineErrors) {
      note(`rule "${failure.id}" threw: ${failure.error}`);
    }
  }

  for (const id of MUST_FIRE) {
    const rule = brokenRules.get(id);
    if (!rule) {
      note(`rule "${id}" is not registered`);
    } else if (rule.violations.length === 0) {
      note(`rule "${id}" found nothing on the broken fixture`);
    }
  }

  for (const id of MUST_REVIEW) {
    const rule = brokenRules.get(id);
    if (!rule) {
      note(`rule "${id}" is not registered`);
      continue;
    }
    if (rule.review.length === 0) {
      note(`rule "${id}" raised no review item on the broken fixture`);
    }
    if (rule.violations.length > 0) {
      note(`rule "${id}" reported a violation; it should only ever ask for review`);
    }
  }

  for (const id of MUST_NOT_FIRE_ON_FIXTURE) {
    const rule = brokenRules.get(id);
    if (rule && rule.violations.length > 0) {
      note(`rule "${id}" fired on the broken fixture but should not: ${rule.violations[0].message}`);
    }
  }

  // A control that paints nothing has no target to measure. Reporting a
  // zero dimension means the rule is describing a box, not a hit area.
  const targetSize = brokenRules.get("target-size");
  const degenerate = [...(targetSize?.violations ?? []), ...(targetSize?.review ?? [])]
    .find((finding) => /[×x]\s*0px|\b0\s*[×x]/.test(finding.message));
  if (degenerate) {
    note(`target-size reported a zero-area target: ${degenerate.message}`);
  }

  // The contrast rule must find the grey paragraph and leave the dark one be.
  const contrast = brokenRules.get("contrast-text");
  const matchedGrey = contrast?.violations.some((v) => v.data?.ratio && v.data.ratio < 3.2);
  if (!matchedGrey) {
    note("contrast-text did not measure the #999 paragraph at roughly 2.85:1");
  }
  const falsePositiveDark = contrast?.violations.some((v) => v.data?.foreground === "#111111");
  if (falsePositiveDark) {
    note("contrast-text flagged #111111 on white, which passes easily");
  }

  /* ---------- short non-Latin titles are descriptive ---------- */

  // "토스", "카카오", "무신사": short in characters, complete as titles. A length
  // threshold once flagged every one of them.
  for (const title of ["토스", "카카오", "楽天", "IKEA"]) {
    await page.setContent(`<!doctype html><html lang="ko"><head><title>${title}</title></head><body><main><h1>x</h1></main></body></html>`);
    for (const file of DEPENDENCIES) await page.evaluate(await readFile(join(root, file), "utf8"));
    const short = await page.evaluate(await readFile(join(root, "src/content/engine.js"), "utf8"));
    const docTitle = short.rules.find((r) => r.id === "doc-title");
    if (docTitle?.violations.length) {
      note(`doc-title flagged the short but descriptive title "${title}": ${docTitle.violations[0].message}`);
    }
  }

  /* ---------- clean fixture: the false-positive test ---------- */

  const clean = await scan(page, "clean.html");
  console.log(
    `clean.html    → ${clean.summary.violations} violations, ` +
      `${clean.summary.review} to review, ` +
      `${clean.summary.elementsScanned} elements, ${clean.summary.durationMs}ms`
  );

  if (clean.engineErrors.length) {
    for (const failure of clean.engineErrors) {
      note(`rule "${failure.id}" threw on the clean page: ${failure.error}`);
    }
  }

  // Review items on a correct page are expected, but they should be few and
  // each one should be a question a person can actually answer.
  for (const rule of clean.rules.filter((r) => r.review.length)) {
    for (const item of rule.review) {
      console.log(`  review — ${rule.id}: ${item.message}`);
    }
  }

  if (clean.summary.violations > 0) {
    for (const rule of clean.rules.filter((r) => r.violations.length)) {
      for (const violation of rule.violations) {
        note(`false positive — ${rule.id}: ${violation.message} (${violation.selector})`);
      }
    }
  }

  /* ---------- the clean fixture must still be able to fail ---------- */

  // A zero-violation page proves nothing if the scanner would stay quiet
  // whatever the page did. So break one regression guard in the way the real
  // bug appears: the closed menu stays aria-hidden but is now rendered and
  // pushed off-canvas, where its links are back in the tab order. The same
  // rule that correctly ignored it a moment ago must now report both links.
  await page.evaluate(() => {
    const menu = document.querySelector(".menu");
    // Fixed, like a real off-canvas drawer, so the rest of the page keeps its
    // layout and the only thing that changed is the menu.
    menu.style.cssText = "display:block;position:fixed;top:0;left:0;transform:translateX(-200%)";
  });
  for (const file of DEPENDENCIES) await page.evaluate(await readFile(join(root, file), "utf8"));
  const broken2 = await page.evaluate(await readFile(join(root, "src/content/engine.js"), "utf8"));
  const offCanvas = broken2.rules.find((r) => r.id === "aria-hidden-focusable");
  if ((offCanvas?.violations.length ?? 0) !== 2) {
    note(
      "aria-hidden-focusable stayed quiet on an off-canvas, still-tabbable menu " +
        `(expected 2 violations, got ${offCanvas?.violations.length ?? 0}) — ` +
        "the clean fixture's silence is not evidence of anything"
    );
  }
  const otherNew = broken2.rules.filter(
    (r) => r.id !== "aria-hidden-focusable" && r.violations.length > 0
  );
  for (const rule of otherNew) {
    note(`moving the menu off-canvas also tripped ${rule.id}: ${rule.violations[0].message}`);
  }

  /* ---------- Korean: every rule and every message has a translation ---------- */

  const ko = translator("ko");
  for (const rule of broken.rules) {
    const entry = DICTIONARIES.ko.rules[rule.id];
    if (!entry?.title || !entry?.help) note(`ko: rule "${rule.id}" has no title/help`);
  }

  // Keys the fixtures happen to trip are not the whole set, so read the rule
  // sources for every key literal and require an entry for each. The one
  // computed key (contrast-text.unmeasured-*) is spelled out by hand.
  const keyLiterals = new Set(["contrast-text.unmeasured-image", "contrast-text.unmeasured-unparseable"]);
  for (const file of DEPENDENCIES.filter((f) => f.startsWith("src/rules/"))) {
    const source = await readFile(join(root, file), "utf8");
    for (const match of source.matchAll(/key: "([^"]+)"/g)) keyLiterals.add(match[1]);
    for (const match of source.matchAll(/key: \w+ \? "([^"]+)" : "([^"]+)"/g)) {
      keyLiterals.add(match[1]);
      keyLiterals.add(match[2]);
    }
  }
  for (const key of keyLiterals) {
    if (!DICTIONARIES.ko.messages[key]) note(`ko: message key "${key}" has no translation`);
  }
  for (const key of Object.keys(DICTIONARIES.ko.messages)) {
    if (!keyLiterals.has(key)) note(`ko: translation "${key}" matches no key in the rules`);
  }

  // Every finding that actually fired must carry a key, and the Korean
  // rendering must have consumed every placeholder.
  for (const report of [broken, clean, broken2]) {
    for (const rule of report.rules) {
      for (const finding of [...rule.violations, ...rule.review]) {
        if (!finding.key) {
          note(`finding from ${rule.id} has no key: ${finding.message}`);
          continue;
        }
        const rendered = ko.finding(finding);
        if (rendered === finding.message) note(`ko: ${finding.key} fell back to English`);
        const leftover = rendered.match(/\{\w+\}/);
        if (leftover) note(`ko: ${finding.key} left ${leftover[0]} unfilled: ${rendered}`);
      }
    }
  }
  console.log(`korean        → ${Object.keys(DICTIONARIES.ko.rules).length} rules, ${keyLiterals.size} message keys`);

  /* ---------- report ---------- */

  console.log("");
  if (problems.length) {
    console.log(`FAILED — ${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  · ${problem}`);
    process.exitCode = 1;
  } else {
    console.log(`PASSED — ${MUST_FIRE.length} rules fire on the broken page, zero false positives on the clean one.`);
  }
} finally {
  await browser.close();
}
