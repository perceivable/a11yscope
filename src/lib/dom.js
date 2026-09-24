/**
 * DOM helpers: visibility, accessible names, focusability, and stable
 * selectors for reporting.
 */
(() => {
  const ns = (globalThis.__A11YSCOPE__ ||= { rules: new Map(), lib: {} });

  /** Elements that never render anything the user can perceive. */
  const NEVER_RENDERED = new Set([
    "SCRIPT", "STYLE", "META", "LINK", "TITLE", "HEAD", "NOSCRIPT",
    "TEMPLATE", "BASE", "PARAM", "SOURCE", "TRACK",
  ]);

  /**
   * Is this element visible to a sighted user?
   *
   * Deliberately does not treat `visibility: hidden` ancestors as a special
   * case — getComputedStyle already inherits that down the tree.
   */
  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    if (NEVER_RENDERED.has(el.tagName)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none") return false;
    if (style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (parseFloat(style.opacity) === 0) return false;
    if (el.hasAttribute("hidden")) return false;
    const rect = el.getBoundingClientRect();
    // Zero-size elements can still be meaningful if they only clip overflow,
    // but for our purposes nothing with no box is perceivable.
    if (rect.width === 0 && rect.height === 0) return false;
    return true;
  }

  /**
   * Is the element hidden from assistive technology?
   *
   * Note this is a different question from isVisible: a node can be visible
   * yet removed from the accessibility tree by aria-hidden.
   */
  function isAriaHidden(el) {
    return el.closest('[aria-hidden="true"]') !== null;
  }

  /**
   * Is this element hidden from sight but still exposed to assistive tech?
   *
   * Covers both common recipes: pushing the element off-screen, and the
   * 1px-clip trick. Both are legitimate — skip links and visually hidden
   * labels rely on them — so geometry-based rules must not read their
   * collapsed box as the size a user interacts with.
   */
  function isVisuallyHiddenButExposed(el) {
    const style = getComputedStyle(el);
    if (style.position !== "absolute" && style.position !== "fixed") return false;

    const rect = el.getBoundingClientRect();
    if (rect.right < 0 || rect.bottom < 0 || rect.left > innerWidth) return true;

    // The clip / clip-path recipe collapses the box to a pixel or less.
    if (rect.width <= 1 && rect.height <= 1) return true;
    const clipPath = style.clipPath || "";
    if (clipPath.includes("inset(50%)") || clipPath.includes("inset(100%)")) return true;
    const clip = (style.clip || "").replace(/\s/g, "");
    if (clip === "rect(0px,0px,0px,0px)" || clip === "rect(1px,1px,1px,1px)") return true;

    return false;
  }

  const FOCUSABLE_SELECTOR = [
    "a[href]", "area[href]", "button", "input", "select", "textarea",
    "iframe", "object", "embed", "summary", "audio[controls]",
    "video[controls]", "[contenteditable]", "[tabindex]",
  ].join(",");

  function isFocusable(el) {
    if (!el.matches(FOCUSABLE_SELECTOR)) return false;
    if (el.disabled) return false;
    const tabindex = el.getAttribute("tabindex");
    if (tabindex !== null && Number(tabindex) < 0) return false;
    return true;
  }

  /**
   * A descendant's own label, if it has one.
   *
   * Under accname, computing a name "from content" means recursively taking
   * each descendant's *accessible name* — not its raw text. An icon link built
   * as `<a><svg role="img" aria-label="Nvidia"></svg></a>` is correctly named;
   * a walker that only collects text nodes sees nothing and reports a link
   * with no name. That pattern is everywhere, so getting it wrong would mean
   * false positives on most well-built sites.
   */
  function descendantLabel(node) {
    const ariaLabel = node.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const labelledby = node.getAttribute("aria-labelledby");
    if (labelledby) {
      const text = labelledby
        .split(/\s+/)
        .map((id) => node.ownerDocument.getElementById(id))
        .filter(Boolean)
        // One level only: enough for real markup, and it cannot loop.
        .map((ref) => (ref.textContent || "").replace(/\s+/g, " ").trim())
        .join(" ")
        .trim();
      if (text) return text;
    }

    // Inside SVG, <title> is the accessible name — unlike the HTML <title>,
    // which is document metadata and never rendered.
    if (node.tagName.toLowerCase() === "svg") {
      const title = node.querySelector("title");
      const text = title ? (title.textContent || "").trim() : "";
      if (text) return text;
    }

    return "";
  }

  /** Text content as a screen reader would flatten it. */
  function textFrom(el) {
    if (!el) return "";
    let out = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.nodeValue;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.getAttribute("aria-hidden") === "true") continue;

        const label = descendantLabel(node);
        if (label) {
          out += " " + label + " ";
          continue;
        }

        if (node.tagName === "IMG") {
          out += " " + (node.getAttribute("alt") || "") + " ";
          continue;
        }
        if (NEVER_RENDERED.has(node.tagName)) continue;
        out += " " + textFrom(node) + " ";
      }
    }
    return out.replace(/\s+/g, " ").trim();
  }

  /**
   * Simplified accessible-name computation (W3C accname).
   *
   * Covers aria-labelledby → aria-label → native host semantics → title, which
   * is what the automated rules below actually depend on. It intentionally
   * stops short of the full recursive traversal spec: the goal is to answer
   * "does this control have any name at all", not to reproduce a screen
   * reader byte for byte.
   */
  function accessibleName(el) {
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const parts = labelledby
        .split(/\s+/)
        .map((id) => el.ownerDocument.getElementById(id))
        .filter(Boolean)
        .map((ref) => textFrom(ref));
      const joined = parts.join(" ").trim();
      if (joined) return joined;
    }

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const tag = el.tagName;

    if (tag === "IMG" || tag === "AREA") {
      const alt = el.getAttribute("alt");
      if (alt && alt.trim()) return alt.trim();
    }

    if (tag === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "submit" || type === "reset") {
        // These have a browser default label even with no value.
        return el.value || type;
      }
      if (type === "image") {
        const alt = el.getAttribute("alt");
        if (alt && alt.trim()) return alt.trim();
      }
      if (type === "button" && el.value) return el.value;
    }

    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "METER" || tag === "PROGRESS") {
      if (el.id) {
        const escaped = cssEscape(el.id);
        const label = el.ownerDocument.querySelector(`label[for="${escaped}"]`);
        if (label) {
          const text = textFrom(label);
          if (text) return text;
        }
      }
      const wrapping = el.closest("label");
      if (wrapping) {
        const text = textFrom(wrapping);
        if (text) return text;
      }
    }

    if (tag === "FIELDSET") {
      const legend = el.querySelector("legend");
      if (legend) {
        const text = textFrom(legend);
        if (text) return text;
      }
    }

    if (tag === "TABLE") {
      const caption = el.querySelector("caption");
      if (caption) {
        const text = textFrom(caption);
        if (text) return text;
      }
    }

    if (tag === "IFRAME" || tag === "FRAME") {
      const title = el.getAttribute("title");
      if (title && title.trim()) return title.trim();
      return "";
    }

    // Name-from-content roles: buttons, links, headings, and friends.
    const fromContent = textFrom(el);
    if (fromContent) return fromContent;

    const title = el.getAttribute("title");
    if (title && title.trim()) return title.trim();

    return "";
  }

  /** CSS.escape with a conservative fallback for older engines. */
  function cssEscape(value) {
    if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (c) => "\\" + c);
  }

  /**
   * Build a selector that uniquely identifies the element so the panel can
   * re-find and highlight it after the DOM has been walked.
   */
  function selectorFor(el) {
    if (el.id && el.ownerDocument.querySelectorAll(`#${cssEscape(el.id)}`).length === 1) {
      return `#${cssEscape(el.id)}`;
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      if (node.id) {
        parts.unshift(`#${cssEscape(node.id)}`);
        break;
      }
      node = parent;
    }
    return parts.join(" > ");
  }

  /** Short opening-tag snippet for display in the results list. */
  function snippetFor(el, maxLength = 120) {
    const html = el.outerHTML || "";
    const openTag = html.slice(0, html.indexOf(">") + 1) || html;
    const text = openTag.length > 1 ? openTag : html;
    return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
  }

  /** Every element in the document, descending into open shadow roots. */
  function allElements(root = document) {
    const found = [];
    const walk = (node) => {
      const children = node.querySelectorAll("*");
      for (const el of children) {
        found.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(root);
    return found;
  }

  ns.lib.dom = {
    isVisible,
    isAriaHidden,
    isVisuallyHiddenButExposed,
    isFocusable,
    accessibleName,
    textFrom,
    selectorFor,
    snippetFor,
    cssEscape,
    allElements,
    FOCUSABLE_SELECTOR,
  };
})();
