/**
 * Every finding carries a selector, and the panel's highlight is only as good
 * as that selector. A finding that cannot be pointed at is a click that does
 * nothing, which reads as the extension being broken.
 *
 * So: generate a selector for every element the engine can reach, then resolve
 * it again and check it lands on the same element. Two bugs were found this
 * way — ids emitted as `#content > main`, describing two elements where there
 * is one, and shadow boundaries that plain querySelector cannot cross.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import puppeteer from "puppeteer";
import { highlightElement } from "../src/content/highlight.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const DEPENDENCIES = ["src/lib/color.js", "src/lib/dom.js"];

const problems = [];

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--allow-file-access-from-files"],
});

try {
  for (const fixture of ["clean.html", "fixture.html"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(pathToFileURL(join(here, fixture)).href, { waitUntil: "load" });
    for (const file of DEPENDENCIES) {
      await page.evaluate(await readFile(join(root, file), "utf8"));
    }

    const result = await page.evaluate(() => {
      const dom = globalThis.__A11YSCOPE__.lib.dom;
      const checked = [];
      const failures = [];

      for (const el of dom.allElements(document)) {
        if (!dom.isVisible(el)) continue;
        const selector = dom.selectorFor(el);
        if (!selector) {
          failures.push({ tag: el.tagName.toLowerCase(), selector, why: "empty selector" });
          continue;
        }

        // Resolve it the same way the highlighter does.
        let found = null;
        let scope = document;
        try {
          for (const segment of selector.split(">>>")) {
            const step = segment.trim();
            if (!step || !scope) { found = null; break; }
            found = scope.querySelector(step);
            if (!found) break;
            scope = found.shadowRoot;
          }
        } catch (error) {
          failures.push({ tag: el.tagName.toLowerCase(), selector, why: `threw: ${error.message}` });
          continue;
        }

        checked.push(selector);
        if (found !== el) {
          failures.push({
            tag: el.tagName.toLowerCase(),
            selector,
            why: found ? "resolved to a different element" : "resolved to nothing",
          });
        }
      }
      return { total: checked.length, failures, shadow: checked.filter((s) => s.includes(">>>")).length };
    });

    console.log(
      `${fixture.padEnd(13)} → ${result.total} selectors, ` +
        `${result.shadow} crossing a shadow boundary, ${result.failures.length} bad`
    );
    for (const failure of result.failures.slice(0, 8)) {
      problems.push(`${fixture} <${failure.tag}> ${failure.why} — ${failure.selector}`);
    }

    // And prove the real highlighter works on something inside a shadow root.
    if (fixture === "clean.html") {
      const selector = await page.evaluate(() => {
        const dom = globalThis.__A11YSCOPE__.lib.dom;
        const host = document.querySelector("slotted-button");
        return host?.shadowRoot ? dom.selectorFor(host.shadowRoot.querySelector("button")) : null;
      });
      if (!selector || !selector.includes(">>>")) {
        problems.push("no shadow-crossing selector was produced for the web component fixture");
      } else {
        const outcome = await page.evaluate(highlightElement, selector);
        if (!outcome?.ok) {
          problems.push(`highlight failed inside a shadow root: ${outcome?.reason} — ${selector}`);
        } else {
          console.log(`  shadow highlight → ok, ${outcome.rect.width}×${outcome.rect.height}px`);
        }
      }
    }

    await page.close();
  }

  console.log("");
  if (problems.length) {
    console.log(`FAILED — ${problems.length} problem(s):`);
    for (const problem of problems) console.log(`  · ${problem}`);
    process.exitCode = 1;
  } else {
    console.log("PASSED — every selector resolves back to the element it came from.");
  }
} finally {
  await browser.close();
}
