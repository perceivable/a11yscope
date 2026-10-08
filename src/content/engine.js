/**
 * Scan orchestrator. Runs every registered rule against the live document and
 * returns a structure that survives being passed across the extension message
 * boundary (no DOM references).
 *
 * Injected last, after lib/* and rules/*.
 */
(() => {
  const ns = (globalThis.__A11YSCOPE__ ||= { rules: new Map(), lib: {} });

  const SEVERITY_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

  function serialize(finding, dom) {
    const el = finding.el;
    return {
      selector: dom.selectorFor(el),
      snippet: dom.snippetFor(el),
      tag: el.tagName ? el.tagName.toLowerCase() : "#document",
      message: finding.message || "",
      // Which message this is, so the panel can say it in the user's language.
      // The English `message` stays the record of truth for tools and tests.
      key: finding.key || null,
      data: finding.data || null,
    };
  }

  ns.run = function run() {
    const startedAt = performance.now();
    const dom = ns.lib.dom;
    const color = ns.lib.color;
    const elements = dom.allElements(document);
    const ctx = { dom, color, elements, document };

    const ruleResults = [];
    const failures = [];

    for (const rule of ns.rules.values()) {
      let findings;
      try {
        findings = rule.run(ctx) || [];
      } catch (error) {
        failures.push({ id: rule.id, error: String(error && error.message ? error.message : error) });
        continue;
      }

      const violations = [];
      const review = [];
      for (const finding of findings) {
        if (!finding || !finding.el) continue;
        const serialized = serialize(finding, dom);
        if (finding.type === "review") review.push(serialized);
        else violations.push(serialized);
      }

      ruleResults.push({
        id: rule.id,
        title: rule.title,
        wcag: rule.wcag,
        level: rule.level,
        impact: rule.impact,
        help: rule.help,
        violations,
        review,
        passed: violations.length === 0 && review.length === 0,
      });
    }

    ruleResults.sort((a, b) => {
      const aEmpty = a.violations.length === 0;
      const bEmpty = b.violations.length === 0;
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      const severity = (SEVERITY_ORDER[a.impact] ?? 9) - (SEVERITY_ORDER[b.impact] ?? 9);
      if (severity !== 0) return severity;
      return b.violations.length - a.violations.length;
    });

    const violationCount = ruleResults.reduce((sum, r) => sum + r.violations.length, 0);
    const reviewCount = ruleResults.reduce((sum, r) => sum + r.review.length, 0);

    return {
      url: location.href,
      title: document.title,
      scannedAt: new Date().toISOString(),
      frameNote: window.top !== window ? "subframe" : "top",
      summary: {
        violations: violationCount,
        review: reviewCount,
        rulesRun: ruleResults.length,
        rulesFailed: ruleResults.filter((r) => r.violations.length > 0).length,
        rulesPassed: ruleResults.filter((r) => r.passed).length,
        elementsScanned: elements.length,
        durationMs: Math.round(performance.now() - startedAt),
      },
      rules: ruleResults,
      engineErrors: failures,
    };
  };

  return ns.run();
})();
