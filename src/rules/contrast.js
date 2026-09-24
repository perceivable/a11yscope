/**
 * Colour contrast rules (WCAG 1.4.3 and 1.4.11).
 *
 * Contrast is the single most common real-world failure, and also the check
 * most likely to produce nonsense if implemented naively. Two decisions keep
 * the output trustworthy:
 *
 *   1. Backgrounds are resolved by compositing every translucent layer up the
 *      ancestor chain, not by reading one backgroundColor.
 *   2. When the backdrop cannot be determined numerically — a background image,
 *      a gradient, a video behind the text — the finding is reported as "needs
 *      review" rather than as a violation. Guessing here would be worse than
 *      saying nothing.
 */
(() => {
  const ns = (globalThis.__A11YSCOPE__ ||= { rules: new Map(), lib: {} });
  const { rules } = ns;

  const WHITE = [255, 255, 255, 1];

  /**
   * Walk up from `el` compositing background layers until an opaque one is
   * found. Returns either a flat colour or the reason it is unresolvable.
   */
  function resolveBackground(el, color) {
    const layers = [];
    let node = el;

    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const style = getComputedStyle(node);

      if (style.backgroundImage && style.backgroundImage !== "none") {
        return { unresolved: "background image or gradient", element: node };
      }

      const bg = color.parseColor(style.backgroundColor);
      if (bg === null) {
        return { unresolved: `unparseable background "${style.backgroundColor}"`, element: node };
      }
      if (bg[3] > 0) {
        layers.push(bg);
        if (bg[3] >= 1) break;
      }
      node = node.parentElement;
    }

    // Nothing opaque anywhere up the chain: the canvas shows through, which the
    // browser paints white unless the page says otherwise.
    let result = WHITE.slice();
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      result = color.flatten(layers[i], result);
    }
    return { color: result };
  }

  /** Does this element render text of its own (not just its children's)? */
  function ownText(el) {
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) return node.nodeValue.trim();
    }
    return "";
  }

  /**
   * Is the element's own text actually painted where a user can see it?
   *
   * Measuring the element's box is not enough. The standard way to build an
   * icon button is to keep real text for screen readers and push it out of
   * view with `text-indent: -5000px` and `overflow: hidden` — the box is
   * visible, the text is not. Judging that text's contrast is meaningless, and
   * reporting it is how a scanner ends up claiming that gov.uk fails.
   *
   * So measure the text node itself with a Range, then confirm it survives
   * every clipping ancestor.
   */
  function textIsPainted(el) {
    const range = el.ownerDocument.createRange();
    let rect = null;

    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.nodeValue.trim()) continue;
      range.selectNodeContents(node);
      const candidate = range.getBoundingClientRect();
      if (candidate.width > 0 || candidate.height > 0) {
        rect = candidate;
        break;
      }
    }
    if (!rect) return false;

    for (let node = el; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const bounds = node.getBoundingClientRect();
      const overlapX = Math.min(rect.right, bounds.right) - Math.max(rect.left, bounds.left);
      const overlapY = Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, bounds.top);
      if (overlapX <= 0 || overlapY <= 0) return false;
    }
    return true;
  }

  rules.set("contrast-text", {
    id: "contrast-text",
    title: "Text must meet the minimum contrast ratio",
    wcag: ["1.4.3"],
    level: "AA",
    impact: "serious",
    help:
      "WCAG AA requires 4.5:1 for normal text and 3:1 for large text (24px, or " +
      "18.66px when bold). Darken the text or lighten the background until the " +
      "ratio is met — this is the most frequently cited failure in " +
      "accessibility complaints.",
    run({ dom, color, elements }) {
      const found = [];
      const seen = new Set();

      for (const el of elements) {
        const text = ownText(el);
        if (!text) continue;
        if (el.closest("svg")) continue; // svg uses fill, not color
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        if (!textIsPainted(el)) continue;

        const style = getComputedStyle(el);
        const fg = color.parseColor(style.color);
        if (!fg) continue;
        if (fg[3] === 0) continue; // fully transparent text

        const fontSize = parseFloat(style.fontSize) || 16;
        const required = color.requiredRatio(fontSize, style.fontWeight);

        const backdrop = resolveBackground(el, color);
        const selectorKey = dom.selectorFor(el);
        if (seen.has(selectorKey)) continue;
        seen.add(selectorKey);

        if (backdrop.unresolved) {
          found.push({
            el,
            type: "review",
            message:
              `Contrast could not be measured (${backdrop.unresolved}). ` +
              `Check "${text.slice(0, 40)}" by hand — needs ${required}:1.`,
            data: { required, foreground: style.color },
          });
          continue;
        }

        const flatFg = fg[3] < 1 ? color.flatten(fg, backdrop.color) : fg;
        const ratio = color.contrastRatio(flatFg, backdrop.color);
        if (ratio >= required) continue;

        const toHex = (c) =>
          "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");

        // Text painted in exactly its background colour is not a contrast
        // problem, it is invisible — almost always a caption revealed by
        // animation, or a slide waiting off-stage. Calling that a 1:1 contrast
        // failure tells the developer nothing useful about the state a user
        // actually sees.
        if (ratio === 1) {
          found.push({
            el,
            type: "review",
            message:
              `Text is the same colour as its background (${toHex(flatFg)}), so it ` +
              "is currently invisible. Check its contrast in the state where it " +
              "is actually shown.",
            data: { ratio, required, foreground: toHex(flatFg), background: toHex(backdrop.color) },
          });
          continue;
        }

        found.push({
          el,
          message:
            `Contrast ${ratio}:1 is below the required ${required}:1 ` +
            `(${toHex(flatFg)} on ${toHex(backdrop.color)}, ${Math.round(fontSize)}px)`,
          data: {
            ratio,
            required,
            foreground: toHex(flatFg),
            background: toHex(backdrop.color),
            fontSize: Math.round(fontSize),
            sample: text.slice(0, 60),
          },
        });
      }
      return found;
    },
  });

  rules.set("contrast-placeholder", {
    id: "contrast-placeholder",
    title: "Placeholder text must meet contrast requirements",
    wcag: ["1.4.3"],
    level: "AA",
    impact: "moderate",
    help:
      "Grey-on-white placeholder text is one of the most common failures. " +
      "Placeholders are content, so the 4.5:1 rule applies to them too.",
    run({ dom, color, elements }) {
      const found = [];
      for (const el of elements) {
        if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") continue;
        const placeholder = el.getAttribute("placeholder");
        if (!placeholder || !placeholder.trim()) continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;

        // ::placeholder is not readable from getComputedStyle in a way we can
        // rely on across engines, so report it as a manual check rather than
        // inventing a number.
        const backdrop = resolveBackground(el, color);
        found.push({
          el,
          type: "review",
          message:
            `Placeholder "${placeholder.slice(0, 40)}" needs manual contrast ` +
            "verification — ::placeholder colour cannot be read programmatically",
          data: { background: backdrop.color ? backdrop.color : null },
        });
      }
      return found;
    },
  });

  ns.lib.contrast = { resolveBackground };
})();
