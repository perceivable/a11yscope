/**
 * Report export (Pro).
 *
 * Markdown rather than PDF: it pastes straight into Jira, Notion, GitHub and
 * email, which is where these findings actually need to land. Generating a PDF
 * would mean bundling a renderer for a worse result.
 */

function slugForFilename(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "").replace(/[^a-z0-9]+/gi, "-");
    return (parsed.hostname + path).replace(/^-+|-+$/g, "").slice(0, 60);
  } catch {
    return "page";
  }
}

/** `t` is the panel's translator; without one the report is in English. */
export function buildReport(report, t = null) {
  const { summary } = report;
  const date = report.scannedAt.slice(0, 10);
  const lines = [];
  const text = (key, params, fallback) => (t ? t.report(key, params, fallback) : fallback);
  const ruleText = (rule) => (t ? t.rule(rule) : { title: rule.title, help: rule.help });
  const findingText = (finding) => (t ? t.finding(finding) : finding.message);

  const page = report.title || report.url;
  lines.push(`# ${text("title", { page }, `Accessibility findings — ${page}`)}`);
  lines.push("");
  lines.push(`- **${text("url", null, "URL")}:** ${report.url}`);
  lines.push(`- **${text("scanned", null, "Scanned")}:** ${report.scannedAt}`);
  lines.push(
    `- **${text("standard", null, "Standard")}:** ` +
      text("standard-value", null, "WCAG 2.2 Level AA (automated subset)")
  );
  lines.push(
    `- **${text("result", null, "Result")}:** ` +
      text(
        "result-value",
        {
          violations: summary.violations,
          review: summary.review,
          passed: summary.rulesPassed,
          run: summary.rulesRun,
        },
        `${summary.violations} violation(s), ${summary.review} item(s) needing review, ` +
          `${summary.rulesPassed} of ${summary.rulesRun} checks passed`
      )
  );
  lines.push(
    `- **${text("scope", null, "Scope")}:** ` +
      text(
        "scope-value",
        { elements: summary.elementsScanned },
        `${summary.elementsScanned} elements, top frame only`
      )
  );
  lines.push("");
  lines.push(
    "> " +
      text(
        "disclaimer",
        null,
        "Automated testing detects roughly a third of accessibility barriers. " +
          "This report is evidence of the issues listed, not evidence of conformance. " +
          "Keyboard and screen reader testing by a person is still required."
      )
  );
  lines.push("");

  const failing = report.rules.filter((rule) => rule.violations.length > 0);
  const reviewing = report.rules.filter((rule) => rule.review.length > 0);
  const selectorLabel = text("selector", null, "Selector");
  const elementLabel = text("element", null, "Element");

  if (failing.length) {
    lines.push(`## ${text("violations-heading", null, "Violations")}`);
    lines.push("");
    for (const rule of failing) {
      const { title, help } = ruleText(rule);
      lines.push(`### ${title}`);
      lines.push("");
      lines.push(
        text(
          "rule-meta",
          {
            wcag: rule.wcag.join(", "),
            level: t ? t.level(rule.level) : rule.level,
            impact: t ? t.impact(rule.impact) : rule.impact,
            count: rule.violations.length,
          },
          `**WCAG ${rule.wcag.join(", ")}** · Level ${rule.level} · ` +
            `${rule.impact} impact · ${rule.violations.length} occurrence(s)`
        )
      );
      lines.push("");
      lines.push(help);
      lines.push("");
      for (const finding of rule.violations) {
        lines.push(`- ${findingText(finding)}`);
        lines.push(`  - ${selectorLabel}: \`${finding.selector}\``);
        lines.push(`  - ${elementLabel}: \`${finding.snippet.replace(/`/g, "'")}\``);
      }
      lines.push("");
    }
  }

  if (reviewing.length) {
    lines.push(`## ${text("review-heading", null, "Needs human review")}`);
    lines.push("");
    lines.push(
      text(
        "review-intro",
        null,
        "These could not be decided automatically. Each one is a real question " +
          "that needs a person to answer — not a false alarm to dismiss."
      )
    );
    lines.push("");
    for (const rule of reviewing) {
      lines.push(`### ${ruleText(rule).title}`);
      lines.push("");
      lines.push(
        text(
          "review-meta",
          { wcag: rule.wcag.join(", "), count: rule.review.length },
          `**WCAG ${rule.wcag.join(", ")}** · ${rule.review.length} item(s)`
        )
      );
      lines.push("");
      for (const finding of rule.review) {
        lines.push(`- ${findingText(finding)}`);
        lines.push(`  - ${selectorLabel}: \`${finding.selector}\``);
      }
      lines.push("");
    }
  }

  const passed = report.rules.filter((rule) => rule.passed);
  if (passed.length) {
    lines.push(`## ${text("passed-heading", null, "Checks that passed")}`);
    lines.push("");
    for (const rule of passed) {
      lines.push(`- ${ruleText(rule).title} (WCAG ${rule.wcag.join(", ")})`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(text("generated", null, "Generated by A11yScope."));

  return {
    filename: `a11y-${slugForFilename(report.url)}-${date}.md`,
    mime: "text/markdown;charset=utf-8",
    content: lines.join("\n"),
  };
}
