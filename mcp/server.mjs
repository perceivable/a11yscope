#!/usr/bin/env node
/**
 * A11yScope as an MCP server: the same WCAG 2.2 AA engine that powers the
 * Chrome extension, exposed to AI coding agents over stdio.
 *
 * Tools
 *   scan_page   — load a URL or local HTML file in headless Chrome and scan it
 *   scan_html   — scan an HTML string (what an agent just generated)
 *   list_rules  — the checks, with the WCAG success criteria they map to
 *
 * Nothing leaves the machine: pages are loaded by a local headless Chrome and
 * the rules run inside it. No account, no telemetry.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import puppeteer from "puppeteer";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(join(here, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(here, "engine", "manifest.json"), "utf8"));
const sources = await Promise.all(manifest.files.map((f) => readFile(join(here, "engine", f), "utf8")));
const LIB_AND_RULES = sources.slice(0, -1);
const ENGINE = sources.at(-1);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const DISCLAIMER =
  "Automated checks find roughly a third of accessibility barriers. A clean result is a good sign, " +
  "not a conformance claim; items marked review need a human decision.";

/* ---------- browser ---------- */

let browserPromise = null;
function browser() {
  browserPromise ||= puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  return browserPromise;
}

async function withPage(viewport, fn) {
  const page = await (await browser()).newPage();
  try {
    await page.setViewport(viewport);
    await page.setUserAgent(UA);
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

async function runEngine(page) {
  for (const src of LIB_AND_RULES) await page.evaluate(src);
  return page.evaluate(ENGINE);
}

/* ---------- shaping ---------- */

function trimFinding(f, snippetChars) {
  return {
    selector: f.selector,
    message: f.message,
    snippet: f.snippet && f.snippet.length > snippetChars ? f.snippet.slice(0, snippetChars) + "…" : f.snippet,
  };
}

function shape(report, { includeReview, maxPerRule, includePassed }) {
  const rules = [];
  for (const rule of report.rules) {
    const hasViolations = rule.violations.length > 0;
    const hasReview = includeReview && rule.review.length > 0;
    if (!hasViolations && !hasReview && !includePassed) continue;
    const entry = {
      id: rule.id,
      title: rule.title,
      wcag: rule.wcag,
      level: rule.level,
      impact: rule.impact,
      help: rule.help,
      violationCount: rule.violations.length,
      reviewCount: rule.review.length,
    };
    if (hasViolations) entry.violations = rule.violations.slice(0, maxPerRule).map((f) => trimFinding(f, 240));
    if (hasReview) entry.review = rule.review.slice(0, maxPerRule).map((f) => trimFinding(f, 240));
    rules.push(entry);
  }
  return {
    url: report.url,
    title: report.title,
    scannedAt: report.scannedAt,
    engineVersion: manifest.engineVersion,
    summary: report.summary,
    rules,
    engineErrors: report.engineErrors,
    disclaimer: DISCLAIMER,
  };
}

function textResult(data, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError };
}

function toUrl(target) {
  if (/^https?:\/\//i.test(target)) return target;
  if (/^file:\/\//i.test(target)) return target;
  return pathToFileURL(resolve(process.cwd(), target)).href;
}

/* ---------- server ---------- */

const server = new McpServer(
  { name: "a11yscope", version: pkg.version },
  {
    instructions:
      "A11yScope checks web pages against the automatically testable parts of WCAG 2.2 Level AA " +
      "(31 checks: text alternatives, contrast, structure, keyboard/pointer/ARIA). Use scan_page for a URL " +
      "or a file on disk, scan_html for markup you just generated, list_rules to see what is checked. " +
      "Fix violations; treat review items as questions for a human. " + DISCLAIMER,
  }
);

const scanOptions = {
  include_review: z.boolean().default(false).describe("Also return items that need a human decision (not failures)."),
  include_passed: z.boolean().default(false).describe("Also list rules that passed, with zero findings."),
  max_findings_per_rule: z.number().int().min(1).max(200).default(25).describe("Cap on findings returned per rule."),
  viewport_width: z.number().int().min(320).max(3840).default(1366),
  viewport_height: z.number().int().min(320).max(2160).default(900),
};

server.registerTool(
  "scan_page",
  {
    title: "Scan a page for WCAG 2.2 AA issues",
    description:
      "Loads a URL (http/https) or a local HTML file path in headless Chrome, runs the A11yScope engine, " +
      "and returns violations grouped by rule with CSS selectors and HTML snippets. " +
      "Needs the page to be reachable from this machine.",
    inputSchema: {
      url: z.string().describe("http(s) URL, file:// URL, or a path to an HTML file (relative to the server's working directory)."),
      wait_ms: z.number().int().min(0).max(15000).default(0).describe("Extra time to wait after load, for pages that render late."),
      ...scanOptions,
    },
  },
  async ({ url, wait_ms, include_review, include_passed, max_findings_per_rule, viewport_width, viewport_height }) => {
    const target = toUrl(url);
    try {
      const report = await withPage({ width: viewport_width, height: viewport_height }, async (page) => {
        await page.goto(target, { waitUntil: "networkidle2", timeout: 45000 });
        if (wait_ms) await new Promise((r) => setTimeout(r, wait_ms));
        return runEngine(page);
      });
      return textResult(shape(report, { includeReview: include_review, includePassed: include_passed, maxPerRule: max_findings_per_rule }));
    } catch (error) {
      return textResult({ error: `Could not scan ${target}: ${error.message}` }, true);
    }
  }
);

server.registerTool(
  "scan_html",
  {
    title: "Scan an HTML string for WCAG 2.2 AA issues",
    description:
      "Renders the given HTML in headless Chrome and scans it. Use this for markup you generated or are about to write. " +
      "Pass base_url when the HTML references relative stylesheets or images that live on a server you can reach; " +
      "otherwise inline the CSS, since contrast checks depend on computed styles.",
    inputSchema: {
      html: z.string().min(1).max(5_000_000).describe("A complete HTML document or a fragment."),
      base_url: z.string().url().optional().describe("Origin to resolve relative URLs against; the HTML is served at this address."),
      ...scanOptions,
    },
  },
  async ({ html, base_url, include_review, include_passed, max_findings_per_rule, viewport_width, viewport_height }) => {
    try {
      const report = await withPage({ width: viewport_width, height: viewport_height }, async (page) => {
        if (base_url) {
          await page.setRequestInterception(true);
          page.on("request", (req) => {
            if (req.url() === base_url && req.isNavigationRequest()) {
              req.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
            } else {
              req.continue();
            }
          });
          await page.goto(base_url, { waitUntil: "networkidle2", timeout: 45000 });
        } else {
          await page.setContent(html, { waitUntil: "networkidle0", timeout: 45000 });
        }
        return runEngine(page);
      });
      return textResult(shape(report, { includeReview: include_review, includePassed: include_passed, maxPerRule: max_findings_per_rule }));
    } catch (error) {
      return textResult({ error: `Could not scan the HTML: ${error.message}` }, true);
    }
  }
);

server.registerTool(
  "list_rules",
  {
    title: "List the accessibility checks",
    description: "The 31 checks A11yScope runs, each with its WCAG 2.2 success criteria, level, impact, and how to fix it.",
    inputSchema: {},
  },
  async () => {
    try {
      const rules = await withPage({ width: 800, height: 600 }, async (page) => {
        await page.goto("about:blank");
        for (const src of LIB_AND_RULES) await page.evaluate(src);
        return page.evaluate(() =>
          [...globalThis.__A11YSCOPE__.rules.values()].map((r) => ({
            id: r.id, title: r.title, wcag: r.wcag, level: r.level, impact: r.impact, help: r.help,
          }))
        );
      });
      return textResult({ engineVersion: manifest.engineVersion, count: rules.length, rules, disclaimer: DISCLAIMER });
    } catch (error) {
      return textResult({ error: `Could not list rules: ${error.message}` }, true);
    }
  }
);

/* ---------- lifecycle ---------- */

async function shutdown() {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    await b?.close().catch(() => {});
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const transport = new StdioServerTransport();
transport.onclose = shutdown;
await server.connect(transport);
