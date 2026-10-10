# a11yscope-mcp

WCAG 2.2 AA checks for AI coding agents. The same engine as the
[A11yScope Chrome extension](https://chromewebstore.google.com/detail/ldbmeaihgdlghenedbhafkfikefnmicb),
exposed as an MCP server so Claude Code, Cursor, Claude Desktop and other MCP
clients can audit the pages they build and fix what they find.

Runs locally in headless Chrome. Nothing is uploaded, no account, no telemetry.

## Install

**Claude Code**

```bash
claude mcp add a11yscope -- npx -y a11yscope-mcp
```

**Cursor / Claude Desktop / any MCP client** — add to the MCP config:

```json
{
  "mcpServers": {
    "a11yscope": {
      "command": "npx",
      "args": ["-y", "a11yscope-mcp"]
    }
  }
}
```

First run downloads a Chrome for Testing build (~150 MB) through Puppeteer.
Node 20 or newer.

## Tools

| Tool | What it does |
|---|---|
| `scan_page` | Loads a URL or a local HTML file in headless Chrome and returns violations grouped by rule, each with a CSS selector, an HTML snippet and a message that says what to change. |
| `scan_html` | Same, for an HTML string the agent just generated. Pass `base_url` if the markup references stylesheets on a reachable server; otherwise inline the CSS, since contrast checks need computed styles. |
| `list_rules` | The 31 checks, each with its WCAG 2.2 success criteria, level, impact and fix guidance. |

Options on both scan tools: `include_review` (items that need a human
decision), `include_passed`, `max_findings_per_rule`, viewport size.
`scan_page` also takes `wait_ms` for pages that render late.

Typical prompt: *"Scan http://localhost:3000 with a11yscope and fix every
violation, then scan again."*

## What it checks

Text alternatives (images, form labels, buttons, links, frames, SVG), colour
contrast with the large-text and bold exemptions applied and translucent
backgrounds composited, document structure (language, title, headings, main
landmark, skip link, tables, lists, duplicate ids), and keyboard, pointer and
ARIA (zoom lock, positive tabindex, aria-hidden focusable, nested interactive
controls, 24×24 target size, autoplay, captions, invalid roles, required ARIA
states, autocomplete, focus visibility).

Calibrated against sites built by accessibility practitioners: gov.uk,
webaim.org, deque.com, a11yproject.com and w3.org/WAI all report zero
violations. Anything reported there is treated as our bug until proven
otherwise, and false-positive reports are the most useful thing you can send.

## What it does not do

Automated checks find roughly a third of accessibility barriers. A clean
result is a good sign, not a conformance claim. Whether alt text is accurate,
whether a page makes sense in a screen reader, whether a keyboard user can
finish a task — no tool can answer those, and this one does not pretend to.
Anything it cannot decide comes back as `review`, not as pass or fail. It is
not a substitute for an expert evaluation and does not certify compliance
with the EAA, ADA, KWCAG or any other standard.

## Licence

Copyright © 2026 Perceivable. Free to install and run, including commercially,
through npm and MCP clients. The engine source is published so that "nothing
leaves your machine" can be verified rather than trusted; it is not open
source, and no licence is granted to copy, modify or redistribute it or to
publish derivative works. Problems and false positives:
<https://github.com/perceivable/a11yscope/issues>.
