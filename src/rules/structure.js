/**
 * Document structure rules: language, title, headings, landmarks, tables,
 * lists. These are what let a screen reader user navigate instead of reading
 * the page top to bottom.
 */
(() => {
  const ns = (globalThis.__A11YSCOPE__ ||= { rules: new Map(), lib: {} });
  const { rules } = ns;

  rules.set("doc-lang", {
    id: "doc-lang",
    title: "The page must declare its language",
    wcag: ["3.1.1"],
    level: "A",
    impact: "serious",
    help:
      'Add lang="en" (or the correct code) to the <html> element. Without it a ' +
      "screen reader reads the page with the wrong pronunciation rules, which " +
      "can make it unintelligible.",
    run({ document }) {
      const html = document.documentElement;
      const lang = (html.getAttribute("lang") || "").trim();
      if (!lang) {
        return [{ el: html, key: "doc-lang.missing", message: "<html> has no lang attribute" }];
      }
      // A primary subtag is 2-3 letters; anything else is likely a typo such as
      // lang="english".
      if (!/^[a-z]{2,3}(-[a-zA-Z0-9]{2,8})*$/i.test(lang)) {
        return [{
          el: html,
          key: "doc-lang.invalid",
          data: { lang },
          message: `<html lang="${lang}"> is not a valid language tag`,
        }];
      }
      return [];
    },
  });

  rules.set("doc-title", {
    id: "doc-title",
    title: "The page must have a descriptive title",
    wcag: ["2.4.2"],
    level: "A",
    impact: "serious",
    help:
      "The <title> is the first thing announced when the page loads and it is " +
      "what appears in the tab and in search results. It should describe this " +
      "page specifically, not just the site name.",
    run({ document }) {
      const title = (document.title || "").trim();
      const target = document.querySelector("title") || document.documentElement;
      if (!title) {
        return [{ el: target, key: "doc-title.missing", message: "<title> is missing or empty" }];
      }
      // No length test. WCAG 2.4.2 asks that a title describe the page, not
      // that it be long, and "토스" or "카카오" is a perfectly descriptive
      // homepage title — two Hangul syllables carry what "Toss" does. An
      // earlier character-count threshold failed most Korean homepages.
      if (/^(untitled|document|home|new page|index)$/i.test(title)) {
        return [{
          el: target,
          key: "doc-title.placeholder",
          data: { title },
          message: `<title> "${title}" is a placeholder`,
        }];
      }
      return [];
    },
  });

  rules.set("heading-order", {
    id: "heading-order",
    title: "Heading levels must not skip",
    wcag: ["1.3.1"],
    level: "A",
    impact: "moderate",
    help:
      "Going from <h2> straight to <h4> breaks the outline that screen reader " +
      "users navigate by. Use the next level down, and style it with CSS if you " +
      "need it to look smaller.",
    run({ dom, elements }) {
      const found = [];
      const headings = elements.filter((el) => {
        if (!/^H[1-6]$/.test(el.tagName)) return false;
        return dom.isVisible(el) && !dom.isAriaHidden(el);
      });
      let previous = 0;
      for (const el of headings) {
        const level = Number(el.tagName[1]);
        if (previous && level > previous + 1) {
          found.push({
            el,
            key: "heading-order.skip",
            data: { from: previous, to: level },
            message: `Heading level jumps from h${previous} to h${level}`,
          });
        }
        previous = level;
      }
      return found;
    },
  });

  rules.set("heading-empty", {
    id: "heading-empty",
    title: "Headings must not be empty",
    wcag: ["1.3.1", "2.4.6"],
    level: "A",
    impact: "serious",
    help:
      "An empty heading is announced as a heading with no content, which is " +
      "confusing. If you only need spacing, use CSS instead of a heading element.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        if (!/^H[1-6]$/.test(el.tagName) && el.getAttribute("role") !== "heading") continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        if (dom.accessibleName(el)) continue;
        found.push({
          el,
          key: "heading-empty.empty",
          data: { tag: el.tagName.toLowerCase() },
          message: `<${el.tagName.toLowerCase()}> is empty`,
        });
      }
      return found;
    },
  });

  rules.set("page-has-h1", {
    id: "page-has-h1",
    title: "The page should have exactly one top-level heading",
    wcag: ["1.3.1"],
    level: "Best practice",
    impact: "moderate",
    help:
      "A single <h1> naming the page gives every other heading something to " +
      "hang off. Multiple h1 elements leave users unsure what the page is about.",
    run({ dom, elements, document }) {
      const h1s = elements.filter(
        (el) => el.tagName === "H1" && dom.isVisible(el) && !dom.isAriaHidden(el)
      );
      if (h1s.length === 0) {
        return [{
          el: document.body || document.documentElement,
          key: "page-has-h1.none",
          message: "Page has no <h1>",
        }];
      }
      if (h1s.length > 1) {
        return h1s.slice(1).map((el) => ({
          el,
          key: "page-has-h1.multiple",
          data: { count: h1s.length },
          message: `Page has ${h1s.length} <h1> elements; only the first should be top level`,
        }));
      }
      return [];
    },
  });

  rules.set("landmark-main", {
    id: "landmark-main",
    title: "The page should have a main landmark",
    wcag: ["1.3.1", "2.4.1"],
    level: "Best practice",
    impact: "moderate",
    help:
      "Wrapping the primary content in <main> lets screen reader users jump " +
      "straight past the navigation with a single keystroke.",
    run({ dom, elements, document }) {
      const mains = elements.filter(
        (el) => (el.tagName === "MAIN" || el.getAttribute("role") === "main") && !dom.isAriaHidden(el)
      );
      if (mains.length === 0) {
        return [{
          el: document.body || document.documentElement,
          key: "landmark-main.none",
          message: "No <main> element or role=\"main\" on the page",
        }];
      }
      if (mains.length > 1) {
        return mains.slice(1).map((el) => ({
          el,
          key: "landmark-main.multiple",
          data: { count: mains.length },
          message: `Page has ${mains.length} main landmarks; there should be one`,
        }));
      }
      return [];
    },
  });

  rules.set("skip-link", {
    id: "skip-link",
    title: "Provide a way to skip repeated navigation",
    wcag: ["2.4.1"],
    level: "A",
    impact: "moderate",
    help:
      'A "skip to main content" link as the first focusable element saves ' +
      "keyboard users from tabbing through the whole menu on every page. It can " +
      "be visually hidden until focused.",
    run({ dom, elements, document }) {
      const hasLandmark = elements.some(
        (el) => el.tagName === "MAIN" || el.getAttribute("role") === "main"
      );
      const anchors = elements.filter((el) => el.tagName === "A" && el.getAttribute("href")?.startsWith("#"));
      const looksLikeSkip = anchors.some((el) => {
        const name = dom.accessibleName(el).toLowerCase();
        return /skip|jump|본문|바로가기/.test(name);
      });
      if (looksLikeSkip) return [];

      // Without a main landmark there is also nothing to skip to, so report the
      // combination once rather than twice.
      return [{
        el: document.body || document.documentElement,
        type: "review",
        key: hasLandmark ? "skip-link.none" : "skip-link.none-no-main",
        message: hasLandmark
          ? "No skip link found. Verify keyboard users can bypass the navigation."
          : "No skip link and no main landmark found. Keyboard users cannot bypass repeated content.",
      }];
    },
  });

  rules.set("table-headers", {
    id: "table-headers",
    title: "Data tables must have header cells",
    wcag: ["1.3.1"],
    level: "A",
    impact: "serious",
    help:
      "Use <th> for header cells so screen readers can announce which row and " +
      'column a value belongs to. If the table is only there for layout, add ' +
      'role="presentation" instead.',
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        if (el.tagName !== "TABLE") continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        const role = el.getAttribute("role");
        if (role === "presentation" || role === "none") continue;
        if (el.querySelector("th")) continue;

        const rows = el.querySelectorAll("tr");
        const cells = el.querySelectorAll("td");
        // A single-row, single-cell table is almost certainly layout markup.
        if (rows.length < 2 || cells.length < 2) continue;

        found.push({
          el,
          key: "table-headers.none",
          data: { rows: rows.length },
          message: `Table with ${rows.length} rows has no <th> header cells`,
        });
      }
      return found;
    },
  });

  rules.set("list-structure", {
    id: "list-structure",
    title: "Lists must contain only list items",
    wcag: ["1.3.1"],
    level: "A",
    impact: "moderate",
    help:
      "<ul> and <ol> may only contain <li> (plus <script> and <template>). " +
      "Stray elements break the item count that screen readers announce.",
    run({ dom, elements }) {
      const found = [];
      const allowed = new Set(["LI", "SCRIPT", "TEMPLATE"]);
      for (const el of elements) {
        if (el.tagName !== "UL" && el.tagName !== "OL") continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        const strays = [...el.children].filter((child) => !allowed.has(child.tagName));
        if (!strays.length) continue;
        found.push({
          el,
          key: "list-structure.stray",
          data: { tag: el.tagName.toLowerCase(), child: strays[0].tagName.toLowerCase() },
          message:
            `<${el.tagName.toLowerCase()}> contains ` +
            `<${strays[0].tagName.toLowerCase()}> as a direct child instead of <li>`,
        });
      }
      return found;
    },
  });

  rules.set("duplicate-id", {
    id: "duplicate-id",
    title: "IDs referenced by ARIA must be unique",
    wcag: ["4.1.1 (removed in WCAG 2.2)"],
    level: "Best practice",
    impact: "moderate",
    help:
      "WCAG 2.2 retired the blanket duplicate-id requirement, but a duplicate " +
      "id that is the target of aria-labelledby, aria-describedby or label[for] " +
      "still breaks the association — the browser resolves only the first match.",
    run({ document, elements }) {
      const byId = new Map();
      for (const el of elements) {
        const id = el.id;
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, []);
        byId.get(id).push(el);
      }

      // Only flag duplicates that something actually points at.
      const referenced = new Set();
      for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]) {
        for (const el of document.querySelectorAll(`[${attr}]`)) {
          for (const token of (el.getAttribute(attr) || "").split(/\s+/)) {
            if (token) referenced.add(token);
          }
        }
      }
      for (const label of document.querySelectorAll("label[for]")) {
        referenced.add(label.getAttribute("for"));
      }

      const found = [];
      for (const [id, list] of byId) {
        if (list.length < 2) continue;
        if (!referenced.has(id)) continue;
        found.push({
          el: list[1],
          key: "duplicate-id.referenced",
          data: { id, count: list.length },
          message: `id="${id}" appears ${list.length} times and is referenced by ARIA or a label`,
        });
      }
      return found;
    },
  });
})();
