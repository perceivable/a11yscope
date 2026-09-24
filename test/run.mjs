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
