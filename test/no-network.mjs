/**
 * Asserts that the shipped package contains no way to reach the network and no
 * remote code execution.
 *
 * This is not a style check. Three things depend on it being true:
 *
 *   1. The Chrome Web Store data-use declaration, where we certify that no user
 *      data is collected or transmitted.
 *   2. The privacy policy at /privacy/, which states it in plain language.
 *   3. The store listing, which says scans run entirely in the browser.
 *
 * Adding a single `fetch` would make all three false at once — not a bug, a
 * false declaration to a regulator-facing store. That is not something to
 * leave to anyone's memory, so it is asserted here instead.
 *
 * Scope is the SHIP list from tools/package.mjs, because what matters is what
 * users actually receive. Test and tooling files are irrelevant.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Reuse the packaging allow-list so the two can never drift apart.
const packageSource = await readFile(join(root, "tools/package.mjs"), "utf8");
const shipMatch = packageSource.match(/const SHIP = \[([\s\S]*?)\];/);
if (!shipMatch) {
  console.error("could not read SHIP from tools/package.mjs");
  process.exit(1);
}
const SHIP = [...shipMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const TEXT_FILES = SHIP.filter((name) => [".js", ".html", ".css", ".json"].includes(extname(name)));

const FORBIDDEN = [
  { pattern: /\bfetch\s*\(/, why: "network request (fetch)" },
  { pattern: /\bXMLHttpRequest\b/, why: "network request (XHR)" },
  { pattern: /\bWebSocket\b/, why: "network connection" },
  { pattern: /\bsendBeacon\b/, why: "data exfiltration (sendBeacon)" },
  { pattern: /\bEventSource\b/, why: "network connection (SSE)" },
  { pattern: /\bimportScripts\s*\(/, why: "remote code loading" },
  { pattern: /\beval\s*\(/, why: "remote code execution" },
  { pattern: /new\s+Function\s*\(/, why: "remote code execution" },
  { pattern: /<script\s+[^>]*src\s*=\s*["']https?:/i, why: "remote script tag" },
  { pattern: /<link\s+[^>]*href\s*=\s*["']https?:/i, why: "remote stylesheet" },
  { pattern: /@import\s+url\(\s*["']?https?:/i, why: "remote stylesheet" },
];

/**
 * URLs appear legitimately as string constants — the list of pages the
 * extension refuses to scan, for instance. Only flag a URL when it is being
 * loaded, which the patterns above already express; this catches the rest.
 */
const URL_LITERAL = /https?:\/\/[^\s"'`]+/g;
const ALLOWED_URL_CONTEXT = [
  /RESTRICTED_PREFIXES/,
  /chrome\.google\.com\/webstore/,
  /chromewebstore\.google\.com/,
  /www\.w3\.org/, // XML namespaces in SVG markup
];

const problems = [];

for (const name of TEXT_FILES) {
  const source = await readFile(join(root, name), "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    // Skip comment-only lines: prose about fetch is not a fetch.
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("<!--")) return;

    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(line)) {
        problems.push(`${name}:${index + 1} — ${why}\n      ${trimmed.slice(0, 100)}`);
      }
    }

    for (const url of line.match(URL_LITERAL) ?? []) {
      const excused = ALLOWED_URL_CONTEXT.some((allowed) => allowed.test(line) || allowed.test(url));
      if (!excused) {
        problems.push(`${name}:${index + 1} — unexplained remote URL: ${url}`);
      }
    }
  });
}

// The manifest must not widen reach either.
const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
if (manifest.host_permissions?.length) {
  problems.push(`manifest.json — host_permissions requests standing access: ${manifest.host_permissions.join(", ")}`);
}
if (manifest.content_security_policy) {
  problems.push("manifest.json — a custom CSP is set; verify it does not relax the default");
}
const ALLOWED_PERMISSIONS = new Set(["activeTab", "scripting", "sidePanel", "storage"]);
for (const permission of manifest.permissions ?? []) {
  if (!ALLOWED_PERMISSIONS.has(permission)) {
    problems.push(`manifest.json — undeclared permission "${permission}"; the store justifications cover only ${[...ALLOWED_PERMISSIONS].join(", ")}`);
  }
}

console.log(`checked ${TEXT_FILES.length} shipped files and the manifest`);

if (problems.length) {
  console.log(`\nFAILED — the "no data leaves the browser" claim is no longer true:`);
  for (const problem of problems) console.log(`  · ${problem}`);
  console.log(
    "\nIf this change is intentional, the privacy policy, the store data-use\n" +
      "declaration and the listing copy all have to be corrected before release."
  );
  process.exitCode = 1;
} else {
  console.log("PASSED — no network calls, no remote code, no host permissions.");
}
