/**
 * Injected via chrome.scripting.executeScript({ func, args }).
 *
 * Because the function is serialized and re-parsed inside the page, it must be
 * completely self-contained: no imports, no closure variables, no shared
 * constants from this module.
 */
export function highlightElement(selector) {
  const OVERLAY_ID = "__a11yscope_highlight__";

  document.getElementById(OVERLAY_ID)?.remove();
  if (!selector) return { ok: false, reason: "no selector" };

  let target;
  try {
    target = document.querySelector(selector);
  } catch {
    return { ok: false, reason: "invalid selector" };
  }
  if (!target) return { ok: false, reason: "element is no longer on the page" };

  target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });

  const rect = target.getBoundingClientRect();
  const box = document.createElement("div");
  box.id = OVERLAY_ID;
  box.setAttribute("aria-hidden", "true");
  Object.assign(box.style, {
    position: "fixed",
    left: `${Math.max(rect.left - 3, 0)}px`,
    top: `${Math.max(rect.top - 3, 0)}px`,
    width: `${Math.max(rect.width + 6, 10)}px`,
    height: `${Math.max(rect.height + 6, 10)}px`,
    border: "3px solid #d81b60",
    borderRadius: "3px",
    boxShadow: "0 0 0 3px rgba(216, 27, 96, 0.3)",
    pointerEvents: "none",
    zIndex: "2147483647",
    transition: "opacity 240ms ease-out",
  });
  document.body.appendChild(box);

  // Fade rather than vanish, so the eye can follow where it was.
  setTimeout(() => {
    box.style.opacity = "0";
    setTimeout(() => box.remove(), 280);
  }, 2400);

  return {
    ok: true,
    rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
  };
}
