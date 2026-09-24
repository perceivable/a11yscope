/**
 * Keyboard, pointer, ARIA and media rules — the things that break interaction
 * rather than just perception.
 */
(() => {
  const ns = (globalThis.__A11YSCOPE__ ||= { rules: new Map(), lib: {} });
  const { rules } = ns;

  rules.set("viewport-scalable", {
    id: "viewport-scalable",
    title: "Users must be able to zoom the page",
    wcag: ["1.4.4"],
    level: "AA",
    impact: "serious",
    help:
      'Remove user-scalable="no" and raise maximum-scale to at least 5. Blocking ' +
      "pinch zoom is one of the most consequential single lines of HTML for " +
      "low-vision users, and it is trivial to fix.",
    run({ document }) {
      const meta = document.querySelector('meta[name="viewport"]');
      if (!meta) return [];
      const content = (meta.getAttribute("content") || "").toLowerCase();
      const found = [];
      if (/user-scalable\s*=\s*(no|0)/.test(content)) {
        found.push({ el: meta, message: 'Viewport sets user-scalable="no", which blocks pinch zoom' });
      }
      const max = content.match(/maximum-scale\s*=\s*([\d.]+)/);
      if (max && parseFloat(max[1]) < 2) {
        found.push({ el: meta, message: `Viewport caps maximum-scale at ${max[1]}, below the required 2` });
      }
      return found;
    },
  });

  rules.set("tabindex-positive", {
    id: "tabindex-positive",
    title: "Avoid positive tabindex values",
    wcag: ["2.4.3"],
    level: "A",
    impact: "serious",
    help:
      "A positive tabindex pulls the element ahead of everything else in the tab " +
      "order, so focus jumps around unpredictably. Order the DOM correctly and " +
      'use tabindex="0" instead.',
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        const raw = el.getAttribute("tabindex");
        if (raw === null) continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) continue;
        if (!dom.isVisible(el)) continue;
        found.push({ el, message: `tabindex="${raw}" overrides the natural tab order` });
      }
      return found;
    },
  });

  rules.set("aria-hidden-focusable", {
    id: "aria-hidden-focusable",
    title: "Focusable elements must not be aria-hidden",
    wcag: ["4.1.2"],
    level: "A",
    impact: "serious",
    help:
      "A keyboard user can still tab to the element, but a screen reader " +
      "announces nothing — focus appears to vanish. Either remove aria-hidden " +
      'or take the element out of the tab order with tabindex="-1".',
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        if (!dom.isFocusable(el)) continue;
        if (!el.closest('[aria-hidden="true"]')) continue;
        found.push({ el, message: "Element is focusable but hidden from assistive technology" });
      }
      return found;
    },
  });

  rules.set("nested-interactive", {
    id: "nested-interactive",
    title: "Interactive controls must not be nested",
    wcag: ["4.1.2"],
    level: "A",
    impact: "serious",
    help:
      "A button inside a link (or vice versa) produces an accessibility tree " +
      "that no assistive technology can represent sensibly. Put the controls " +
      "side by side instead.",
    run({ dom, elements }) {
      const found = [];
      const interactive = "a[href],button,input,select,textarea,[role='button'],[role='link'],[role='checkbox'],[role='radio'],[role='tab']";
      for (const el of elements) {
        if (!el.matches(interactive)) continue;
        if (!dom.isVisible(el)) continue;
        const parent = el.parentElement?.closest(interactive);
        if (!parent) continue;
        found.push({
          el,
          message: `<${el.tagName.toLowerCase()}> is nested inside <${parent.tagName.toLowerCase()}>`,
        });
      }
      return found;
    },
  });

  const TARGET_SELECTOR =
    "a[href],button,input,select,[role='button'],[role='link']," +
    "[role='checkbox'],[role='radio'],[role='switch'],[role='tab']";

  /**
   * The area a pointer can actually hit.
   *
   * An element's own box is not the whole story: clicks on a descendant are
   * routed to the enclosing link, so a wrapper with no height of its own is
   * still hittable wherever its image or text lands. Taking the union keeps
   * icon links measured correctly.
   *
   * When the union is still degenerate the control paints nothing — a
   * collapsed menu, a panel yet to open — and reporting "320×0px, below the
   * minimum" would be noise. The caller skips those.
   */
  function hitRect(el) {
    const own = el.getBoundingClientRect();
    let { left, top, right, bottom } = own;
    let found = own.width > 0 && own.height > 0;

    for (const child of el.querySelectorAll("*")) {
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      left = found ? Math.min(left, rect.left) : rect.left;
      top = found ? Math.min(top, rect.top) : rect.top;
      right = found ? Math.max(right, rect.right) : rect.right;
      bottom = found ? Math.max(bottom, rect.bottom) : rect.bottom;
      found = true;
    }

    if (!found) return null;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  /**
   * WCAG 2.5.8's spacing exception.
   *
   * An undersized target passes if a 24px-diameter circle centred on it does
   * not reach another target — the pointer has room to miss without hitting
   * something else. Omitting this check is what makes naive implementations
   * report dozens of failures on sites that actually conform: a 23px-tall link
   * in a generously spaced list is compliant, not broken.
   */
  function hasClearance(candidate, targets) {
    const cx = candidate.rect.left + candidate.rect.width / 2;
    const cy = candidate.rect.top + candidate.rect.height / 2;

    for (const other of targets) {
      if (other.el === candidate.el) continue;
      // Nested controls are a different failure, reported by nested-interactive.
      if (other.el.contains(candidate.el) || candidate.el.contains(other.el)) continue;

      if (other.undersized) {
        const ox = other.rect.left + other.rect.width / 2;
        const oy = other.rect.top + other.rect.height / 2;
        if (Math.hypot(ox - cx, oy - cy) < 24) return false;
      } else {
        const dx = Math.max(other.rect.left - cx, 0, cx - other.rect.right);
        const dy = Math.max(other.rect.top - cy, 0, cy - other.rect.bottom);
        if (Math.hypot(dx, dy) < 12) return false;
      }
    }
    return true;
  }

  rules.set("target-size", {
    id: "target-size",
    title: "Pointer targets should be at least 24 by 24 pixels",
    wcag: ["2.5.8"],
    level: "AA",
    impact: "moderate",
    help:
      "New in WCAG 2.2. Targets smaller than 24×24 CSS pixels are hard to hit " +
      "with a finger or an imprecise pointer. Enlarge the control, or leave " +
      "enough space around it that a 24px circle centred on it reaches no other " +
      "target. Links inside a sentence are exempt, and so are targets that " +
      "already have that clearance.",
    run({ dom, elements }) {
      const found = [];

      // Measure every target once: the spacing exception needs to know where
      // the neighbours are, not just how big this one is.
      const targets = [];
      for (const el of elements) {
        if (!el.matches(TARGET_SELECTOR)) continue;
        if (!dom.isVisible(el) || dom.isAriaHidden(el)) continue;
        if (el.disabled) continue;
        if (el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "hidden") {
          continue;
        }
        const rect = hitRect(el);
        if (!rect) continue; // paints nothing, so there is no target to measure
        targets.push({
          el,
          rect,
          undersized: rect.width < 24 || rect.height < 24,
        });
      }

      for (const candidate of targets) {
        if (!candidate.undersized) continue;
        const { el, rect } = candidate;

        const size = `${Math.round(rect.width)}×${Math.round(rect.height)}px`;
        const data = { width: Math.round(rect.width), height: Math.round(rect.height) };

        // An off-screen control (the classic skip link) is measured in its
        // hidden state, which is not the size anyone actually clicks. Report
        // the question rather than inventing an answer.
        if (dom.isVisuallyHiddenButExposed(el)) {
          found.push({
            el,
            type: "review",
            message:
              `Control is positioned off-screen and measures ${size} while hidden. ` +
              "Check its size once it becomes visible on focus.",
            data,
          });
          continue;
        }

        // Spacing exception: nothing else is within reach, so the small box is
        // not actually hard to hit. This is a clean pass, not a judgement call,
        // so it produces no finding at all.
        if (hasClearance(candidate, targets)) continue;

        // 2.5.8 exempts a target "in a sentence" — its size is dictated by the
        // surrounding line of prose, so the author cannot enlarge it without
        // breaking the text. A link sitting alone in a nav item has no such
        // excuse, so the exemption needs the parent to hold other text too.
        if (getComputedStyle(el).display === "inline" && el.tagName === "A") {
          const ownText = dom.textFrom(el);
          const surrounding = el.parentElement ? dom.textFrom(el.parentElement) : "";
          const inSentence = surrounding.replace(ownText, "").trim().length > 0;
          if (inSentence) {
            found.push({
              el,
              type: "review",
              message:
                `Link is ${size} but sits within a sentence, so 2.5.8 likely ` +
                "exempts it. Confirm the surrounding text is not itself a list of links.",
              data,
            });
            continue;
          }
        }

        found.push({
          el,
          message: `Target is ${size}, below the 24×24 minimum`,
          data,
        });
      }
      return found;
    },
  });

  rules.set("autoplay-media", {
    id: "autoplay-media",
    title: "Audio must not play automatically for more than 3 seconds",
    wcag: ["1.4.2"],
    level: "A",
    impact: "serious",
    help:
      "Unexpected audio drowns out a screen reader, making the page unusable. " +
      "Either start muted, keep it under three seconds, or give the user a " +
      "pause control at the very top of the page.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        if (el.tagName !== "AUDIO" && el.tagName !== "VIDEO") continue;
        if (!el.hasAttribute("autoplay")) continue;
        if (el.hasAttribute("muted") || el.muted) continue;
        found.push({
          el,
          message: `<${el.tagName.toLowerCase()} autoplay> plays unmuted audio without user consent`,
        });
      }
      return found;
    },
  });

  rules.set("media-captions", {
    id: "media-captions",
    title: "Video needs captions",
    wcag: ["1.2.2"],
    level: "A",
    impact: "serious",
    help:
      'Add a <track kind="captions"> to the video. Automated checking cannot ' +
      "verify caption quality or whether a platform player supplies them, so " +
      "this is flagged for review rather than failed outright.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        if (el.tagName !== "VIDEO") continue;
        if (!dom.isVisible(el)) continue;
        if (el.querySelector('track[kind="captions"],track[kind="subtitles"]')) continue;
        found.push({
          el,
          type: "review",
          message: "<video> has no <track kind=\"captions\">. Confirm captions exist.",
        });
      }
      return found;
    },
  });

  const VALID_ROLES = new Set([
    "alert", "alertdialog", "application", "article", "banner", "blockquote",
    "button", "caption", "cell", "checkbox", "code", "columnheader", "combobox",
    "command", "comment", "complementary", "composite", "contentinfo",
    "definition", "deletion", "dialog", "directory", "document", "emphasis",
    "feed", "figure", "form", "generic", "grid", "gridcell", "group", "heading",
    "img", "input", "insertion", "landmark", "link", "list", "listbox",
    "listitem", "log", "main", "mark", "marquee", "math", "menu", "menubar",
    "menuitem", "menuitemcheckbox", "menuitemradio", "meter", "navigation",
    "none", "note", "option", "paragraph", "presentation", "progressbar",
    "radio", "radiogroup", "range", "region", "roletype", "row", "rowgroup",
    "rowheader", "scrollbar", "search", "searchbox", "section", "sectionhead",
    "select", "separator", "slider", "spinbutton", "status", "strong",
    "structure", "subscript", "suggestion", "superscript", "switch", "tab",
    "table", "tablist", "tabpanel", "term", "textbox", "time", "timer",
    "toolbar", "tooltip", "tree", "treegrid", "treeitem", "widget", "window",
  ]);

  rules.set("aria-role-valid", {
    id: "aria-role-valid",
    title: "ARIA roles must be spelled correctly",
    wcag: ["4.1.2"],
    level: "A",
    impact: "serious",
    help:
      "An unrecognised role is ignored entirely, so the element falls back to " +
      "its native semantics — usually a plain <div> with none. Check the " +
      "spelling against the ARIA specification.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        const raw = el.getAttribute("role");
        if (!raw || !raw.trim()) continue;
        // role accepts a fallback list; the first valid token wins.
        const tokens = raw.trim().split(/\s+/);
        if (tokens.some((token) => VALID_ROLES.has(token.toLowerCase()))) continue;
        found.push({ el, message: `role="${raw}" is not a valid ARIA role` });
      }
      return found;
    },
  });

  const REQUIRED_ARIA = {
    checkbox: ["aria-checked"],
    radio: ["aria-checked"],
    switch: ["aria-checked"],
    combobox: ["aria-expanded"],
    slider: ["aria-valuenow"],
    spinbutton: ["aria-valuenow"],
    scrollbar: ["aria-valuenow", "aria-controls"],
    heading: ["aria-level"],
  };

  rules.set("aria-required-attr", {
    id: "aria-required-attr",
    title: "ARIA roles must include their required attributes",
    wcag: ["4.1.2"],
    level: "A",
    impact: "serious",
    help:
      "A role makes a promise about state. role=\"checkbox\" without " +
      "aria-checked leaves the screen reader with nothing to announce, so the " +
      "user cannot tell whether the box is ticked.",
    run({ dom, elements }) {
      const found = [];
      for (const el of elements) {
        const role = (el.getAttribute("role") || "").trim().toLowerCase();
        const required = REQUIRED_ARIA[role];
        if (!required) continue;
        if (!dom.isVisible(el)) continue;
        // Native elements supply the state themselves.
        if (role === "checkbox" && el.tagName === "INPUT") continue;
        if (role === "radio" && el.tagName === "INPUT") continue;
        if (role === "heading" && /^H[1-6]$/.test(el.tagName)) continue;
        const missing = required.filter((attr) => !el.hasAttribute(attr));
        if (!missing.length) continue;
        found.push({ el, message: `role="${role}" is missing ${missing.join(", ")}` });
      }
      return found;
    },
  });

  rules.set("autocomplete-attr", {
    id: "autocomplete-attr",
    title: "Personal-data fields should declare their purpose",
    wcag: ["1.3.5"],
    level: "AA",
    impact: "moderate",
    help:
      "An autocomplete token lets browsers and assistive tools fill the field, " +
      "and lets symbol-support software show the right icon. Add e.g. " +
      'autocomplete="email" or autocomplete="tel".',
    run({ dom, elements }) {
      const found = [];
      const expected = {
        email: "email",
        tel: "tel",
        "tel-national": "tel",
      };
      for (const el of elements) {
        if (el.tagName !== "INPUT") continue;
        if (!dom.isVisible(el)) continue;
        const type = (el.getAttribute("type") || "text").toLowerCase();
        if (!(type in expected)) continue;
        if (el.hasAttribute("autocomplete")) continue;
        found.push({
          el,
          message: `<input type="${type}"> has no autocomplete attribute`,
        });
      }
      return found;
    },
  });

  rules.set("focus-outline-removed", {
    id: "focus-outline-removed",
    title: "Focus must stay visible",
    wcag: ["2.4.7"],
    level: "AA",
    impact: "serious",
    help:
      "outline: none with no replacement leaves keyboard users unable to tell " +
      "where they are on the page. If you remove the default ring, add your own " +
      "visible focus style with box-shadow or a border.",
    run({ dom, elements }) {
      const found = [];
      // Only sample a bounded number of controls: this requires focusing each
      // element, which is the most expensive check in the suite.
      const controls = elements.filter((el) => dom.isFocusable(el) && dom.isVisible(el)).slice(0, 60);
      const previous = document.activeElement;
      for (const el of controls) {
        let style;
        try {
          el.focus({ preventScroll: true });
          style = getComputedStyle(el);
        } catch {
          continue;
        }
        if (document.activeElement !== el) continue;
        const noOutline =
          style.outlineStyle === "none" ||
          parseFloat(style.outlineWidth) === 0;
        if (!noOutline) continue;
        const hasAlternative =
          (style.boxShadow && style.boxShadow !== "none") ||
          parseFloat(style.borderWidth) > 0;
        if (hasAlternative) continue;
        found.push({
          el,
          type: "review",
          message: "No visible focus indicator detected when this control is focused",
        });
      }
      try {
        if (previous && previous.focus) previous.focus({ preventScroll: true });
        else document.activeElement?.blur();
      } catch {
        /* restoring focus is best-effort */
      }
      return found;
    },
  });
})();
