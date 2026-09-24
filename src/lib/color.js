/**
 * Color math for WCAG contrast evaluation.
 *
 * Injected as a plain content script, so everything hangs off a single global
 * namespace rather than using ES module syntax.
 */
(() => {
  const ns = (globalThis.__A11YSCOPE__ ||= { rules: new Map(), lib: {} });

  const NAMED = {
    transparent: [0, 0, 0, 0],
    black: [0, 0, 0, 1],
    white: [255, 255, 255, 1],
    red: [255, 0, 0, 1],
    green: [0, 128, 0, 1],
    blue: [0, 0, 255, 1],
    gray: [128, 128, 128, 1],
    grey: [128, 128, 128, 1],
    silver: [192, 192, 192, 1],
    yellow: [255, 255, 0, 1],
    navy: [0, 0, 128, 1],
    teal: [0, 128, 128, 1],
    orange: [255, 165, 0, 1],
  };

  /**
   * Parse a CSS color string into [r, g, b, a].
   *
   * getComputedStyle normalizes nearly everything to rgb()/rgba()/color(), so
   * the hex and keyword branches only matter for values read straight off
   * attributes. Returns null when the value cannot be resolved numerically —
   * callers treat that as "needs human review" rather than guessing.
   */
  function parseColor(input) {
    if (!input) return null;
    const value = String(input).trim().toLowerCase();

    if (value in NAMED) return NAMED[value].slice();

    const rgb = value.match(
      /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/
    );
    if (rgb) {
      const channel = (raw) =>
        raw.endsWith("%")
          ? Math.round((parseFloat(raw) / 100) * 255)
          : Math.round(parseFloat(raw));
      const alpha = rgb[4] === undefined
        ? 1
        : rgb[4].endsWith("%")
          ? parseFloat(rgb[4]) / 100
          : parseFloat(rgb[4]);
      return [channel(rgb[1]), channel(rgb[2]), channel(rgb[3]), alpha];
    }

    const hex = value.match(/^#([0-9a-f]{3,8})$/);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
      if (h.length !== 6 && h.length !== 8) return null;
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
        h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      ];
    }

    return null;
  }

  /** Composite a possibly-translucent color over an opaque backdrop. */
  function flatten(color, backdrop) {
    const [r, g, b, a] = color;
    if (a >= 1) return [r, g, b, 1];
    const [br, bg, bb] = backdrop;
    return [
      Math.round(r * a + br * (1 - a)),
      Math.round(g * a + bg * (1 - a)),
      Math.round(b * a + bb * (1 - a)),
      1,
    ];
  }

  /** WCAG 2.x relative luminance. */
  function luminance([r, g, b]) {
    const channel = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  }

  /** WCAG 2.x contrast ratio, rounded to 2 decimals. */
  function contrastRatio(fg, bg) {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    return Math.round(ratio * 100) / 100;
  }

  /**
   * Required ratio under WCAG 1.4.3 (AA).
   *
   * "Large text" is >=24px, or >=18.66px when bold.
   */
  function requiredRatio(fontSizePx, fontWeight) {
    const bold = Number(fontWeight) >= 700;
    const large = fontSizePx >= 24 || (bold && fontSizePx >= 18.66);
    return large ? 3 : 4.5;
  }

  ns.lib.color = { parseColor, flatten, luminance, contrastRatio, requiredRatio };
})();
