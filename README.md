# A11yScope

A Chrome extension that checks the current page against the automatable subset
of WCAG 2.2 Level AA, and explains each finding in terms a developer can act on.

Built to stay honest about its own limits: automated tooling catches roughly a
third of real accessibility barriers, and the UI says so rather than implying a
clean scan means compliance.

## Design constraints

These are not incidental — they shape every decision in the codebase.

- **No backend.** Everything runs in the page and the side panel. There is no
  server to pay for, and no scan data leaves the browser.
- **No build step.** Plain ES modules and classic scripts, loaded directly by
  Chrome. `npm` is used only for the test runner.
- **`activeTab`, not host permissions.** The extension can read a page only
  after the user explicitly scans it. This keeps the install-time permission
  warning minimal, which matters for both review and conversion.
- **No runtime dependencies.** Nothing in `SHIP` comes from `node_modules`.

## Layout

```
manifest.json               MV3 manifest
src/lib/color.js            contrast maths, alpha compositing
src/lib/dom.js              visibility, accessible names, selectors
src/rules/                  the checks, grouped by theme
src/content/engine.js       runs every rule, returns a serialisable report
src/content/highlight.js    injected highlighter (serialised into the page)
src/background/             service worker: tab access and injection
src/panel/                  side panel UI, report export
tools/make_icons.py         draws the PNG icons
tools/package.mjs           builds the Web Store zip from an allow-list
test/                       fixtures and the Chromium-backed test runner
```

## Rules

31 checks across four groups. Each reports either a **violation** (the failure
is unambiguous) or a **review** item (a real question a human has to answer —
never a guess dressed up as a result).

| Group | Checks |
| --- | --- |
| Text alternatives | `img-alt`, `img-alt-redundant`, `input-label`, `button-name`, `link-name`, `link-generic-text`, `iframe-title`, `svg-name` |
| Contrast | `contrast-text`, `contrast-placeholder` |
| Structure | `doc-lang`, `doc-title`, `heading-order`, `heading-empty`, `page-has-h1`, `landmark-main`, `skip-link`, `table-headers`, `list-structure`, `duplicate-id` |
| Interaction | `viewport-scalable`, `tabindex-positive`, `aria-hidden-focusable`, `nested-interactive`, `target-size`, `autoplay-media`, `media-captions`, `aria-role-valid`, `aria-required-attr`, `autocomplete-attr`, `focus-outline-removed` |

Where a value cannot be determined — text over a background image, a
`::placeholder` colour, a control hidden off-screen until focused — the rule
reports it for review instead of inventing a number. A scanner that cries wolf
on correct markup is worse than no scanner.

Some rules only ever ask for review, because the standard itself leaves room for
judgement. `link-generic-text` is the clearest case: WCAG 2.4.4 is Link Purpose
*In Context*, so a "read more" whose meaning comes from the surrounding card
conforms. Demanding that link text stand alone is 2.4.9, which is Level AAA.

## Calibration

Precision is checked against real sites, not just the fixtures. `gov.uk` is the
control: it is a well-known example of careful accessibility work, so anything
we report there is a false positive until proven otherwise.

```
node tools/scan.mjs https://www.gov.uk        # expect 0 violations
node tools/scan.mjs https://stripe.com --review
```

Three real defects were found this way, each of which would have produced
failures across most of the web:

1. **The 2.5.8 spacing exception was missing.** Undersized targets are exempt
   when a 24px circle centred on them reaches no other target. Without it,
   gov.uk reported 72 violations; with it, zero.
2. **Text hidden by `text-indent: -5000px` + `overflow: hidden` was measured for
   contrast.** That is the standard way to give an icon button a screen reader
   label. The text is never painted, so its contrast is meaningless. The engine
   now measures the text node with a Range and checks it survives every clipping
   ancestor.
3. **Accessible names ignored `aria-label` on descendants.** An icon link built
   as `<a><svg role="img" aria-label="Nvidia"></svg></a>` is correctly named, but
   a walker that only collects text nodes sees nothing. This alone accounted for
   30 bogus "link has no discernible text" findings on stripe.com.

Each fix has a regression case in `test/clean.html`.

## Known limitations

- **Top frame only.** Content inside `<iframe>` is not scanned.
- **One moment in time.** Text revealed by animation, carousel slides that are
  off-stage, and hover or focus states are measured in whatever state the page
  is in when you scan. Text painted in exactly its background colour is reported
  for review rather than failed, because that is nearly always an animation
  waiting to run.
- **`mix-blend-mode` and gradient text.** Contrast over a gradient is reported
  for review; text composited with a blend mode may still produce a ratio that
  does not match what is on screen.
- **No conformance claim.** Automated rules cover roughly a third of WCAG.
  Whether alt text is accurate, whether a keyboard user can finish a task,
  whether the page makes sense read aloud — none of that is testable here.

## Development

```bash
npm install          # puppeteer, for the tests only
npm test             # rule engine against both fixtures
node test/extension.mjs   # loads the real extension into Chromium
npm run icons        # regenerate PNGs from tools/make_icons.py
npm run package      # build dist/a11yscope-<version>.zip
```

### Loading it locally

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select this directory
4. Open any page, click the A11yScope toolbar icon, then **Scan this page**

### Tests

`test/fixture.html` is a deliberately broken page; every rule in `MUST_FIRE`
has to find something in it. `test/clean.html` is correct markup and must
produce **zero** violations — that second assertion is the one that keeps the
tool trustworthy, and it has already caught one false positive during
development.
