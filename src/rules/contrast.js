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
   * Pull the colour stops out of a CSS gradient.
   *
   * Text over a gradient is usually reported as unmeasurable, which is honest
   * but noisy — gradient headers are everywhere, and a page with one can
   * produce dozens of "check this by hand" items. Yet the stops are right
   * there in the computed value, and if the text clears the requirement
   * against *every* stop then it clears it everywhere along the gradient,
   * whatever the geometry. That is a proof, not a guess.
   *
   * Returns null when the value is not a pure gradient, mixes in a bitmap, or
   * uses a translucent stop — in those cases the layers underneath matter and
   * the honest answer is still "cannot measure".
   */
  function gradientStops(backgroundImage, color) {
    if (!/gradient\(/i.test(backgroundImage)) return null;
    if (/url\(/i.test(backgroundImage)) return null;

    const tokens = backgroundImage.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi);
    if (!tokens || !tokens.length) return null;

    const stops = [];
    for (const token of tokens) {
      const parsed = color.parseColor(token);
      if (!parsed) return null;
      if (parsed[3] < 1) return null; // needs the layers below; give up
      stops.push(parsed);
    }
    return stops;
  }

  /**
   * Walk up from `el` compositing background layers until an opaque one is
   * found. Returns a flat colour, a set of gradient stops, or the reason it is
   * unresolvable.
   */
  function resolveBackground(el, color) {
    const layers = [];
    let node = el;

    while (node && node.nodeType === Node.ELEMENT_NODE) {
      const style = getComputedStyle(node);

      if (style.backgroundImage && style.backgroundImage !== "none") {
        const stops = gradientStops(style.backgroundImage, color);
        if (stops) return { stops, element: node };
        return { unresolved: "background image", why: "image", element: node };
      }

      const bg = color.parseColor(style.backgroundColor);
      if (bg === null) {
        return {
          unresolved: `unparseable background "${style.backgroundColor}"`,
          why: "unparseable",
          element: node,
        };
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

    // The sr-only recipe (1px box, overflow hidden, clip: rect(0 0 0 0)) can
    // leave a single pixel of overlap when the glyphs happen to start at the
    // box corner, so a hairline does not count as painted. `clip` and a full
    // clip-path inset hide the text outright.
    const HAIRLINE = 1;
    const shows = (box) =>
      Math.min(rect.right, box.right) - Math.max(rect.left, box.left) > HAIRLINE &&
      Math.min(rect.bottom, box.bottom) - Math.max(rect.top, box.top) > HAIRLINE;

    for (let node = el; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/^inset\((50|100)%\)$/.test(style.clipPath)) return false;
      const bounds = node.getBoundingClientRect();
      if ((style.position === "absolute" || style.position === "fixed") && /^rect\(/.test(style.clip)) {
        const [t, r, b, l] = style.clip
          .slice(5, -1)
          .split(/[\s,]+/)
          .map((v) => (v === "auto" ? null : parseFloat(v)));
        const box = {
          left: bounds.left + (l ?? 0),
          top: bounds.top + (t ?? 0),
          right: r == null ? bounds.right : bounds.left + r,
          bottom: b == null ? bounds.bottom : bounds.top + b,
        };
        if (!shows(box)) return false;
      }
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      if (!shows(bounds)) return false;
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
        if (!textIsPainted(el) || dom.isFadedOut(el)) continue;

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
            key: `contrast-text.unmeasured-${backdrop.why}`,
            message:
              `Contrast could not be measured (${backdrop.unresolved}). ` +
              `Check "${text.slice(0, 40)}" by hand — needs ${required}:1.`,
            data: { required, foreground: style.color, sample: text.slice(0, 40) },
          });
          continue;
        }

        // Over a gradient: measure against every stop. Clearing the requirement
        // at all of them clears it everywhere along the gradient, so that is a
        // silent pass. Failing at one only means it might fail where the text
        // happens to sit, which is a question for a person.
        if (backdrop.stops) {
          let worst = Infinity;
          let worstStop = backdrop.stops[0];
          for (const stop of backdrop.stops) {
            const over = fg[3] < 1 ? color.flatten(fg, stop) : fg;
            const stopRatio = color.contrastRatio(over, stop);
            if (stopRatio < worst) {
              worst = stopRatio;
              worstStop = stop;
            }
          }
          if (worst >= required) continue; // provably fine at every stop

          const toHexStop = (c) =>
            "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");
          found.push({
            el,
            type: "review",
            key: "contrast-text.gradient",
            message:
              `Over a gradient. Contrast falls to ${worst}:1 at the stop it ` +
              `contrasts least with (${toHexStop(worstStop)}), below the required ` +
              `${required}:1. Whether the text actually sits over that part of ` +
              "the gradient depends on the layout — check by eye.",
            data: {
              ratio: worst,
              required,
              foreground: style.color,
              background: toHexStop(worstStop),
              sample: text.slice(0, 60),
            },
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
            key: "contrast-text.invisible",
            message:
              `Text is the same colour as its background (${toHex(flatFg)}), so it ` +
              "is currently invisible. Check its contrast in the state where it " +
              "is actually shown.",
            data: { ratio, required, foreground: toHex(flatFg), background: toHex(backdrop.color) },
          });
          continue;
        }

        // Near-white text resolved against a light background means the real
        // backdrop was missed, not that someone shipped white on cream. The
        // dark layer is usually a sibling — an absolutely positioned overlay —
        // or a ::before, and neither is an ancestor, so walking up the tree
        // cannot find it. Saying "1.11:1" here would be a confident wrong
        // answer; saying what we could not see is the honest one.
        if (color.luminance(flatFg) > 0.75 && color.luminance(backdrop.color) > 0.4) {
          found.push({
            el,
            type: "review",
            key: "contrast-text.light-on-light",
            message:
              `Light text (${toHex(flatFg)}) resolved against a light background ` +
              `(${toHex(backdrop.color)}). There is probably a darker layer behind ` +
              "it that cannot be read from the element's ancestors — a positioned " +
              "overlay or a pseudo-element. Check this one by eye.",
            data: { ratio, required, foreground: toHex(flatFg), background: toHex(backdrop.color) },
          });
          continue;
        }

        found.push({
          el,
          key: "contrast-text.below",
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
      "Placeholders are content, so the 4.5:1 rule applies to them too. Note " +
      "that a placeholder is not a label either — it disappears as soon as the " +
      "user types.",
    run({ dom, color, elements }) {
      const found = [];
      for (const el of elements) {
        if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") continue;
        const placeholder = el.getAttribute("placeholder");
        if (!placeholder || !placeholder.trim()) continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;

        // Chrome exposes the ::placeholder computed colour, including its own
        // default when the page sets none, so this is measurable rather than a
        // question to hand back to the user.
        let pseudo;
        try {
          pseudo = getComputedStyle(el, "::placeholder");
        } catch {
          pseudo = null;
        }
        const raw = pseudo && pseudo.color;
        const fg = raw ? color.parseColor(raw) : null;
        if (!fg) {
          found.push({
            el,
            type: "review",
            key: "contrast-placeholder.unmeasured",
            data: { sample: placeholder.slice(0, 40) },
            message:
              `Placeholder "${placeholder.slice(0, 40)}" could not be measured — ` +
              "this browser does not expose the ::placeholder colour. Check by hand.",
          });
          continue;
        }

        // Some engines dim the placeholder with opacity rather than colour.
        const pseudoOpacity = pseudo.opacity === "" ? 1 : parseFloat(pseudo.opacity);
        if (Number.isFinite(pseudoOpacity)) fg[3] *= pseudoOpacity;
        if (fg[3] === 0) continue;

        const style = getComputedStyle(el);
        const fontSize = parseFloat(style.fontSize) || 16;
        const required = color.requiredRatio(fontSize, style.fontWeight);

        const backdrop = resolveBackground(el, color);
        if (backdrop.unresolved || backdrop.stops) {
          found.push({
            el,
            type: "review",
            key: "contrast-placeholder.unmeasured-bg",
            message:
              `Placeholder "${placeholder.slice(0, 40)}" sits on a background ` +
              "that cannot be measured. Check it by hand.",
            data: { required, sample: placeholder.slice(0, 40) },
          });
          continue;
        }

        const flatFg = fg[3] < 1 ? color.flatten(fg, backdrop.color) : fg;
        const ratio = color.contrastRatio(flatFg, backdrop.color);
        if (ratio >= required) continue;

        const toHex = (c) =>
          "#" + c.slice(0, 3).map((v) => v.toString(16).padStart(2, "0")).join("");

        found.push({
          el,
          key: "contrast-placeholder.below",
          message:
            `Placeholder "${placeholder.slice(0, 30)}" has contrast ${ratio}:1, ` +
            `below the required ${required}:1 (${toHex(flatFg)} on ${toHex(backdrop.color)})`,
          data: {
            ratio,
            required,
            foreground: toHex(flatFg),
            background: toHex(backdrop.color),
            sample: placeholder.slice(0, 30),
          },
        });
      }
      return found;
    },
  });

  ns.lib.contrast = { resolveBackground };
})();
