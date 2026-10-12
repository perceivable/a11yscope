/**
 * Drives the real server over stdio with the MCP client SDK, the way an agent
 * would, and checks the three tools against the extension's own fixtures.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const mcpRoot = join(here, "..");
const fixtures = join(mcpRoot, "..", "test");
const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); console.log(`${ok ? "ok " : "FAIL"} ${what}`); };

const transport = new StdioClientTransport({ command: process.execPath, args: [join(mcpRoot, "server.mjs")], stderr: "pipe" });
transport.stderr?.on("data", (d) => process.stderr.write(`[server] ${d}`));
const client = new Client({ name: "a11yscope-test", version: "0" });
await client.connect(transport);

const parse = (result) => JSON.parse(result.content[0].text);
const call = (name, args = {}) => client.callTool({ name, arguments: args }, undefined, { timeout: 120000 });

try {
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  check(JSON.stringify(tools) === JSON.stringify(["list_rules", "scan_html", "scan_page"]), `tools: ${tools.join(", ")}`);

  const rules = parse(await call("list_rules"));
  check(rules.count === 31 && rules.rules.every((r) => r.id && r.title && r.wcag.length && r.help), `list_rules → ${rules.count} rules with wcag + help`);

  const broken = parse(await call("scan_page", { url: join(fixtures, "fixture.html"), include_review: true }));
  check(broken.summary?.violations > 20, `scan_page fixture.html → ${broken.summary?.violations} violations, ${broken.summary?.review} review`);
  check(broken.rules.some((r) => r.id === "img-alt" && r.violations?.length), "fixture: img-alt violation present");
  check(broken.rules.every((r) => (r.violations || []).every((f) => f.selector && f.message)), "every finding has selector + message");
  check(typeof broken.disclaimer === "string" && /third/.test(broken.disclaimer), "result carries the disclaimer");
  check(broken.engineErrors.length === 0, "no engine errors");

  const clean = parse(await call("scan_page", { url: join(fixtures, "clean.html") }));
  check(clean.summary?.violations === 0, `scan_page clean.html → ${clean.summary?.violations} violations`);
  check(clean.rules.length === 0, "clean: no rules listed when nothing fired (include_passed=false)");

  const snippet = parse(await call("scan_html", {
    html: '<!doctype html><html lang="en"><head><title>t</title></head><body><main><h1>Hi</h1><img src="a.png" width="120" height="80"><a href="/x"></a></main></body></html>',
  }));
  const ids = (snippet.rules || []).map((r) => r.id);
  check(ids.includes("img-alt") && ids.includes("link-name"), `scan_html → fires ${ids.join(", ")}`);

  check(!(snippet.notes || []).some((n) => /fragment/.test(n)) && (snippet.notes || []).some((n) => /stylesheet/.test(n)), "full document without CSS → stylesheet note only");

  // The deletion loophole: fixing img-alt by removing the <img> must not look like a pass.
  const before = parse(await call("scan_html", { html: '<main><img src="a.png" width="120" height="80"><iframe title="ad" src="about:blank"></iframe></main>', include_passed: true }));
  const imgBefore = before.rules.find((r) => r.id === "img-alt");
  check(imgBefore?.status === "failed" && imgBefore.checked === 1, `one image, no alt → img-alt ${imgBefore?.status}, checked ${imgBefore?.checked}`);
  check((before.notes || []).some((n) => /fragment/.test(n)) && before.summary.iframesNotEntered === 1 && before.notes.some((n) => /iframe/.test(n)), "fragment + iframe → notes say fragment and frame not entered");
  const hidden = parse(await call("scan_html", { html: '<main><img src="a.png" width="120" height="80" aria-hidden="true"></main>', include_passed: true }));
  const imgHidden = hidden.rules.find((r) => r.id === "img-alt");
  check(imgHidden?.status === "passed" && imgHidden.checked === 1 && imgHidden.excluded === 1, `image hidden with aria-hidden → img-alt ${imgHidden?.status}, checked ${imgHidden?.checked}, excluded ${imgHidden?.excluded}`);
  check(imgBefore.excluded === 0, `visible image → excluded ${imgBefore.excluded}`);
  const after = parse(await call("scan_html", { html: "<main></main>", include_passed: true }));
  const imgAfter = after.rules.find((r) => r.id === "img-alt");
  check(imgAfter?.status === "inapplicable" && imgAfter.checked === 0, `image deleted → img-alt ${imgAfter?.status}, checked ${imgAfter?.checked}`);
  check(after.summary.rulesNotApplicable > 10 && after.summary.rulesPassed + after.summary.rulesNotApplicable + after.summary.rulesFailed <= 31, `empty fragment → ${after.summary.rulesPassed} passed, ${after.summary.rulesNotApplicable} not applicable`);
  check(before.rules.every((r) => ["failed", "review", "passed", "inapplicable"].includes(r.status) && (r.status === "inapplicable") === (r.checked === 0)), "status and checked agree on every rule");

  const capped = parse(await call("scan_page", { url: join(fixtures, "fixture.html"), max_findings_per_rule: 1 }));
  check(capped.rules.every((r) => (r.violations || []).length <= 1 && r.violationCount >= (r.violations || []).length), "max_findings_per_rule caps output but keeps counts");

  const bad = await call("scan_page", { url: "http://127.0.0.1:9/nothing" });
  check(bad.isError === true && /Could not scan/.test(bad.content[0].text), "unreachable URL → isError with message");
} finally {
  await client.close();
}

if (problems.length) { console.error(`\n${problems.length} problem(s)`); process.exit(1); }
console.log("\nmcp server: all checks passed");
