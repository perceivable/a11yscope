/**
 * Rules for text alternatives and accessible names.
 *
 * These are the highest-yield automated checks: a control with no name is
 * unusable with a screen reader, and the failure is unambiguous, so there is
 * almost no false-positive risk.
 */
(() => {
  const ns = (globalThis.__A11YSCOPE__ ||= { rules: new Map(), lib: {} });
  const { rules } = ns;

  rules.set("img-alt", {
    id: "img-alt",
    title: "Images must have an alt attribute",
    wcag: ["1.1.1"],
    level: "A",
    impact: "critical",
    help:
      "Add alt text describing what the image conveys. If the image is purely " +
      'decorative, use alt="" so assistive technology skips it — omitting the ' +
      "attribute entirely makes screen readers read out the file name instead.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        if (el.tagName !== "IMG") continue;
        if (!dom.isVisible(el)) continue;
        if (dom.isAriaHidden(el)) continue;
        if (el.hasAttribute("alt")) continue;
        if (el.getAttribute("role") === "presentation" || el.getAttribute("role") === "none") continue;
        if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) continue;
        const src = el.getAttribute("src") || "";
        found.push({
          el,
          message: src
            ? `<img> has no alt attribute (src: ${src.split("/").pop().slice(0, 40)})`
            : "<img> has no alt attribute",
        });
      }
      return found;
    },
  });

  rules.set("img-alt-redundant", {
    id: "img-alt-redundant",
    title: "Alt text should not restate the file name or the word 'image'",
    wcag: ["1.1.1"],
    level: "A",
    impact: "moderate",
    help:
      "Describe the content or purpose of the image. File names and the words " +
      '"image", "photo" or "graphic" add nothing — the screen reader already ' +
      "announces that it is an image.",
    run({ dom, elements }) {
      const found = [];
      const filePattern = /\.(jpe?g|png|gif|svg|webp|avif|bmp)$/i;
      const fillerPattern = /^(image|img|photo|picture|graphic|icon|logo|spacer)$/i;
      for (const el of elements) {
        if (el.tagName !== "IMG") continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        const alt = (el.getAttribute("alt") || "").trim();
        if (!alt) continue;
        if (filePattern.test(alt)) {
          found.push({ el, message: `alt text looks like a file name: "${alt}"` });
        } else if (fillerPattern.test(alt)) {
          found.push({ el, message: `alt text is not descriptive: "${alt}"` });
        }
      }
      return found;
    },
  });

  rules.set("input-label", {
    id: "input-label",
    title: "Form controls must have a label",
    wcag: ["1.3.1", "4.1.2"],
    level: "A",
    impact: "critical",
    help:
      "Associate a <label for> with the control, wrap the control in a <label>, " +
      "or add aria-label / aria-labelledby. A placeholder is not a label: it " +
      "disappears as soon as the user types.",
    run({ dom, elements }) {
      const found = [];
      const skipTypes = new Set(["hidden", "submit", "reset", "button", "image"]);
      for (const el of elements) {
        const tag = el.tagName;
        if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") continue;
        if (tag === "INPUT" && skipTypes.has((el.getAttribute("type") || "text").toLowerCase())) continue;
        if (!dom.isVisible(el) && !dom.isVisuallyHiddenButExposed(el)) continue;
        if (dom.isAriaHidden(el)) continue;
        if (el.disabled) continue;
        if (dom.accessibleName(el)) continue;

        const placeholder = el.getAttribute("placeholder");
        found.push({
          el,
          message: placeholder
            ? `<${tag.toLowerCase()}> has only a placeholder ("${placeholder}"), which is not a label`
            : `<${tag.toLowerCase()}> has no accessible label`,
        });
      }
      return found;
    },
  });

  rules.set("button-name", {
    id: "button-name",
    title: "Buttons must have an accessible name",
    wcag: ["4.1.2"],
    level: "A",
    impact: "critical",
    help:
      "Icon-only buttons need aria-label, or visually hidden text inside the " +
      "button. Screen reader users otherwise hear only 'button'.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        const isButton =
          el.tagName === "BUTTON" ||
          el.getAttribute("role") === "button" ||
          (el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "button");
        if (!isButton) continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        if (dom.accessibleName(el)) continue;
        found.push({ el, message: "Button has no accessible name" });
      }
      return found;
    },
  });

  rules.set("link-name", {
    id: "link-name",
    title: "Links must have discernible text",
    wcag: ["2.4.4", "4.1.2"],
    level: "A",
    impact: "critical",
    help:
      "Give the link text that describes its destination. An image-only link " +
      "needs alt text on the image; an icon-only link needs aria-label.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        const isLink = (el.tagName === "A" && el.hasAttribute("href")) || el.getAttribute("role") === "link";
        if (!isLink) continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        if (dom.accessibleName(el)) continue;
        found.push({ el, message: "Link has no discernible text" });
      }
      return found;
    },
  });

  rules.set("link-generic-text", {
    id: "link-generic-text",
    title: "Link text should describe its destination",
    wcag: ["2.4.4"],
    level: "A",
    impact: "moderate",
    help:
      "Reported for review, not failed. WCAG 2.4.4 is Link Purpose *In Context* " +
      "— the purpose may be resolved by the surrounding paragraph, list item or " +
      'heading, so a "read more" inside an article card can still conform. What ' +
      "it costs is convenience: screen reader users often pull up a list of every " +
      "link on the page, and a list of twelve identical entries tells them " +
      "nothing. Moving the meaningful words into the link fixes that. Requiring " +
      "the text to stand alone is 2.4.9, which is Level AAA.",
    run({ dom, elements }) {
      const found = [];
      const generic = new Set([
        "click here", "here", "read more", "more", "learn more", "link",
        "this link", "details", "more info", "more information", "continue",
        "여기", "여기를 클릭", "자세히", "자세히 보기", "더보기", "더 보기", "클릭",
      ]);
      for (const el of elements) {
        if (el.tagName !== "A" || !el.hasAttribute("href")) continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        const name = dom.accessibleName(el).toLowerCase().replace(/[.!→>\s]+$/g, "").trim();
        if (!name || !generic.has(name)) continue;
        // An aria-label or title that adds context resolves the ambiguity.
        if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) continue;
        found.push({
          el,
          type: "review",
          message:
            `Link text "${dom.accessibleName(el)}" does not describe its ` +
            "destination on its own. Check whether the surrounding context makes " +
            "it clear, and whether it reads sensibly in a list of links.",
        });
      }
      return found;
    },
  });

  rules.set("iframe-title", {
    id: "iframe-title",
    title: "Frames must have a title",
    wcag: ["4.1.2", "2.4.1"],
    level: "A",
    impact: "serious",
    help:
      "Add title=\"…\" describing the frame's content, so users can decide " +
      "whether to enter it. Empty or generic titles do not help.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        if (el.tagName !== "IFRAME" && el.tagName !== "FRAME") continue;
        if (dom.isAriaHidden(el)) continue;
        // Analytics, payment and fraud-detection SDKs all inject zero-size
        // iframes. Nobody can navigate into a frame that renders nothing, so
        // demanding a title on one is noise, not a finding.
        if (!dom.isVisible(el)) continue;
        if (dom.accessibleName(el)) continue;
        const src = el.getAttribute("src") || "";
        found.push({
          el,
          message: src
            ? `<iframe> has no title (src: ${src.slice(0, 50)})`
            : "<iframe> has no title",
        });
      }
      return found;
    },
  });

  rules.set("svg-name", {
    id: "svg-name",
    title: "Meaningful SVG graphics need an accessible name",
    wcag: ["1.1.1"],
    level: "A",
    impact: "moderate",
    help:
      'If the SVG conveys information, give it role="img" plus aria-label or a ' +
      '<title> child. If it is decorative, add aria-hidden="true" so it is ' +
      "skipped rather than announced as an unlabelled graphic.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        if (el.tagName.toLowerCase() !== "svg") continue;
        if (dom.isAriaHidden(el)) continue;
        if (!dom.isVisible(el)) continue;
        if (el.getAttribute("role") === "presentation" || el.getAttribute("role") === "none") continue;
        if (el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")) continue;
        if (el.querySelector("title")) continue;
        // Inside a labelled control the parent supplies the name.
        const host = el.closest("a[href],button,[role='button'],[role='link']");
        if (host && dom.accessibleName(host)) continue;
        found.push({
          el,
          type: "review",
          message: "<svg> has no accessible name and is not marked decorative",
        });
      }
      return found;
    },
  });
})();
